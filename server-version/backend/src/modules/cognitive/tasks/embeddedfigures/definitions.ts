import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const embeddedfiguresRegistryMeta = {
  name: '嵌入图形',
  category: 'fluid_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'embeddedfigures-gen-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 6 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 10 },
      reportCaveats: ['结果描述本次隐藏图形查找表现，不是空间能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['科研档增加生成题数量；题库轨与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'fluid_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'fluid_reasoning', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'fluid_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'fluid_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'fluid_reasoning', 'count', 'descriptive', 'secondary'),
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
    title: '嵌入图形',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先记住目标的形状和大小，再在复杂图形里排除明显不像的。', '顶点数量是关键：目标永远是三角形。'],
    disclaimer: '结果只描述本次隐藏图形查找表现，不是空间能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
