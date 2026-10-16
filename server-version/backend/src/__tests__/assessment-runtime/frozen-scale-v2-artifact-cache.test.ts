import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenScaleRuntimeSnapshotV2ForTest, parseFrozenScaleRuntimeSnapshotV2, frozenScaleV2ArtifactCacheStats } from '../../modules/assessment-runtime/runtime-snapshot-v2'
const snapshot = (key = 'adexi_v1', time = '2026-10-15T00:00:00.000Z') => {
  const source = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!); source.identity.instrumentKey = key
  return createFrozenScaleRuntimeSnapshotV2ForTest({ instrumentKey: key, instrumentVersion: '2.0.0',
    definition: source.executable!.definition, compiledPolicy: compileScalePolicy(source), frozenAt: new Date(time) })
}
const rehash = (value: ReturnType<typeof snapshot>) => { value.snapshotHash = canonicalHash(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'snapshotHash'))); return value }
beforeEach(() => vi.stubEnv('ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED', 'true'))
afterEach(() => vi.unstubAllEnvs())
describe('content-verified immutable V2 frozen artifact cache', () => {
  it('shares definition/runtime/policy only across independently valid frozen records', () => {
    const a = parseFrozenScaleRuntimeSnapshotV2(snapshot()), b = parseFrozenScaleRuntimeSnapshotV2(snapshot('adexi_v1', '2026-10-15T00:01:00.000Z'))
    expect(a.definition).toBe(b.definition); expect(a.compiledRuntime).toBe(b.compiledRuntime); expect(a.compiledPolicy).toBe(b.compiledPolicy)
    expect(a.frozenAt).not.toBe(b.frozenAt); expect(a.snapshotHash).not.toBe(b.snapshotHash)
    expect(Object.isFrozen(a.compiledPolicy.disclosure)).toBe(true)
    expect(() => { a.definition.responseSets[0].options[0].score = 999 }).toThrow()
  })
  it('keeps the disabled parser and enabled parser exactly equivalent', () => {
    const original = snapshot('equivalent_v2'); const enabled = parseFrozenScaleRuntimeSnapshotV2(original)
    vi.stubEnv('ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED', 'false')
    expect(parseFrozenScaleRuntimeSnapshotV2(original)).toEqual(enabled); expect(enabled).toEqual(original)
  })
  it('never trusts supplied hashes as cache identity even if the envelope hash is recomputed', () => {
    const valid = snapshot('content_attack_v2'); parseFrozenScaleRuntimeSnapshotV2(valid)
    const changed = structuredClone(valid); changed.definition.responseSets[0].options[0].score = 999
    expect(() => parseFrozenScaleRuntimeSnapshotV2(rehash(changed))).toThrow()
    const runtime = structuredClone(valid); runtime.compiledRuntime.scorerVersion = 'forged'
    expect(() => parseFrozenScaleRuntimeSnapshotV2(rehash(runtime))).toThrow()
    const policy = structuredClone(valid); policy.compiledPolicy.contentLocale = 'forged'
    expect(() => parseFrozenScaleRuntimeSnapshotV2(rehash(policy))).toThrow()
  })
  it('validates each identity, dynamic reference and exact envelope after a cache hit', () => {
    const valid = snapshot('binding_v2'); parseFrozenScaleRuntimeSnapshotV2(valid)
    expect(() => parseFrozenScaleRuntimeSnapshotV2(rehash({ ...valid, instrumentVersion: '9.0.0' }))).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshotV2({ ...valid, snapshotHash: '0'.repeat(64) })).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshotV2(rehash({ ...valid, referenceBindings: [{ referenceKey: 'foreign', referenceVersion: '1', referenceHash: 'a'.repeat(64) }] }))).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshotV2({ ...valid, extra: true })).toThrow()
  })
  it('enforces entry and byte limits and revalidates evicted records', () => {
    const first = snapshot('evicted_v2'); parseFrozenScaleRuntimeSnapshotV2(first)
    for (let i = 0; i < 70; i++) parseFrozenScaleRuntimeSnapshotV2(snapshot('eviction_v2_' + i))
    const stats = frozenScaleV2ArtifactCacheStats()
    expect(stats.entries).toBeLessThanOrEqual(stats.maxEntries); expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes)
    expect(parseFrozenScaleRuntimeSnapshotV2(first)).toEqual(first)
  })
})
