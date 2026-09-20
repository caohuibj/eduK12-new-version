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

  it('projects profile-specific caveats into the V2 report', () => {
    const cpt = project('cpt', '1.0.0', 'standard', {
      dPrime: 1.2,
      omissionRate: 0.08,
      commissionRate: 0.05,
      rtICV: 0.2,
    })
    expect(cpt.caveats).toContain('正式版须同时看 d′、遗漏、误报和 RT 变异。')
  })

  it('shows research-only metrics only in the research profile', () => {
    const metrics = {
      switchCostRtMs: 85,
      switchCostAccuracy: 0.04,
      medianRtSwitch: 610,
      medianRtRepeat: 525,
      accuracySwitch: 0.91,
      accuracyRepeat: 0.95,
      mixingCost: 48,
    }
    const standard = project('taskswitch', '1.0.0', 'standard', metrics)
    const research = project('taskswitch', '1.0.0', 'research', metrics)

    expect(standard.research).toEqual([])
    expect(research.research.map((metric) => metric.key)).toEqual(['mixingCost'])
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
    expect(report.research).toEqual([])
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

  it('keeps Matrix reachedDifficulty as raw research data, not a participant-facing level', () => {
    const report = project('matrix', '1.0.0', 'standard', {
      accuracy: 0.75,
      accuracyByRuleFamily: { progression: 0.8, alternation: 0.7, combination: 0.75 },
      reachedDifficulty: 3,
      medianRtMs: 3200,
      omissionRate: 0,
    })
    const visibleKeys = [...report.headline, ...report.user, ...report.detail, ...report.research].map((metric) => metric.key)
    expect(visibleKeys).not.toContain('reachedDifficulty')
    expect(visibleKeys).toContain('accuracy')
  })

  it('applies the same participant-copy fallback to future task definitions', () => {
    const report = project('patterncompare', '1.0.0', 'experience', {
      correctPerMinute: 42,
      accuracy: 0.9,
      medianCorrectRtMs: 720,
      lapseRate: 0.05,
      correctCount: 21,
      completedTrialCount: 24,
    })
    expect(report.caveats).toContain('体验版仅持续 30 秒，速度指标稳定性有限，不进入综合分析。')
    expect(report.headline[0].description).toContain('每分钟正确数')
    expect(report.headline[0].description).not.toContain('processing_speed')
  })
})
