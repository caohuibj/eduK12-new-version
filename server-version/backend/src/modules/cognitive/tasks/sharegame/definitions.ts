import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const sharegameRegistryMeta = {
  name: '分享决策',
  category: 'social_decision',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'sharegame-frozen-endowments-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { endowments: [20, 50, 100] },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [2, 3],
      configPatch: { endowments: [20, 50, 100, 50, 100] },
      reportCaveats: ['结果描述本次分享决策的选择分布，不是品德评价或人格判断。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [3, 4],
      configPatch: { endowments: [20, 50, 100, 20, 50, 100, 50, 100] },
      reportCaveats: ['科研档仅增加轮次，禀赋结构与难度和标准档一致；仍不是人格或品德常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    givingRate: metric('givingRate', '给出比例', 'social_decision', 'ratio', 'descriptive', 'primary'),
    equalSplitCount: metric('equalSplitCount', '对半分轮数', 'social_decision', 'count', 'descriptive', 'secondary'),
    generousRate: metric('generousRate', '对半及以上比例', 'social_decision', 'ratio', 'descriptive', 'secondary'),
    givingRateSd: metric('givingRateSd', '给出比例波动', 'social_decision', 'ratio', 'descriptive', 'secondary'),
    medianDecisionMs: metric('medianDecisionMs', '决策用时中位数', 'social_decision', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '全部轮次完成选择。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '分享决策',
    headlineMetric: 'givingRate',
    primaryMetrics: ['givingRate', 'generousRate'],
    secondaryMetrics: ['equalSplitCount', 'givingRateSd', 'medianDecisionMs'],
    showProductIndex: false,
    practicalTips: ['没有对错：按你真实的分配习惯选择即可。', '不同轮次的金额不同，先看清楚本轮总额。'],
    disclaimer: '结果只描述本次分享决策的选择分布，是偏好描述而非品德、人格或能力判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
