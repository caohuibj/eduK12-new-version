import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const delaydiscountRegistryMeta = {
  name: '延迟满足选择',
  category: 'decision_making',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'delaydiscount-bisection-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { bisectionSteps: 3 },
      reportCaveats: ['体验版，无差异点估计较粗，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { bisectionSteps: 5 },
      reportCaveats: ['结果描述本次跨期选择表现，不是自控力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [5, 7],
      configPatch: { bisectionSteps: 7 },
      reportCaveats: ['科研档仅增加每带二分步数（重复次数），难度与标准档一致；无差异点估计更精细；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    aucDelayDiscounting: metric('aucDelayDiscounting', '折扣曲线下面积', 'decision_making', 'ratio', 'higher_is_better', 'primary'),
    meanIndifferenceRate: metric('meanIndifferenceRate', '平均无差异点', 'decision_making', 'ratio', 'higher_is_better', 'secondary'),
    laterChoiceRate: metric('laterChoiceRate', '选延后奖赏比例', 'decision_making', 'ratio', 'higher_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'decision_making', 'count', 'lower_is_better', 'secondary'),
    validTrialCount: metric('validTrialCount', '有效选择数', 'decision_making', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '全部延迟带是否完成，AUC 是否可计算。' },
    incompleteDelayBand: { key: 'incompleteDelayBand', label: '延迟带不完整', description: '存在超时试次，该带无差异点不可用。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '延迟满足选择',
    headlineMetric: 'aucDelayDiscounting',
    primaryMetrics: ['aucDelayDiscounting', 'laterChoiceRate'],
    secondaryMetrics: ['meanIndifferenceRate', 'timeoutCount', 'validTrialCount'],
    practicalTips: ['没有标准答案：按你真实的选择作答即可，一致性最重要。', '想一想等待是否值得，不要因为想“表现好”而刻意选某一边。'],
    disclaimer: '结果只描述本次跨期选择的表现，不是性格、自控力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
