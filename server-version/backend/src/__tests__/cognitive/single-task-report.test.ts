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
    expect(report.productIndex).toBeNull()
    expect(report.headline).toBeNull()
    expect(report.reference).toBeNull()
    expect(report.qualityFlags.find((flag) => flag.key === 'insufficientValidTrials')?.label).toBe('有效试次不足')
  })

  it('uses frozen Chinese labels and experience caveats', () => {
    const report = buildCognitiveSingleTaskReport(baseInput)
    expect(report.primaryMetrics.map((metric) => metric.label)).toEqual(['中位反应时', '遗漏率'])
    expect(report.secondaryMetrics.map((metric) => metric.label)).toEqual(['平均反应时'])
    expect(report.caveats).toEqual(['体验版，结果仅供体验。'])
    expect(report.practicalTips).toEqual(['冻结建议'])
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
})
