import { describe, expect, it } from 'vitest'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import type { CognitiveProfile, CognitiveScoreResult } from '../../modules/cognitive/v2/types'

const project = (
  testType: string,
  scoringVersion: string,
  profile: CognitiveProfile,
  metrics: Record<string, unknown>,
  state: CognitiveScoreResult['quality']['state'] = 'interpretable',
) => {
  const task = getCognitiveV2TaskDefinition(testType, '1.0.0', scoringVersion)
  if (!task) throw new Error(`missing task ${testType}/${scoringVersion}`)
  return projectThreeLayerReport({
    testType,
    configVersion: scoringVersion,
    protocolSignature: 'protocol-test',
    engineVersion: '1.0.0',
    scoringVersion,
    profile,
    definition: task.report,
    metrics,
    score: {
      metrics,
      quality: { state, flags: {}, reasons: [] },
      audit: { trialCount: 1, scorerVersion: scoringVersion },
    },
    metricDefinitions: task.metrics,
    qualityDefinitions: task.quality,
  })
}

describe('Cognitive V2 participant report presentation', () => {
  it('uses short-form headlines for experience N-Back, SST, and Stroop', () => {
    const nback = project('nback', '1.0.0', 'experience', {
      dPrimeByN: { '1': 1.25 },
      maxReliableN: 1,
      hitRateByN: { '1': 0.8 },
      falseAlarmRateByN: { '1': 0.1 },
      medianRtByN: { '1': 410 },
      loadCostDPrime: 0,
    })
    const sst = project('sst', '1.0.0', 'experience', {
      ssrtMs: 220,
      pRespondStop: 0.5,
      goMedianRtMs: 430,
      goOmissionRate: 0,
      goChoiceErrorRate: 0,
      meanSsdMs: 250,
      unsuccessfulStopRtMs: 390,
    })
    const stroop = project('stroop', '1.1.0', 'experience', {
      stroopEffectMs: 80,
      incongruentAccuracy: 0.9,
      errorCost: 0.05,
      accuracy: 0.95,
      congruentAccuracy: 1,
      medianRtCongruent: 500,
      medianRtIncongruent: 580,
      timeoutCount: 0,
    })

    expect(nback.headline.map((metric) => metric.key)).toEqual(['dPrimeByN'])
    expect(nback.headline[0].formatted).toBe('1-back：1.25')
    expect(sst.headline.map((metric) => metric.key)).toEqual(['pRespondStop'])
    expect(stroop.headline.map((metric) => metric.key)).toEqual(['incongruentAccuracy'])
    expect(nback.conclusion).toMatch(/体验版使用短程协议/)
  })

  it('keeps standard and research headline contracts unchanged', () => {
    const nback = project('nback', '1.0.0', 'standard', {
      dPrimeByN: { '1': 1.25, '2': 0.8 },
      maxReliableN: 2,
      hitRateByN: { '1': 0.8, '2': 0.7 },
      falseAlarmRateByN: { '1': 0.1, '2': 0.2 },
      medianRtByN: { '1': 410, '2': 480 },
      loadCostDPrime: 0.45,
    })
    expect(nback.headline.map((metric) => metric.key)).toEqual(['maxReliableN'])
  })

  it('hides all quantitative layers when V2 quality is invalid', () => {
    const report = project('cpt', '1.0.0', 'standard', {
      dPrime: 1.1,
      omissionRate: 0.1,
      commissionRate: 0.1,
      rtICV: 0.2,
    }, 'invalid')
    expect(report.headline).toEqual([])
    expect(report.user).toEqual([])
    expect(report.detail).toEqual([])
    expect(report.conclusion).toMatch(/暂不提供表现结论/)
  })

  it('does not expose task-learning strategy tips to Memory or Stroop participants', () => {
    const memory = project('memory', '1.1.0', 'standard', {
      maxSpan: 6,
      totalCorrectTrials: 5,
      levelsPassed: 3,
      firstTryPassCount: 2,
      medianResponseDurationMs: 1000,
      trialCount: 6,
    })
    const stroop = project('stroop', '1.1.0', 'standard', {
      stroopEffectMs: 80,
      incongruentAccuracy: 0.9,
      errorCost: 0.05,
    })
    expect(memory.practicalTips).toEqual([])
    expect(stroop.practicalTips).toEqual([])
  })
})
