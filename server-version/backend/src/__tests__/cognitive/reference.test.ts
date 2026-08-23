import { describe, expect, it } from 'vitest'
import { describeRelativeSd, resolveCognitiveReference } from '../../modules/cognitive/reference'
import {
  generateSimulatedReference,
  getSimulatedReference,
  SIMULATED_REFERENCE_SEED,
} from '../../modules/cognitive/reference-data/generate-simulated-reference'
import {
  generateLiteratureAnchoredSimulatedReference,
  LITERATURE_ANCHORED_SIM_SEED,
  LITERATURE_ANCHORED_SIM_VERSION,
} from '../../modules/cognitive/reference-data/generate-literature-anchored-reference'
import fixture from '../../modules/cognitive/reference-data/simulated/sim-k12-v0.1.json'
import anchoredFixture from '../../modules/cognitive/reference-data/simulated/lit-sim-k12-v0.2.json'

const noPercentile = (text: string) => {
  expect(text).not.toMatch(/百分位/)
  expect(text).not.toMatch(/参考位置/)
  expect(text).not.toMatch(/超过.*同龄/)
}

describe('cognitive reference resolver', () => {
  it('returns an SD comparison for the legacy simulated fixture instead of a rank position', () => {
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
      referencePosition: null,
    })
    expect(result.comparison).toEqual(expect.objectContaining({
      metricKey: 'maxSpan',
      observed: 7,
    }))
    expect(result.comparison?.rangeLabel).toEqual(expect.any(String))
    noPercentile(result.disclaimer)
    noPercentile(result.comparison?.rangeLabel ?? '')
  })

  it('requires a matching version and band instead of forcing a conversion', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: 'unknown',
    })
    expect(result).toMatchObject({
      mode: 'simulated',
      status: 'unavailable',
      available: false,
      referencePosition: null,
      comparison: null,
    })
  })

  it('uses relative SD rather than a percentile rank for faster vs slower RT', () => {
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
    expect(fast.comparison?.sdDelta).not.toBeNull()
    expect(slow.comparison?.sdDelta).not.toBeNull()
    expect((fast.comparison?.sdDelta ?? 0) < (slow.comparison?.sdDelta ?? 0)).toBe(true)
  })

  it('hides reference when quality is not interpretable', () => {
    const result = resolveCognitiveReference({
      testType: 'memory',
      metrics: { maxSpan: 7 },
      score: 64,
      interpretable: false,
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    })
    expect(result).toMatchObject({ available: false, comparison: null, status: 'unavailable' })
  })

  it('does not expose literature reference when protocol does not match', () => {
    const result = resolveCognitiveReference({
      testType: 'stroop',
      metrics: { stroopEffectMs: 180, accuracy: 0.8 },
      score: 80,
      referenceMode: 'literature',
      profile: 'standard',
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: { totalTrials: 40, congruentRatio: 0.5 },
    })
    expect(result).toMatchObject({ mode: 'literature', status: 'unavailable', available: false, referencePosition: null })
  })

  it('enables literature reference only when protocol matches', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 310 },
      score: 80,
      referenceMode: 'literature',
      referenceBand: 'K7-9',
      profile: 'research',
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: {
        totalTrials: 60,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    })
    expect(result.available).toBe(true)
    expect(result.protocolMatched).toBe(true)
    expect(result.comparison?.metricKey).toBe('medianRtMs')
    expect(result.sources?.[0].doi).toBeTruthy()
    noPercentile(result.disclaimer)
  })

  it('enables literature-anchored simulated reference for matching 1.1.0 standard protocols', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: LITERATURE_ANCHORED_SIM_VERSION,
      referenceBand: 'K7-9',
      profile: 'standard',
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: {
        totalTrials: 20,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    })
    expect(result.available).toBe(true)
    expect(result.label).toBe('文献锚定模拟参考')
    expect(result.comparison?.metricKey).toBe('medianRtMs')
    noPercentile(result.disclaimer)
  })

  it('rejects experience-length protocols for the literature-anchored simulated set', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: LITERATURE_ANCHORED_SIM_VERSION,
      referenceBand: 'K7-9',
      profile: 'experience',
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: {
        totalTrials: 8,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    })
    expect(result.available).toBe(false)
    expect(result.protocolMatched).toBe(false)
  })

  it('generates deterministic synthetic data for the fixed seed', () => {
    expect(generateSimulatedReference(SIMULATED_REFERENCE_SEED)).toEqual(
      generateSimulatedReference(SIMULATED_REFERENCE_SEED)
    )
    expect(generateSimulatedReference(SIMULATED_REFERENCE_SEED).synthetic).toBe(true)
    expect(generateSimulatedReference()).toEqual(fixture)
    expect(() => getSimulatedReference('unknown')).toThrow(/Unknown simulated reference version/)
    expect(generateLiteratureAnchoredSimulatedReference(LITERATURE_ANCHORED_SIM_SEED)).toEqual(anchoredFixture)
  })

  it('describes relative SD without rank language', () => {
    expect(describeRelativeSd(330, 330, 40)).toBe('接近该研究样本报告范围')
    expect(describeRelativeSd(410, 330, 40)).toBe('高于文献参考均值约 2 SD')
    expect(describeRelativeSd(250, 330, 40)).toBe('低于文献参考均值约 2 SD')
  })
})
