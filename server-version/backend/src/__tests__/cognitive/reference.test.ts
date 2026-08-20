import { describe, expect, it } from 'vitest'
import { resolveCognitiveReference } from '../../modules/cognitive/reference'
import {
  generateSimulatedReference,
  getSimulatedReference,
  SIMULATED_REFERENCE_SEED,
} from '../../modules/cognitive/reference-data/generate-simulated-reference'
import fixture from '../../modules/cognitive/reference-data/simulated/sim-k12-v0.1.json'

describe('cognitive reference resolver', () => {
  it('returns a provisional synthetic reference position with an explicit disclaimer', () => {
    const result = resolveCognitiveReference({
      testType: 'memory',
      metrics: { maxSpan: 7 },
      score: 64,
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    })
    expect(result).toMatchObject({
      mode: 'simulated',
      status: 'provisional',
      available: true,
      band: 'K7-9',
    })
    expect(result.referencePosition).toEqual(expect.any(Number))
    expect(result.disclaimer).toContain('不代表真实同龄人常模')
  })

  it('requires a matching version and band instead of forcing a conversion', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: 'unknown',
    })
    expect(result).toMatchObject({ mode: 'simulated', status: 'unavailable', available: false, referencePosition: null })
  })

  it('respects lower-is-better and higher-is-better metric directions', () => {
    const fast = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 220 },
      score: 90,
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    })
    const slow = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 480 },
      score: 40,
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    })
    expect(fast.referencePosition).toBeGreaterThan(slow.referencePosition ?? -1)
  })

  it('does not expose literature reference until protocol matching is approved', () => {
    const result = resolveCognitiveReference({
      testType: 'stroop',
      metrics: { accuracy: 0.8 },
      score: 80,
      referenceMode: 'literature',
    })
    expect(result).toMatchObject({ mode: 'literature', status: 'unavailable', available: false, referencePosition: null })
  })

  it('generates deterministic synthetic data for the fixed seed', () => {
    expect(generateSimulatedReference(SIMULATED_REFERENCE_SEED)).toEqual(
      generateSimulatedReference(SIMULATED_REFERENCE_SEED)
    )
    expect(generateSimulatedReference(SIMULATED_REFERENCE_SEED).synthetic).toBe(true)
    expect(generateSimulatedReference()).toEqual(fixture)
    expect(() => getSimulatedReference('unknown')).toThrow(/Unknown simulated reference version/)
  })
})
