import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { compileScalePolicy, hashCompiledScalePolicy } from '../../modules/scale/policy/compile'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot, loadFrozenScaleRuntimeSnapshot, hashFrozenScaleRuntimeSnapshot,
  preparedScaleArtifactCacheStats } from '../../modules/assessment-runtime/runtime-snapshot'
import { createFrozenScaleRuntimeSnapshotV2ForTest } from '../../modules/assessment-runtime/runtime-snapshot-v2'
import { createSharedScaleRuntimeStore, type SharedScaleArtifactRecord } from '../../modules/assessment-runtime/shared-scale-runtime'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { canonicalJsonBytes, canonicalHashObjectParts, retainImmutableCanonicalValue } from '../../modules/assessment-runtime/canonical'
import { BoundedArtifactCache, jsonArtifactBytes } from '../../modules/assessment-runtime/bounded-artifact-cache'
const source = () => structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!)
const snapshot = (time = '2026-10-16T00:00:00.000Z', key = 'adexi_v1') => createFrozenScaleRuntimeSnapshot({
  instrumentKey: key, instrumentVersion: '2.0.0', definition: source().executable!.definition, frozenAt: new Date(time) })
const memory = () => {
  const rows = new Map<string, SharedScaleArtifactRecord>(); const writes = vi.fn(async (row: SharedScaleArtifactRecord) => {
    if (rows.has(row.artifactHash)) return false
    rows.set(row.artifactHash, structuredClone(row)); return true
  }); const reads = vi.fn(async (key: string) => rows.get(key) ?? null)
  const repository = { find: reads, insert: writes }
  return { rows, writes, reads, repository, store: createSharedScaleRuntimeStore(repository) }
}
const reference = (cipher: string): any => decryptUnifiedRuntimePayload(cipher)
beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())
describe('shared immutable Scale runtime storage', () => {
  it('stores one artifact for distinct attempt timestamps and preserves every logical byte', async () => {
    const m = memory(), a = snapshot(), b = snapshot('2026-10-16T00:01:00.000Z')
    const ca = await m.store.save(a), cb = await m.store.save(b)
    expect(m.rows.size).toBe(1); expect(m.writes).toHaveBeenCalledTimes(1)
    const cold = createSharedScaleRuntimeStore(m.repository)
    const da = await cold.load(reference(ca)), db = await cold.load(reference(cb))
    expect(da).toEqual(a); expect(db).toEqual(b); expect(da.definition).toBe(db.definition)
    expect(da.frozenAt).not.toBe(db.frozenAt); expect(da.snapshotHash).not.toBe(db.snapshotHash)
    expect(Buffer.byteLength(ca)).toBeLessThan(Buffer.byteLength(encryptFrozenScaleRuntimeSnapshot(a)) / 4)
    expect(m.reads).toHaveBeenCalledTimes(1)
    expect(() => { da.definition.responseSets[0].options[0].score = 999 }).toThrow()
  })
  it('returns a retryable storage failure without marking a saved attempt as a definition conflict', async () => {
    const cipher = encryptUnifiedRuntimePayload({ kind: 'SHARED_SCALE_RUNTIME', storageVersion: 1,
      artifactHash: 'a'.repeat(64), snapshotHash: 'b'.repeat(64), frozenAt: '2026-10-16T00:00:00.000Z' })
    const unavailable = { $queryRaw: vi.fn(async () => []) } as any
    await expect(loadFrozenScaleRuntimeSnapshot(cipher, unavailable)).rejects.toMatchObject({ code: 'ASSESSMENT_RUNTIME_UNAVAILABLE', statusCode: 503 })
    const admission = await import('../../modules/scale/scale-admission.service')
    await expect(admission.loadScaleAdmissionRuntime({ runtimeSnapshotEncrypted: cipher }, unavailable)).rejects.toMatchObject({ code: 'ASSESSMENT_RUNTIME_UNAVAILABLE', statusCode: 503 })
  }, 15000)
  it('preserves V2 compiled policy and reads legacy inline data with new writes disabled', async () => {
    const s = source(), original = createFrozenScaleRuntimeSnapshotV2ForTest({ instrumentKey: s.identity.instrumentKey,
      instrumentVersion: s.identity.instrumentVersion, definition: s.executable!.definition, compiledPolicy: compileScalePolicy(s) })
    const m = memory(), cipher = await m.store.save(original)
    expect(await createSharedScaleRuntimeStore(m.repository).load(reference(cipher))).toEqual(original)
    vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', 'false')
    expect(await loadFrozenScaleRuntimeSnapshot(encryptFrozenScaleRuntimeSnapshot(original))).toEqual(original)
  })
  it('coalesces concurrent appends and does not cache a failed or uncommitted append', async () => {
    const m = memory(), a = snapshot(); m.writes.mockRejectedValueOnce(new Error('synthetic commit failure'))
    await expect(m.store.save(a)).rejects.toThrow('commit failure')
    expect(m.rows.size).toBe(0)
    const ciphers = await Promise.all(Array.from({ length: 20 }, () => m.store.save(a)))
    expect(m.rows.size).toBe(1); expect(m.writes).toHaveBeenCalledTimes(2)
    expect(await m.store.load(reference(ciphers[0]))).toEqual(a)
    expect(m.store.stats().inFlight).toBe(0)
  })
  it('never treats an uncommitted transaction append as committed existence', async () => {
    const m = memory(), staged = new Map<string, SharedScaleArtifactRecord>()
    const tx = { find: vi.fn(async (key: string) => staged.get(key) ?? null),
      insert: vi.fn(async (row: SharedScaleArtifactRecord) => { staged.set(row.artifactHash, row); return true }) }
    await m.store.save(snapshot(), tx)
    await new Promise(resolve => setImmediate(resolve))
    staged.clear() // The personal-attempt transaction rolls back.
    await m.store.save(snapshot(), tx)
    expect(tx.insert).toHaveBeenCalledTimes(2)
    expect(m.rows.size).toBe(0)
  })
  it('revalidates warm references, rejects missing content and recovers after the artifact returns', async () => {
    const m = memory(), a = snapshot(), cipher = await m.store.save(a), ref = reference(cipher)
    await expect(m.store.load({ ...ref, snapshotHash: '0'.repeat(64) })).rejects.toThrow('hash mismatch')
    await expect(m.store.load({ ...ref, frozenAt: '2026-10-16T01:00:00.000Z' })).rejects.toThrow('hash mismatch')
    await expect(m.store.load({ ...ref, extra: 'participant' })).rejects.toThrow()
    const saved = [...m.rows.values()][0]; m.rows.clear()
    const cold = createSharedScaleRuntimeStore(m.repository)
    await expect(cold.load(ref)).rejects.toThrow('missing')
    m.rows.set(saved.artifactHash, saved); expect(await cold.load(ref)).toEqual(a)
    const changed = structuredClone(a); changed.definition.responseSets[0].options[0].score = 999
    await expect(m.store.save(changed)).rejects.toThrow()
  })
  it('rejects corrupt ciphertext, metadata and bounded decompression attacks', async () => {
    const m = memory(), cipher = await m.store.save(snapshot()), ref = reference(cipher), saved = [...m.rows.values()][0]
    const row = { ...saved, payloadEncrypted: saved.payloadEncrypted.slice(0, -2) + 'xx' }; m.rows.set(row.artifactHash, row)
    await expect(createSharedScaleRuntimeStore(m.repository).load(ref)).rejects.toThrow()
    const body: any = decryptUnifiedRuntimePayload(saved.payloadEncrypted)
    body.data = gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 97)).toString('base64')
    m.rows.set(saved.artifactHash, { ...saved, payloadEncrypted: encryptUnifiedRuntimePayload(body) })
    await expect(createSharedScaleRuntimeStore(m.repository).load(ref)).rejects.toThrow()
    m.rows.set(saved.artifactHash, { ...saved, formatVersion: 99 })
    await expect(createSharedScaleRuntimeStore(m.repository).load(ref)).rejects.toThrow()
  })
  it('keeps changed scientific content under separate identities and enforces cache limits', async () => {
    const m = memory(); await m.store.save(snapshot()); await m.store.save(snapshot(undefined, 'another-instrument'))
    expect(m.rows.size).toBe(2)
    const stats = m.store.stats(); expect(stats.artifacts.bytes).toBeLessThanOrEqual(stats.artifacts.maxBytes)
    const cache = new BoundedArtifactCache<number>(2, 10); cache.set('a', 1, 6); cache.set('b', 2, 6)
    expect(cache.get('a')).toBeUndefined(); expect(cache.get('b')).toBe(2); expect(cache.stats().bytes).toBe(6)
    cache.set('oversize', 3, 11); expect(cache.get('oversize')).toBeUndefined()
  })
})
describe('compiled artifacts and exact canonical hash reuse', () => {
  it('reuses compiled content across fresh DB-shaped JSON values and timestamps', () => {
    vi.stubEnv('ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED', 'true')
    const a = snapshot(undefined, 'prepared-cache-new'), before = preparedScaleArtifactCacheStats()
    const b = snapshot('2026-10-16T00:01:00.000Z', 'prepared-cache-new')
    expect(a.definition).toBe(b.definition); expect(a.compiledRuntime).toBe(b.compiledRuntime)
    expect(preparedScaleArtifactCacheStats().hits).toBeGreaterThan(before.hits)
    vi.stubEnv('ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED', 'false')
    expect(snapshot(undefined, 'prepared-cache-new')).toEqual(a)
  })
  it('matches the original canonical encoder including numeric keys, Unicode and registered children', () => {
    const child = retainImmutableCanonicalValue({ z: [1, -0, '中文'], a: { nested: true } })
    for (const input of [{ b: child, a: 2 }, { '10': child, '2': null, x: '值' }, { frozenAt: 'different', definition: child }]) {
      const original = createHash('sha256').update(canonicalJsonBytes(input)).digest('hex')
      expect(canonicalHashObjectParts(input)).toBe(original)
    }
    expect(() => canonicalHashObjectParts({ x: undefined })).toThrow()
    expect(jsonArtifactBytes({ x: undefined })).toBeNull()
    expect(jsonArtifactBytes({ get x() { return 1 } })).toBeNull()
    expect(jsonArtifactBytes(Object.assign([], { toJSON: () => ({ fake: true }) }))).toBeNull()
  })
})

// New library protocol is immutable shared content, never an attempt/client override.
it('roundtrips exact library presentation through shared runtime storage', async () => {
  const m = memory(), frozen = snapshot()
  frozen.measurementPresentation = { releaseId: 'approved-release', contentHash: 'a'.repeat(64), presentationMode: 'ALL_AT_ONCE' }
  frozen.snapshotHash = hashFrozenScaleRuntimeSnapshot(frozen)
  const cipher = await m.store.save(frozen)
  const restored = await createSharedScaleRuntimeStore(m.repository).load(reference(cipher))
  expect(restored).toEqual(frozen)
  expect(restored.measurementPresentation?.presentationMode).toBe('ALL_AT_ONCE')
})

it('persists storageVersion=3 published artifact references with zero DB writes and reconstructs V1/V2 snapshots', async () => {
  const { buildPublishedScaleArtifact, cacheCommittedPublishedScaleArtifact } = await import('../../modules/assessment-runtime/published-scale-artifact')
  const { decryptFrozenScaleRuntimeSnapshot, setSnapshotPublishedArtifactHash } = await import('../../modules/assessment-runtime/runtime-snapshot')
  const s = source()
  const built = buildPublishedScaleArtifact({
    release: { releaseId: 'release-1', contentHash: 'a'.repeat(64) },
    instrumentKey: s.identity.instrumentKey,
    instrumentVersion: s.identity.instrumentVersion,
    definition: s.executable!.definition,
    instruction: null,
  })
  cacheCommittedPublishedScaleArtifact(built.record.artifactHash, built.artifact, built.record.plaintextBytes)
  const m = memory()
  m.rows.set(built.record.artifactHash, built.record)

  const v1 = snapshot('2026-10-16T02:00:00.000Z')
  setSnapshotPublishedArtifactHash(v1, built.record.artifactHash)
  const cipherV1 = await m.store.save(v1)
  expect(m.writes).not.toHaveBeenCalled()
  const refV1 = reference(cipherV1)
  expect(refV1.storageVersion).toBe(3)
  expect(refV1.artifactHash).toBe(built.record.artifactHash)
  expect(await m.store.load(refV1)).toEqual(v1)
  expect(decryptFrozenScaleRuntimeSnapshot(cipherV1)).toEqual(v1)
  await expect(m.store.load({ ...refV1, snapshotHash: '0'.repeat(64) })).rejects.toThrow('hash mismatch')

  const v2 = createFrozenScaleRuntimeSnapshotV2ForTest({
    instrumentKey: s.identity.instrumentKey,
    instrumentVersion: s.identity.instrumentVersion,
    definition: s.executable!.definition,
    compiledPolicy: compileScalePolicy(s),
    frozenAt: new Date('2026-10-16T03:00:00.000Z'),
  })
  setSnapshotPublishedArtifactHash(v2, built.record.artifactHash)
  const cipherV2 = await m.store.save(v2)
  expect(m.writes).not.toHaveBeenCalled()
  const refV2 = reference(cipherV2)
  expect(refV2.storageVersion).toBe(3)
  expect(refV2.schemaVersion).toBe(2)
  expect(await m.store.load(refV2)).toEqual(v2)
  expect(decryptFrozenScaleRuntimeSnapshot(cipherV2)).toEqual(v2)
})

it('persistFrozenScaleRuntimeSnapshot respects explicit ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED === true', async () => {
  const { persistFrozenScaleRuntimeSnapshot, decryptFrozenScaleRuntimeSnapshot, setSnapshotPublishedArtifactHash } = await import('../../modules/assessment-runtime/runtime-snapshot')
  const { decryptUnifiedRuntimePayload } = await import('../../modules/assessment-runtime/security')
  const { isPublishedSharedScaleRuntimeReference } = await import('../../modules/assessment-runtime/shared-scale-runtime')
  const v1 = snapshot('2026-10-16T02:00:00.000Z')
  setSnapshotPublishedArtifactHash(v1, 'a'.repeat(64))

  delete process.env.ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED
  const cipherDefault = await persistFrozenScaleRuntimeSnapshot(v1)
  const decodedDefault = decryptFrozenScaleRuntimeSnapshot(cipherDefault)
  expect(decodedDefault).toEqual(v1)
  const rawDefault = decryptUnifiedRuntimePayload<any>(cipherDefault)
  expect(isPublishedSharedScaleRuntimeReference(rawDefault)).toBe(false)
  expect(rawDefault.storageVersion).toBeUndefined()
  expect(rawDefault.definition).toBeDefined()

  vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', 'false')
  const cipherFalse = await persistFrozenScaleRuntimeSnapshot(v1)
  expect(decryptFrozenScaleRuntimeSnapshot(cipherFalse)).toEqual(v1)
  const rawFalse = decryptUnifiedRuntimePayload<any>(cipherFalse)
  expect(isPublishedSharedScaleRuntimeReference(rawFalse)).toBe(false)
  expect(rawFalse.storageVersion).toBeUndefined()
  expect(rawFalse.definition).toBeDefined()
})

it('falls back to inline encrypted snapshot when published reference exceeds 16KB bound', async () => {
  const { buildPublishedScaleArtifact, cacheCommittedPublishedScaleArtifact } = await import('../../modules/assessment-runtime/published-scale-artifact')
  const { loadFrozenScaleRuntimeSnapshot, setSnapshotPublishedArtifactHash } = await import('../../modules/assessment-runtime/runtime-snapshot')
  const { isPublishedSharedScaleRuntimeReference } = await import('../../modules/assessment-runtime/shared-scale-runtime')
  const { decryptUnifiedRuntimePayload } = await import('../../modules/assessment-runtime/security')
  const crypto = await import('node:crypto')
  const s = source()
  const built = buildPublishedScaleArtifact({
    release: { releaseId: 'release-1', contentHash: 'a'.repeat(64) },
    instrumentKey: s.identity.instrumentKey,
    instrumentVersion: s.identity.instrumentVersion,
    definition: s.executable!.definition,
    instruction: null,
  })
  cacheCommittedPublishedScaleArtifact(built.record.artifactHash, built.artifact, built.record.plaintextBytes)
  const m = memory()
  m.rows.set(built.record.artifactHash, built.record)

  // High-entropy random payload ensures ciphertext cannot compress below 16KB bound
  const uncompressibleBody = crypto.randomBytes(20000).toString('base64')
  const basePolicy = compileScalePolicy(s)
  const policyDraft = {
    ...basePolicy,
    educationalFeedback: {
      schemaVersion: 1 as const,
      contentVersion: '1.0.0',
      blocks: [{ id: 'b1', title: 'Large Feedback', body: uncompressibleBody }],
    },
  }
  const compiledPolicy = {
    ...policyDraft,
    runtimePolicyHash: hashCompiledScalePolicy(policyDraft as any),
  }
  const v2 = createFrozenScaleRuntimeSnapshotV2ForTest({
    instrumentKey: s.identity.instrumentKey,
    instrumentVersion: s.identity.instrumentVersion,
    definition: s.executable!.definition,
    compiledPolicy,
    frozenAt: new Date('2026-10-16T03:00:00.000Z'),
  })
  setSnapshotPublishedArtifactHash(v2, built.record.artifactHash)

  const cipher = await m.store.save(v2)
  expect(Buffer.byteLength(cipher)).toBeGreaterThan(16384)

  const rawPayload = decryptUnifiedRuntimePayload<any>(cipher)
  expect(isPublishedSharedScaleRuntimeReference(rawPayload)).toBe(false)
  expect(rawPayload.storageVersion).toBeUndefined()
  expect(rawPayload.definition).toBeDefined()

  const loaded = await loadFrozenScaleRuntimeSnapshot(cipher)
  expect(loaded.instrumentKey).toBe(v2.instrumentKey)
  expect(loaded.snapshotHash).toBe(v2.snapshotHash)
  expect(loaded.compiledPolicy).toEqual(v2.compiledPolicy)
})
