import { encryptControlReference } from './control-reference-codec'
import { sharedControlWritesEnabled } from './shared-control-records'
import type { Prisma } from '@prisma/client'
import { gzipSync, gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { canonicalHash, canonicalHashObjectParts, canonicalJsonBytes, retainImmutableCanonicalValue, hasImmutableCanonicalValue } from './canonical'
import { BoundedArtifactCache, artifactContentKey, jsonArtifactBytes } from './bounded-artifact-cache'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from './security'
import { parseVersionedFrozenScaleRuntimeSnapshot, type VersionedFrozenScaleRuntimeSnapshot } from './runtime-snapshot'

const MAX_PLAIN_BYTES = 2 * 1024 * 1024
const MAX_CIPHER_BYTES = 4 * 1024 * 1024
const referenceSchema = z.object({ kind: z.literal('SHARED_SCALE_RUNTIME'), storageVersion: z.literal(1),
  artifactHash: z.string().regex(/^[0-9a-f]{64}$/), frozenAt: z.string().datetime({ offset: true }),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
const bodySchema = z.object({ kind: z.literal('SCALE_RUNTIME_ARTIFACT'), storageVersion: z.literal(1),
  artifactHash: z.string().regex(/^[0-9a-f]{64}$/), codec: z.literal('gzip-json-v1'),
  plaintextBytes: z.number().int().positive().max(MAX_PLAIN_BYTES), data: z.string().max(MAX_CIPHER_BYTES) }).strict()
type SharedReference = z.infer<typeof referenceSchema>
type Artifact = Omit<VersionedFrozenScaleRuntimeSnapshot, 'frozenAt' | 'snapshotHash'>
export type SharedScaleArtifactRecord = { artifactHash: string; formatVersion: number; plaintextBytes: number; payloadEncrypted: string }
export interface SharedScaleArtifactRepository {
  find(hash: string): Promise<SharedScaleArtifactRecord | null>
  // Resolve only after this independent append commits. Never cache existence
  // from an uncommitted enclosing participant transaction.
  insert(record: SharedScaleArtifactRecord): Promise<boolean>
}
export type SharedScaleArtifactDb = Pick<Prisma.TransactionClient, '$queryRaw'>
type VerifiedArtifact = { artifactHash: string; artifact: Artifact; plainBytes: number; committed: boolean; record?: SharedScaleArtifactRecord }
const staticPart = (snapshot: VersionedFrozenScaleRuntimeSnapshot): Artifact => {
  const { frozenAt: _date, snapshotHash: _hash, ...artifact } = snapshot
  return artifact
}
export const isSharedScaleRuntimeReference = (value: unknown): boolean => (
  Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'SHARED_SCALE_RUNTIME')
)

export const createSharedScaleRuntimeStore = (repository: SharedScaleArtifactRepository) => {
  const artifacts = new BoundedArtifactCache<VerifiedArtifact>(64, 8 * 1024 * 1024)
  const contentIndex = new BoundedArtifactCache<string>(128, 64 * 1024)
  const pending = new Map<string, Promise<VerifiedArtifact>>()
  const single = (key: string, work: () => Promise<VerifiedArtifact>): Promise<VerifiedArtifact> => {
    const known = pending.get(key)
    if (known) return known
    if (pending.size >= 64) return work()
    const promise = work(); pending.set(key, promise)
    void promise.finally(() => { if (pending.get(key) === promise) pending.delete(key) }).catch(() => {})
    return promise
  }
  const retain = (entry: VerifiedArtifact) => {
    artifacts.set(entry.artifactHash, entry, entry.plainBytes * 6 + (entry.record?.payloadEncrypted.length ?? 0) * 2 + 2048)
    return entry
  }
  const verifyStatic = (raw: unknown, expectedHash: string, plainBytes: number, committed: boolean): VerifiedArtifact => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid shared Scale artifact')
    const artifact = raw as Artifact
    if ('frozenAt' in artifact || 'snapshotHash' in artifact) throw new Error('Shared Scale artifact contains attempt fields')
    if (canonicalHash({ storageVersion: 1, artifact }) !== expectedHash) throw new Error('Shared Scale artifact content hash mismatch')
    const unsigned = { ...artifact, frozenAt: '2000-01-01T00:00:00.000Z' }
    const parsed = parseVersionedFrozenScaleRuntimeSnapshot({ ...unsigned, snapshotHash: canonicalHash(unsigned) })
    const verified = staticPart(parsed)
    if (canonicalHash({ storageVersion: 1, artifact: verified }) !== expectedHash) throw new Error('Shared Scale artifact normalization mismatch')
    // Scientific content only: no participant, authorization, epoch, lease,
    // answer, result or per-attempt timestamp in the process-wide cache.
    retainImmutableCanonicalValue(verified)
    retainImmutableCanonicalValue(verified.definition); retainImmutableCanonicalValue(verified.compiledRuntime)
    if (parsed.schemaVersion === 2) retainImmutableCanonicalValue(parsed.compiledPolicy)
    retainImmutableCanonicalValue(verified.referenceBindings)
    return { artifactHash: expectedHash, artifact: verified, plainBytes, committed }
  }
  const decode = (row: SharedScaleArtifactRecord, expectedHash: string): VerifiedArtifact => {
    if (row.artifactHash !== expectedHash || row.formatVersion !== 1 || row.payloadEncrypted.length > MAX_CIPHER_BYTES
      || row.plaintextBytes < 1 || row.plaintextBytes > MAX_PLAIN_BYTES) throw new Error('Invalid shared Scale artifact record')
    const body = bodySchema.parse(decryptUnifiedRuntimePayload<unknown>(row.payloadEncrypted))
    if (body.artifactHash !== expectedHash || body.plaintextBytes !== row.plaintextBytes) throw new Error('Shared Scale artifact metadata mismatch')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data)) throw new Error('Invalid shared Scale artifact encoding')
    const compressed = Buffer.from(body.data, 'base64')
    if (compressed.toString('base64') !== body.data) throw new Error('Invalid shared Scale artifact encoding')
    const bytes = gunzipSync(compressed, { maxOutputLength: MAX_PLAIN_BYTES })
    if (bytes.length !== body.plaintextBytes) throw new Error('Shared Scale artifact size mismatch')
    return { ...verifyStatic(JSON.parse(bytes.toString('utf8')), expectedHash, bytes.length, true), record: row }
  }
  const reconstruct = (entry: VerifiedArtifact, reference: Omit<SharedReference,'storageVersion'|'snapshotHash'> & {storageVersion:1|2;snapshotHash?:string}): VersionedFrozenScaleRuntimeSnapshot => {
    const unsigned = { ...entry.artifact, frozenAt: reference.frozenAt }
    const snapshotHash = canonicalHashObjectParts(unsigned)
    if (reference.snapshotHash && snapshotHash !== reference.snapshotHash) throw new Error('Shared Scale runtime snapshot hash mismatch')
    return { ...unsigned, snapshotHash } as VersionedFrozenScaleRuntimeSnapshot
  }
  // Confirmation never blocks a participant transaction or consumes a new
  // connection pool. A rolled-back append can never become an existence hit.
  const confirming = new Set<string>()
  const confirmCommitted = (hash: string): void => {
    if (confirming.has(hash) || confirming.size >= 64) return
    confirming.add(hash)
    setImmediate(() => {
      void (async () => {
        try {
          const row = await repository.find(hash)
          if (row) retain(decode(row, hash))
        } catch { /* Confirmation is optional; the next writer still appends. */ }
        finally { confirming.delete(hash) }
      })()
    })
  }
  const save = async (snapshot: VersionedFrozenScaleRuntimeSnapshot,
    transactionRepository?: SharedScaleArtifactRepository,
  ): Promise<string> => {
    const raw = staticPart(snapshot)
    const fastParts = sharedControlWritesEnabled() && hasImmutableCanonicalValue(raw.definition)
      && hasImmutableCanonicalValue(raw.compiledRuntime)
      && (raw.schemaVersion === 1 || hasImmutableCanonicalValue((raw as any).compiledPolicy))
    // Frozen children already passed the exact canonical encoder. Encode all
    // dynamic/scalar fields every time, hashing the same actual complete value.
    let content = fastParts ? null : jsonArtifactBytes(raw)
    if (!fastParts && (!content || content.length > MAX_PLAIN_BYTES)) throw new Error('Shared Scale artifact exceeds JSON size limit')
    const key = fastParts ? 'parts:' + canonicalHashObjectParts(raw) : artifactContentKey(content!)
    const indexed = contentIndex.get(key)
    let entry = indexed ? artifacts.get(indexed) : undefined
    if (fastParts && !entry) {
      content = jsonArtifactBytes(raw)
      if (!content || content.length > MAX_PLAIN_BYTES) throw new Error('Shared Scale artifact exceeds JSON size limit')
    }
    if (transactionRepository && !entry?.committed) {
      // Use the SAME transaction connection as the personal attempt. Sharing
      // uncommitted existence across requests could leave dangling references.
      if (!entry) {
        const hash = canonicalHash({ storageVersion: 1, artifact: raw })
        const bytes = canonicalJsonBytes(raw)
        if (bytes.length > MAX_PLAIN_BYTES) throw new Error('Shared Scale artifact exceeds canonical size limit')
        entry = verifyStatic(raw, hash, bytes.length, false)
        entry.record = { artifactHash: hash, formatVersion: 1, plaintextBytes: bytes.length,
          payloadEncrypted: encryptUnifiedRuntimePayload({ kind: 'SCALE_RUNTIME_ARTIFACT', storageVersion: 1,
            artifactHash: hash, codec: 'gzip-json-v1', plaintextBytes: bytes.length,
            data: gzipSync(bytes, { level: 1 }).toString('base64') }) }
      }
      reconstruct(entry, referenceSchema.parse({ kind: 'SHARED_SCALE_RUNTIME', storageVersion: 1,
        artifactHash: entry.artifactHash, frozenAt: snapshot.frozenAt, snapshotHash: snapshot.snapshotHash }))
      if (!entry.record) throw new Error('Shared Scale artifact append payload is missing')
      const inserted = await transactionRepository.insert(entry.record)
      if (!inserted) {
        const existing = await transactionRepository.find(entry.artifactHash)
        if (!existing) throw new Error('Shared Scale artifact append could not be confirmed in transaction')
        entry = { ...decode(existing, entry.artifactHash), committed: false }
      }
      contentIndex.set(key, entry.artifactHash, 256); retain(entry); confirmCommitted(entry.artifactHash)
    } else if (!entry?.committed) entry = await single('save:' + key, async () => {
      const currentHash = contentIndex.get(key)
      const known = currentHash ? artifacts.get(currentHash) : undefined
      if (known?.committed) return known
      const hash = canonicalHash({ storageVersion: 1, artifact: raw })
      const canonicalBytes = canonicalJsonBytes(raw)
      if (canonicalBytes.length > MAX_PLAIN_BYTES) throw new Error('Shared Scale artifact exceeds canonical size limit')
      let verified = verifyStatic(raw, hash, canonicalBytes.length, false)
      reconstruct(verified, referenceSchema.parse({ kind: 'SHARED_SCALE_RUNTIME', storageVersion: 1,
        artifactHash: hash, frozenAt: snapshot.frozenAt, snapshotHash: snapshot.snapshotHash }))
      const payloadEncrypted = encryptUnifiedRuntimePayload({ kind: 'SCALE_RUNTIME_ARTIFACT', storageVersion: 1,
        artifactHash: hash, codec: 'gzip-json-v1', plaintextBytes: canonicalBytes.length,
        data: gzipSync(canonicalBytes, { level: 1 }).toString('base64') })
      const inserted = await repository.insert({ artifactHash: hash, formatVersion: 1, plaintextBytes: canonicalBytes.length, payloadEncrypted })
      if (!inserted) {
        const existing = await repository.find(hash)
        if (!existing) throw new Error('Shared Scale artifact append could not be confirmed')
        verified = decode(existing, hash)
      }
      verified.committed = true; contentIndex.set(key, hash, 256); return retain(verified)
    })
    const reference = referenceSchema.parse({ kind: 'SHARED_SCALE_RUNTIME', storageVersion: 1,
      artifactHash: entry.artifactHash, frozenAt: snapshot.frozenAt, snapshotHash: snapshot.snapshotHash })
    reconstruct(entry, reference)
    const encrypted = sharedControlWritesEnabled()
      ? encryptControlReference({kind:'SHARED_SCALE_RUNTIME',storageVersion:2,artifactHash:reference.artifactHash,frozenAt:reference.frozenAt})
      : encryptUnifiedRuntimePayload(reference)
    if (Buffer.byteLength(encrypted) > 4096) throw new Error('Shared Scale reference exceeds versioned storage bound')
    return encrypted
  }
  const load = async (value: unknown, transactionRepository?: SharedScaleArtifactRepository): Promise<VersionedFrozenScaleRuntimeSnapshot> => {
    const compact = value as any
    const reference = compact?.storageVersion === 2
      ? { ...referenceSchema.omit({ snapshotHash: true }).extend({ storageVersion: z.literal(2) }).parse(value), snapshotHash: undefined }
      : referenceSchema.parse(value)
    let entry = artifacts.get(reference.artifactHash)
    const read = async () => {
      const known = artifacts.get(reference.artifactHash)
      if (known?.committed) return known
      const row = await (transactionRepository ?? repository).find(reference.artifactHash)
      if (!row) throw new Error('Shared Scale runtime artifact is missing; restore it before retrying')
      const verified = decode(row, reference.artifactHash)
      if (transactionRepository) verified.committed = false
      return retain(verified)
    }
    if (!entry) entry = transactionRepository ? await read() : await single('load:' + reference.artifactHash, read)
    if (!entry.committed) confirmCommitted(entry.artifactHash)
    return reconstruct(entry, reference)
  }
  return { save, load, stats: () => ({ artifacts: artifacts.stats(), contentIndex: contentIndex.stats(), inFlight: pending.size }) }
}

export const sharedScaleArtifactRepositoryForDatabase = (db: SharedScaleArtifactDb): SharedScaleArtifactRepository => ({
  async find(hash) {
    const rows = await db.$queryRaw<SharedScaleArtifactRecord[]>`SELECT artifact_hash AS "artifactHash", format_version AS "formatVersion",
      plaintext_bytes AS "plaintextBytes", payload_encrypted AS "payloadEncrypted" FROM assessment_runtime_artifacts WHERE artifact_hash = ${hash}`
    return rows[0] ?? null
  },
  async insert(row) {
    const rows = await db.$queryRaw<Array<{ artifact_hash: string }>>`WITH artifact_append_guard AS MATERIALIZED
      (SELECT pg_advisory_xact_lock(62512, 16010))
      INSERT INTO assessment_runtime_artifacts
      (artifact_hash, format_version, plaintext_bytes, payload_encrypted)
      SELECT ${row.artifactHash}, ${row.formatVersion}, ${row.plaintextBytes}, ${row.payloadEncrypted}
      FROM artifact_append_guard WHERE true
      ON CONFLICT (artifact_hash) DO NOTHING RETURNING artifact_hash`
    return rows.length === 1
  },
})
const repository: SharedScaleArtifactRepository = {
  async find(hash) { return sharedScaleArtifactRepositoryForDatabase((await import('../../config/database')).prisma).find(hash) },
  async insert(row) { return sharedScaleArtifactRepositoryForDatabase((await import('../../config/database')).prisma).insert(row) },
}
export const sharedScaleRuntimeStore = createSharedScaleRuntimeStore(repository)
