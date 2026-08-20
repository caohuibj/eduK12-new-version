import { describe, expect, it } from 'vitest'
import { ScoringEngineRegistry } from '../../modules/cognitive/scoring/scoring-engine'

describe('scoring engine registry', () => {
  it('dispatches by the complete frozen version key', () => {
    const registry = new ScoringEngineRegistry()
    registry.register('fake/1.0.0/1.0.0', {
      calculate: () => ({ score: 42, metrics: { source: 'test' }, qualityFlags: { interpretable: true } }),
    })
    expect(registry.calculate('fake/1.0.0/1.0.0', { config: {}, trials: [] }).score).toBe(42)
    expect(() => registry.calculate('fake/1.0.0/9.9.9', { config: {}, trials: [] })).toThrow(/No cognitive scoring engine/)
  })

  it('rejects duplicate version keys', () => {
    const registry = new ScoringEngineRegistry()
    const scorer = { calculate: () => ({ score: 1, metrics: {}, qualityFlags: {} }) }
    registry.register('fake/1.0.0/1.0.0', scorer)
    expect(() => registry.register('fake/1.0.0/1.0.0', scorer)).toThrow(/Duplicate/)
  })
})
