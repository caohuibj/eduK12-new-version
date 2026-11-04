import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { scaleSourcePolicyIdentity, snapshotScaleInstrumentSource } from '../../modules/scale/onboarding/source-snapshot'

describe('scaleSourcePolicyIdentity memoization', () => {
  const sources = listScaleInstrumentSources()
  it('matches the uncached canonical identity for every registry source', () => {
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      const expected = { resourceKey: `standard:${source.identity.instrumentKey}:${source.identity.instrumentVersion}`, fingerprint: canonicalHash(snapshotScaleInstrumentSource(source)) }
      expect(scaleSourcePolicyIdentity(source)).toEqual(expected)
      expect(scaleSourcePolicyIdentity(source)).toEqual(expected)
    }
  })
  it('returns a fresh object, so a caller mutation cannot poison the cache', () => {
    const source = sources[0], first = scaleSourcePolicyIdentity(source)
    first.fingerprint = 'tampered'
    expect(scaleSourcePolicyIdentity(source).fingerprint).not.toBe('tampered')
  })
  it('hashes a different source object anew (cache is keyed by object identity)', () => {
    const source = sources[0], copy = structuredClone(snapshotScaleInstrumentSource(source)) as typeof source
    ;(copy as any).identity = { ...copy.identity, instrumentVersion: copy.identity.instrumentVersion + '-x' }
    expect(scaleSourcePolicyIdentity(copy).resourceKey).toBe(`standard:${source.identity.instrumentKey}:${source.identity.instrumentVersion}-x`)
    expect(scaleSourcePolicyIdentity(copy).fingerprint).not.toBe(scaleSourcePolicyIdentity(source).fingerprint)
  })
})
