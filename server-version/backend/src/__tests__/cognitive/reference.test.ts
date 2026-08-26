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
    expect(result.label).toBe('历史模拟参考')
    expect(result.label).not.toMatch(/文献锚定/)
    expect(result.disclaimer).not.toMatch(/文献锚定/)
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

  it('keeps literature unavailable even when protocol matches until provenance is enabled', () => {
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
    expect(result.available).toBe(false)
    expect(result.status).toBe('unavailable')
    expect(result.comparison).toBeNull()
  })

  it('ignores seed/config K7-9 when the participant has no age band', () => {
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
        report: { reportVersion: '1.1.0', referenceMode: 'simulated', referenceVersion: LITERATURE_ANCHORED_SIM_VERSION, referenceBand: 'K7-9' },
      },
    })
    expect(result.available).toBe(false)
    expect(result.disclaimer).toContain('未采集参与者年龄带')
  })

  it('does not give a K10-12 participant the seed K7-9 comparison', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: LITERATURE_ANCHORED_SIM_VERSION,
      referenceBand: 'K7-9',
      participantAgeBand: null,
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
    expect(result.available).toBe(false)
    expect(result.band).toBeNull()
  })

  it('produces different comparisons when a participant age band is explicitly supplied', () => {
    const base = {
      testType: 'reaction' as const,
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated' as const,
      referenceVersion: LITERATURE_ANCHORED_SIM_VERSION,
      profile: 'standard' as const,
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: {
        totalTrials: 20,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    }
    const younger = resolveCognitiveReference({ ...base, participantAgeBand: 'K7-9' })
    const older = resolveCognitiveReference({ ...base, participantAgeBand: 'K10-12' })
    expect(younger.available).toBe(true)
    expect(older.available).toBe(true)
    expect(younger.comparison?.referenceMean).not.toBe(older.comparison?.referenceMean)
    expect(resolveCognitiveReference({ ...base, participantAgeBand: 'K99' }).available).toBe(false)
  })

  it('does not infer a missing profile as standard', () => {
    const result = resolveCognitiveReference({
      testType: 'reaction',
      metrics: { medianRtMs: 320 },
      score: 80,
      referenceMode: 'simulated',
      referenceVersion: LITERATURE_ANCHORED_SIM_VERSION,
      referenceBand: 'K7-9',
      profile: null,
      scoringVersion: '1.1.0',
      engineVersion: '1.0.0',
      config: {
        totalTrials: 20,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    })
    expect(result.available).toBe(false)
    expect(result.protocolMatched).toBe(false)
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
    expect(describeRelativeSd(330, 330, 40)).toBe('接近该参考分布范围')
    expect(describeRelativeSd(410, 330, 40, '内部模拟参考均值')).toBe('高于内部模拟参考均值约 2 SD')
    expect(describeRelativeSd(250, 330, 40, '历史模拟参考均值')).toBe('低于历史模拟参考均值约 2 SD')
  })
})
