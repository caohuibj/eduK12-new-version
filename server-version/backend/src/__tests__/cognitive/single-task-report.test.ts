import { describe, expect, it } from 'vitest'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import type { FrozenReportSnapshot } from '../../modules/cognitive/profile-freeze'
import { resolveCognitiveReference } from '../../modules/cognitive/reference'

const frozen: FrozenReportSnapshot = {
  profile: 'experience',
  profileDefinitionVersion: '1.1.0',
  metricDefinitionVersion: '1.1.0',
  qualityDefinitionVersion: '1.1.0',
  reportDefinitionVersion: '1.1.0',
  reportCaveats: ['体验版，结果仅供体验。'],
  metricDefinitions: {
    medianRtMs: {
      key: 'medianRtMs',
      label: '中位反应时',
      construct: 'processing_speed',
      description: '中位反应时',
      unit: 'ms',
      valueType: 'number',
      direction: 'lower_is_better',
      role: 'primary',
      availableProfiles: ['experience', 'standard', 'research'],
      export: { summary: true, label: '中位反应时' },
    },
    missRate: {
      key: 'missRate',
      label: '遗漏率',
      construct: 'processing_speed',
      description: '遗漏率',
      unit: 'ratio',
      valueType: 'number',
      direction: 'lower_is_better',
      role: 'primary',
      availableProfiles: ['experience', 'standard', 'research'],
      export: { summary: true, label: '遗漏率' },
    },
    meanRtMs: {
      key: 'meanRtMs',
      label: '平均反应时',
      construct: 'processing_speed',
      description: '平均反应时',
      unit: 'ms',
      valueType: 'number',
      direction: 'lower_is_better',
      role: 'secondary',
      availableProfiles: ['experience', 'standard', 'research'],
      export: { summary: true, label: '平均反应时' },
    },
  },
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '' },
    insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '' },
  },
  reportDefinition: {
    title: '简单反应时',
    headlineMetric: 'medianRtMs',
    primaryMetrics: ['medianRtMs', 'missRate'],
    secondaryMetrics: ['meanRtMs'],
    practicalTips: ['冻结建议'],
    disclaimer: '不是医学诊断或人口常模。',
  },
}

const baseInput = {
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configVersion: '1.1.0',
  profile: 'experience' as const,
  frozenReport: frozen,
  score: 70,
  metrics: { medianRtMs: 320, missRate: 0.05, meanRtMs: 330 },
  qualityFlags: { interpretable: true },
  reference: resolveCognitiveReference({
    testType: 'reaction',
    metrics: { medianRtMs: 320 },
    score: 70,
    referenceMode: 'none',
  }),
}

describe('buildCognitiveSingleTaskReport', () => {
  it('hides headline, product index, and reference when uninterpretable', () => {
    const report = buildCognitiveSingleTaskReport({
      ...baseInput,
      qualityFlags: { interpretable: false, insufficientValidTrials: true },
    })
    expect(report?.productIndex).toBeNull()
    expect(report?.headline).toBeNull()
    expect(report?.reference).toBeNull()
    expect(report?.qualityFlags.find((flag) => flag.key === 'insufficientValidTrials')?.label).toBe('有效试次不足')
  })

  it('uses frozen Chinese labels and experience caveats', () => {
    const report = buildCognitiveSingleTaskReport(baseInput)
    expect(report?.primaryMetrics.map((metric) => metric.label)).toEqual(['中位反应时', '遗漏率'])
    expect(report?.secondaryMetrics.map((metric) => metric.label)).toEqual(['平均反应时'])
    expect(report?.caveats).toEqual(['体验版，结果仅供体验。'])
    expect(report?.practicalTips).toEqual(['冻结建议'])
    expect(report.productIndex?.label).toBe('任务表现指数')
    expect(JSON.stringify(report)).not.toMatch(/\{"metrics"/)
  })

  it('keeps the same core DTO for student, teacher, and composite fixtures', () => {
    const student = buildCognitiveSingleTaskReport(baseInput)
    const teacher = buildCognitiveSingleTaskReport(baseInput)
    const composite = buildCognitiveSingleTaskReport(baseInput)
    expect(student).toEqual(teacher)
    expect(teacher).toEqual(composite)
  })

  it('formats N-Back map metrics by level instead of stringifying objects', () => {
    const report = buildCognitiveSingleTaskReport({
      testType: 'nback',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      configVersion: '1.0.0',
      profile: 'research',
      frozenReport: null,
      score: 75,
      metrics: {
        dPrimeByN: { '1': 1.25, '2': 0.8 },
        maxReliableN: 2,
        hitRateByN: { '1': 0.8, '2': 0.65 },
        falseAlarmRateByN: { '1': 0.1, '2': 0.2 },
        medianRtByN: { '1': 410, '2': 480 },
        loadCostDPrime: 0.45,
      },
      qualityFlags: { interpretable: true },
      reference: null,
    })
    expect(report?.primaryMetrics.find((metric) => metric.key === 'dPrimeByN')?.formatted)
      .toBe('1-back：1.25；2-back：0.8')
    expect(report?.secondaryMetrics.find((metric) => metric.key === 'hitRateByN')?.formatted)
      .toBe('1-back：80%；2-back：65%')
    expect(report?.secondaryMetrics.find((metric) => metric.key === 'medianRtByN')?.formatted)
      .toBe('1-back：410 ms；2-back：480 ms')
    expect(JSON.stringify(report)).not.toContain('[object Object]')
  })

  it('uses exact Registry definitions for a legacy session without a frozen report snapshot', () => {
    const report = buildCognitiveSingleTaskReport({
      testType: 'reaction',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      configVersion: '1.0.1',
      profile: null,
      frozenReport: null,
      score: 70,
      metrics: { medianRtMs: 320, missRate: 0.1, meanRtMs: 330 },
      qualityFlags: { interpretable: true },
      reference: null,
    })
    expect(report).not.toBeNull()
    expect(report?.profile).toBeNull()
    expect(report?.title).toBe('简单反应时')
    expect(report?.primaryMetrics.length).toBeGreaterThan(0)
    expect(report?.primaryMetrics[0].label).not.toBe('medianRtMs')
    expect(report?.caveats).toEqual([])
  })

  it('hides research-only metrics from experience and standard reports', () => {
    const report = buildCognitiveSingleTaskReport({
      testType: 'cpt',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      configVersion: '1.0.0',
      profile: 'standard',
      frozenReport: null,
      score: 70,
      metrics: { dPrime: 1.2, omissionRate: 0.1, commissionRate: 0.1, rtICV: 0.2, blockSlopeRt: 12, blockSlopeOmission: 0.01 },
      qualityFlags: { interpretable: true },
      reference: null,
    })
    const keys = [...(report?.primaryMetrics ?? []), ...(report?.secondaryMetrics ?? [])].map((metric) => metric.key)
    expect(keys).not.toContain('blockSlopeRt')
    expect(keys).not.toContain('blockSlopeOmission')
    const research = buildCognitiveSingleTaskReport({
      testType: 'cpt',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      configVersion: '1.0.0',
      profile: 'research',
      frozenReport: null,
      score: 70,
      metrics: { dPrime: 1.2, omissionRate: 0.1, commissionRate: 0.1, rtICV: 0.2, blockSlopeRt: 12, blockSlopeOmission: 0.01 },
      qualityFlags: { interpretable: true },
      reference: null,
    })
    const researchKeys = [...(research?.primaryMetrics ?? []), ...(research?.secondaryMetrics ?? [])].map((metric) => metric.key)
    expect(researchKeys).toContain('blockSlopeRt')
    expect(researchKeys).toContain('blockSlopeOmission')
  })
})
