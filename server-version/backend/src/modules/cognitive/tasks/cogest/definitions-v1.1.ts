import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const cogestRegistryMetaV11 = {
  name: '认知估算',
  category: 'verbal_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'cogest-sequence-v1.1.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 18 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 8],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['标准档仍要求30题；目前仅20题候选，尚不可用。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 36 },
      reportCaveats: ['科研档仍要求36题；目前仅20题候选，尚不可用，不以重复题补足。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '合理量级选中率', 'verbal_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'verbal_reasoning', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'verbal_reasoning', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.1.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完整记录且无中断；有效正确用时不足时只描述正确率和遗漏。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '合理量级选中率过低', description: '合理量级选中率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    title: '认知估算',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['结合日常经验判断现实数量的合理量级。', '检查估计是否明显偏大或偏小；不作同龄人排名。'],
    disclaimer: '结果只描述本次数量级估算表现；一般知识、生活经验和文化背景会影响选择，不是临床、智商、年龄常模或客观能力排名。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
