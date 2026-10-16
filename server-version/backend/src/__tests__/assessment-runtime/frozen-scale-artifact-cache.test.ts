import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { createFrozenScaleRuntimeSnapshot, parseFrozenScaleRuntimeSnapshot, frozenScaleArtifactCacheStats } from '../../modules/assessment-runtime/runtime-snapshot'
const snapshot = (key = 'cache-test', time = '2026-10-15T00:00:00.000Z') => createFrozenScaleRuntimeSnapshot({
  instrumentKey: key, instrumentVersion: '1', definition: getScaleInstrumentSource('adexi_v1', '2.0.0')!.executable!.definition, frozenAt: new Date(time),
})
describe('bounded content-verified frozen Scale artifact cache', () => {
  beforeAll(() => vi.stubEnv('ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED', 'true'))
  afterAll(() => vi.unstubAllEnvs())
  it('reuses only immutable scientific content across independent frozen records', () => {
    const a = parseFrozenScaleRuntimeSnapshot(snapshot())
    const b = parseFrozenScaleRuntimeSnapshot(snapshot('cache-test', '2026-10-15T00:01:00.000Z'))
    expect(a.definition).toBe(b.definition); expect(a.compiledRuntime).toBe(b.compiledRuntime)
    expect(a.frozenAt).not.toBe(b.frozenAt); expect(a.snapshotHash).not.toBe(b.snapshotHash)
    expect(Object.isFrozen(a.definition.responseSets[0].options)).toBe(true)
    expect(() => { a.definition.responseSets[0].options[0].score = 999 }).toThrow()
  })
  it('rejects changed content even when all supplied identity hashes match a cached record', () => {
    const valid = snapshot('cache-forgery'); parseFrozenScaleRuntimeSnapshot(valid)
    const changed = structuredClone(valid); changed.definition.responseSets[0].options[0].score = 999
    expect(() => parseFrozenScaleRuntimeSnapshot(changed)).toThrow()
    const runtime = structuredClone(valid); runtime.compiledRuntime.scorerVersion = 'forged'
    expect(() => parseFrozenScaleRuntimeSnapshot(runtime)).toThrow()
  })
  it('still validates every record identity, reference binding and envelope hash on cache hits', () => {
    const valid = snapshot('cache-binding'); parseFrozenScaleRuntimeSnapshot(valid)
    expect(() => parseFrozenScaleRuntimeSnapshot({ ...valid, instrumentVersion: 'other' })).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshot({ ...valid, snapshotHash: '0'.repeat(64) })).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshot({ ...valid, referenceBindings: [{
      referenceKey: 'foreign', referenceVersion: '1', referenceHash: 'a'.repeat(64),
    }] })).toThrow()
    expect(() => parseFrozenScaleRuntimeSnapshot({ ...valid, unexpected: true })).toThrow()
  })
  it('bounds retained entries and bytes while evicted records remain independently verifiable', () => {
    const first = snapshot('eviction-first'); parseFrozenScaleRuntimeSnapshot(first)
    for (let i = 0; i < 70; i++) parseFrozenScaleRuntimeSnapshot(snapshot('eviction-' + i))
    const stats = frozenScaleArtifactCacheStats()
    expect(stats.entries).toBeLessThanOrEqual(stats.maxEntries)
    expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes)
    expect(parseFrozenScaleRuntimeSnapshot(first)).toEqual(first)
  })
})
