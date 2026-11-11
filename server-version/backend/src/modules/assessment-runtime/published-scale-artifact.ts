import { gzipSync, gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { withStartNestedQueryRawLabel } from '../../services/runtimeObservability'
import { canonicalHash, canonicalJsonBytes, retainImmutableCanonicalValue } from './canonical'
import { BoundedArtifactCache } from './bounded-artifact-cache'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from './security'
import { createFrozenScaleRuntimeSnapshot } from './runtime-snapshot'
import { type SharedScaleArtifactDb, type SharedScaleArtifactRecord } from './shared-scale-runtime'
import type { FrozenScaleInstruction } from './frozen-scale-instruction'
import { frozenScalePresentationSchema, type FrozenScalePresentation } from '../scale/scale-presentation'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'

/** Format 3: publish-time STATIC Scale content for an ordinary Training
 * publication. Reference bindings, deployment policy and frozenAt stay live at
 * START and are never part of this artifact. Content-addressed and immutable. */
export const PUBLISHED_SCALE_ARTIFACT_FORMAT = 3 as const
const MAX_PLAIN_BYTES = 2 * 1024 * 1024
const MAX_CIPHER_BYTES = 4 * 1024 * 1024
const digest = z.string().regex(/^[0-9a-f]{64}$/)
const bodySchema = z.object({ kind: z.literal('SCALE_PUBLISHED_STATIC'), storageVersion: z.literal(3), artifactHash: digest,
  codec: z.literal('gzip-json-v1'), plaintextBytes: z.number().int().positive().max(MAX_PLAIN_BYTES), data: z.string().max(MAX_CIPHER_BYTES) }).strict()
export const publishedScaleArtifactSchema = z.object({
  kind: z.literal('SCALE_PUBLISHED_STATIC'), schemaVersion: z.literal(1),
  release: z.object({ releaseId: z.string().guid(), contentHash: digest }).strict(),
  instrumentKey: z.string().min(1), instrumentVersion: z.string().min(1),
  sourceDefinitionHash: digest, legacyDefinitionHash: digest,
  definition: z.record(z.string(), z.unknown()), compiledRuntime: z.record(z.string(), z.unknown()),
  instruction: z.unknown().nullable(),
  measurementPresentation: frozenScalePresentationSchema.optional(),
}).strict()
export type PublishedScaleArtifact = Omit<z.infer<typeof publishedScaleArtifactSchema>,'definition'|'compiledRuntime'|'instruction'> & {
  definition: ScaleDefinitionV2; compiledRuntime: ReturnType<typeof createFrozenScaleRuntimeSnapshot>['compiledRuntime']; instruction: FrozenScaleInstruction | null }
export type PublishedScaleArtifactRef = { formatVersion: 3; hash: string }

export const publishedScaleArtifactHash = (artifact: unknown): string => canonicalHash({ storageVersion: 3, artifact })

const publishedArtifactHashes = new WeakMap<PublishedScaleArtifact, string>()

function retainPublishedScaleArtifactChildren(artifact: PublishedScaleArtifact, hash?: string): PublishedScaleArtifact {
  retainImmutableCanonicalValue(artifact.definition)
  retainImmutableCanonicalValue(artifact.compiledRuntime)
  if (artifact.instruction && typeof artifact.instruction === 'object') {
    retainImmutableCanonicalValue(artifact.instruction)
  }
  if (artifact.measurementPresentation) {
    retainImmutableCanonicalValue(artifact.measurementPresentation)
  }
  retainImmutableCanonicalValue(artifact)
  if (hash && digest.safeParse(hash).success) {
    publishedArtifactHashes.set(artifact, hash)
  }
  return artifact
}

export const getPublishedScaleArtifactHash = (artifact: PublishedScaleArtifact): string | undefined => (
  publishedArtifactHashes.get(artifact)
)

/** Compile exactly what START compiles today, minus the live parts. */
export function buildPublishedScaleArtifact(input: { instrumentKey: string; instrumentVersion: string; definition: ScaleDefinitionV2;
  instruction: FrozenScaleInstruction | null; measurementPresentation?: FrozenScalePresentation; release: { releaseId: string; contentHash: string } }) {
  const frozen = createFrozenScaleRuntimeSnapshot({ instrumentKey: input.instrumentKey, instrumentVersion: input.instrumentVersion,
    definition: input.definition, instruction: input.instruction, referenceBindings: [], frozenAt: new Date(0) })
  const artifact: PublishedScaleArtifact = { kind: 'SCALE_PUBLISHED_STATIC', schemaVersion: 1,
    release: { releaseId: input.release.releaseId, contentHash: input.release.contentHash },
    instrumentKey: frozen.instrumentKey, instrumentVersion: frozen.instrumentVersion,
    sourceDefinitionHash: frozen.sourceDefinitionHash, legacyDefinitionHash: frozen.legacyDefinitionHash,
    definition: frozen.definition, compiledRuntime: frozen.compiledRuntime, instruction: frozen.instruction ?? null,
    ...(input.measurementPresentation ? { measurementPresentation: input.measurementPresentation } : {}) }
  retainPublishedScaleArtifactChildren(artifact)
  const bytes = canonicalJsonBytes(artifact)
  if (bytes.length > MAX_PLAIN_BYTES) throw new Error('Published Scale artifact exceeds size limit')
  const hash = publishedScaleArtifactHash(artifact)
  publishedArtifactHashes.set(artifact, hash)
  const record: SharedScaleArtifactRecord = { artifactHash: hash, formatVersion: PUBLISHED_SCALE_ARTIFACT_FORMAT, plaintextBytes: bytes.length,
    payloadEncrypted: encryptUnifiedRuntimePayload({ kind: 'SCALE_PUBLISHED_STATIC', storageVersion: 3, artifactHash: hash,
      codec: 'gzip-json-v1', plaintextBytes: bytes.length, data: gzipSync(bytes, { level: 6 }).toString('base64') }) }
  return { artifact, hash, record }
}

/** Fail closed: hash, format, size, envelope and content are all re-verified. */
export function decodePublishedScaleArtifact(row: SharedScaleArtifactRecord, expectedHash: string): PublishedScaleArtifact {
  if (row.artifactHash !== expectedHash || row.formatVersion !== PUBLISHED_SCALE_ARTIFACT_FORMAT || row.payloadEncrypted.length > MAX_CIPHER_BYTES
    || row.plaintextBytes < 1 || row.plaintextBytes > MAX_PLAIN_BYTES) throw new Error('Invalid published Scale artifact record')
  const body = bodySchema.parse(decryptUnifiedRuntimePayload<unknown>(row.payloadEncrypted))
  if (body.artifactHash !== expectedHash || body.plaintextBytes !== row.plaintextBytes) throw new Error('Published Scale artifact metadata mismatch')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data)) throw new Error('Invalid published Scale artifact encoding')
  const bytes = gunzipSync(Buffer.from(body.data, 'base64'), { maxOutputLength: MAX_PLAIN_BYTES })
  if (bytes.length !== body.plaintextBytes) throw new Error('Published Scale artifact size mismatch')
  const artifact = publishedScaleArtifactSchema.parse(JSON.parse(bytes.toString("utf8"))) as unknown as PublishedScaleArtifact
  if (publishedScaleArtifactHash(artifact) !== expectedHash) throw new Error('Published Scale artifact hash mismatch')
  // Integrity is the content hash (pinned by the immutable publication) over the
  // authenticated envelope. Do NOT recompile on read: published Training freezes
  // the compiled runtime at publish, and a later compiler change must neither
  // reject nor silently alter untampered published content.
  return retainPublishedScaleArtifactChildren(artifact, expectedHash)
}

/** Append inside the publishing transaction. The hash is the primary key and
 * the content address, so a conflict means identical content already exists. */
export async function appendPublishedScaleArtifact(db: SharedScaleArtifactDb, built: ReturnType<typeof buildPublishedScaleArtifact>): Promise<PublishedScaleArtifactRef> {
  const r = built.record
  await db.$queryRaw`INSERT INTO assessment_runtime_artifacts (artifact_hash, format_version, plaintext_bytes, payload_encrypted)
    VALUES (${r.artifactHash}, ${r.formatVersion}, ${r.plaintextBytes}, ${r.payloadEncrypted}) ON CONFLICT (artifact_hash) DO NOTHING RETURNING artifact_hash`
  return { formatVersion: 3, hash: built.hash }
}

// Only verified, committed-by-hash immutable scientific content is cached.
// Usage constraint (T2 evidence): an in-transaction read of a row appended in
// the SAME transaction fills this process cache with an uncommitted artifact
// and survives that transaction's rollback (content-addressed, so a later real
// insert of the same hash is byte-identical and the phantom stays benign).
// Current flows never do this - appends live in publish/backfill transactions,
// loads in START binding transactions that only see committed refs. Keep it
// that way: do not call loadPublishedScaleArtifacts inside a transaction that
// has appended artifacts in this process.
const cache = new BoundedArtifactCache<PublishedScaleArtifact>(256, 32 * 1024 * 1024)
export const getCachedPublishedScaleArtifact = (hash: string): PublishedScaleArtifact | undefined => (
  digest.safeParse(hash).success ? cache.get(hash) : undefined
)
export const cacheCommittedPublishedScaleArtifact = (hash: string, artifact: PublishedScaleArtifact, plainBytes = 4096): void => {
  if (!digest.safeParse(hash).success) return
  retainPublishedScaleArtifactChildren(artifact, hash)
  cache.set(hash, artifact, plainBytes * 5 + 1024)
}
export async function loadPublishedScaleArtifacts(db: SharedScaleArtifactDb, hashes: string[]): Promise<Map<string, PublishedScaleArtifact>> {
  const out = new Map<string, PublishedScaleArtifact>(), missing: string[] = []
  for (const hash of new Set(hashes)) {
    if (!digest.safeParse(hash).success) throw new Error('Invalid published Scale artifact hash')
    const hit = cache.get(hash)
    if (hit) {
      publishedArtifactHashes.set(hit, hash)
      out.set(hash, hit)
    } else {
      missing.push(hash)
    }
  }
  if (missing.length) {
    const rows = await withStartNestedQueryRawLabel<SharedScaleArtifactRecord[]>('published_scale_artifacts', () => db.$queryRaw<SharedScaleArtifactRecord[]>`SELECT artifact_hash AS "artifactHash", format_version AS "formatVersion",
      plaintext_bytes AS "plaintextBytes", payload_encrypted AS "payloadEncrypted" FROM assessment_runtime_artifacts WHERE artifact_hash = ANY(${missing}::text[])`)
    const byHash = new Map(rows.map(row => [row.artifactHash, row]))
    for (const hash of missing) {
      const row = byHash.get(hash)
      if (!row) throw new Error('Published Scale artifact missing')
      const artifact = decodePublishedScaleArtifact(row, hash)
      cache.set(hash, artifact, row.plaintextBytes * 5 + 1024)
      out.set(hash, artifact)
    }
  }
  return out
}
export const publishedScaleArtifactCacheStats = () => cache.stats()
