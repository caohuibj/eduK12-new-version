import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const cogestRegistryMetaV11 = {
  name: '认知估计',
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
      reportCaveats: ['结果描述本次认知估计的表现，不是语言能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 36 },
      reportCaveats: ['科研档使用全部 36 题；与标准档共用同一内部题池；难度未经过标定；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'verbal_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'verbal_reasoning', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'verbal_reasoning', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.1.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完整记录且无中断；有效正确用时不足时只描述正确率和遗漏。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    title: '认知估计',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先确定单位和数量级，再作近似估算。', '结合题内线索核查估计是否合理，不作同龄人排名。'],
    disclaimer: '结果只描述本次认知估计的表现，不是语言能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
