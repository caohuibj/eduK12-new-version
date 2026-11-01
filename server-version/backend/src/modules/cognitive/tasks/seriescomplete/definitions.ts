import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const seriescompleteRegistryMeta = {
  name: '数列完成',
  category: 'verbal_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seriescomplete-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 18 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['结果描述本次数列完成的表现，不是语言能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 9],
      configPatch: { totalTrials: 36 },
      reportCaveats: ['科研档使用全部 36 题；题库与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'verbal_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'verbal_reasoning', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'verbal_reasoning', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '数列完成',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先看相邻两个数的差或比，再验证规律。', '不确定时先算差值，再看是不是等差、等比或跳数。'],
    disclaimer: '结果只描述本次数列完成的表现，不是语言能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
