import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const trustgameRegistryMeta = {
  name: '信任与公平博弈',
  category: 'social_decision',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'trustgame-frozen-offers-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { offers: [50, 20, 80, 10] },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { offers: [50, 20, 80, 10, 40, 30, 60, 20] },
      reportCaveats: ['结果描述本次响应者决策的选择分布，不是品德评价或人格判断。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [4, 6],
      configPatch: { offers: [50, 20, 80, 10, 40, 30, 60, 20, 50, 10, 70, 30] },
      reportCaveats: ['科研档增加轮次；提议结构与难度和标准档一致；仍不是人格或品德常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    acceptanceRate: metric('acceptanceRate', '总体接受率', 'social_decision', 'ratio', 'descriptive', 'primary'),
    unfairAcceptanceRate: metric('unfairAcceptanceRate', '不公平提议接受率', 'social_decision', 'ratio', 'descriptive', 'primary'),
    rejectedUnfairCount: metric('rejectedUnfairCount', '拒绝不公平提议数', 'social_decision', 'count', 'descriptive', 'secondary'),
    fairOfferCount: metric('fairOfferCount', '公平提议轮数', 'social_decision', 'count', 'descriptive', 'secondary'),
    medianDecisionMs: metric('medianDecisionMs', '决策用时中位数', 'social_decision', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '存在有效响应。' },
    noResponses: { key: 'noResponses', label: '无有效响应', description: '没有任何有效选择。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    title: '信任与公平博弈',
    headlineMetric: 'acceptanceRate',
    primaryMetrics: ['acceptanceRate', 'unfairAcceptanceRate'],
    secondaryMetrics: ['rejectedUnfairCount', 'fairOfferCount', 'medianDecisionMs'],
    showProductIndex: false,
    practicalTips: ['没有对错：按你真实的取舍选择即可。', '拒绝意味着双方都拿不到，想一想何时值得。'],
    disclaimer: '结果只描述本次响应者决策的选择分布，是偏好描述而非品德、人格或能力判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
