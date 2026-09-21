import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const reactionRegistryMeta = {
  name: '简单反应时',
  category: 'processing_speed',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'reaction-foreperiod-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [1, 2],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 20 },
      reportCaveats: ['正式版结果反映本次任务表现，不是人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研版增加试次以提高稳定性，仍不是临床常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    medianRtMs: metric('medianRtMs', '中位反应时', 'processing_speed', 'ms', 'lower_is_better', 'primary'),
    rtICV: metric('rtICV', '反应时变异系数', 'processing_speed', 'ratio', 'lower_is_better', 'primary'),
    missRate: metric('missRate', '遗漏率', 'processing_speed', 'ratio', 'lower_is_better', 'primary'),
    meanRtMs: metric('meanRtMs', '平均反应时', 'processing_speed', 'ms', 'lower_is_better', 'secondary'),
    sdRtMs: metric('sdRtMs', '反应时标准差', 'processing_speed', 'ms', 'lower_is_better', 'secondary'),
    fastestRtMs: metric('fastestRtMs', '最快有效反应', 'processing_speed', 'ms', 'descriptive', 'secondary'),
    prematureCount: metric('prematureCount', '提前反应次数', 'processing_speed', 'count', 'lower_is_better', 'secondary'),
    validTrialCount: metric('validTrialCount', '有效试次数', 'processing_speed', 'count', 'higher_is_better', 'secondary'),
    missCount: metric('missCount', '遗漏次数', 'processing_speed', 'count', 'lower_is_better', 'secondary'),
    totalTrials: metric('totalTrials', '总试次数', 'processing_speed', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '有效试次是否达到评分门槛。' },
    insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '有效 hit 比例过低。' },
    highMissRate: { key: 'highMissRate', label: '遗漏过高', description: '超时/无效反应比例过高。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '简单反应时',
    headlineMetric: 'medianRtMs',
    primaryMetrics: ['medianRtMs', 'rtICV', 'missRate'],
    secondaryMetrics: ['meanRtMs', 'sdRtMs', 'fastestRtMs', 'prematureCount', 'validTrialCount'],
    disclaimer: '结果反映本次任务表现，不是医学诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}

export const reactionRegistryMetaV11 = {
  ...reactionRegistryMeta,
  referenceEligibleMetricKeys: ['medianRtMs', 'rtICV'] as const,
  profileDefinitionVersion: '1.1.0',
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: {
    ...reactionRegistryMeta.metricDefinitions,
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.1.0',
  reportDefinitionVersion: '1.1.0',
  qualityDefinitions: {
    ...reactionRegistryMeta.qualityDefinitions,
    excessivePremature: { key: 'excessivePremature', label: '提前反应过多', description: '至少 20% 试次出现提前反应。' },
    extremeRtPattern: { key: 'extremeRtPattern', label: '反应时模式极端', description: '有效反应时变异系数超过 0.8。' },
  } as Record<string, QualityDefinition>,
  reportDefinition: {
    ...reactionRegistryMeta.reportDefinition,
    practicalTips: ['在需要快速响应时先减少外部干扰。', '比较多次结果时尽量使用相近设备和作答方式。'],
    disclaimer: '结果反映本次任务表现，不是医学诊断或人口常模。任务表现指数不是常模位置。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
