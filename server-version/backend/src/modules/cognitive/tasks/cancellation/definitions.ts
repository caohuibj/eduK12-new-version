import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const cancellationRegistryMeta = {
  name: '视觉划消',
  category: 'sustained_attention',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'cancellation-grid-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 1 },
      reportCaveats: ['体验版仅 1 轮，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 2 },
      reportCaveats: ['结果描述本次视觉搜索划消表现，不是注意力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [5, 8],
      configPatch: { totalTrials: 4 },
      reportCaveats: ['科研档增加轮次；网格与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    hitRate: metric('hitRate', '命中率', 'sustained_attention', 'ratio', 'higher_is_better', 'primary'),
    falseAlarmRate: metric('falseAlarmRate', '误报比例', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    hitCount: metric('hitCount', '命中数', 'sustained_attention', 'count', 'descriptive', 'secondary'),
    missCount: metric('missCount', '漏报数', 'sustained_attention', 'count', 'lower_is_better', 'secondary'),
    falseAlarmCount: metric('falseAlarmCount', '误报数', 'sustained_attention', 'count', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '误报率未过量。' },
    excessiveFalseAlarms: { key: 'excessiveFalseAlarms', label: '误报过多', description: '误报占选择比例达到 0.3。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '视觉划消',
    headlineMetric: 'hitRate',
    primaryMetrics: ['hitRate', 'falseAlarmRate'],
    secondaryMetrics: ['hitCount', 'missCount', 'falseAlarmCount'],
    practicalTips: ['按行从左到右扫，比乱找更快更稳。', '不确定的格子不要乱点，误报会拉低分数。'],
    disclaimer: '结果只描述本次视觉划消表现，不是注意力诊断、临床状态或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
