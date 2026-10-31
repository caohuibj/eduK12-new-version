import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const lineangleRegistryMeta = {
  name: '线条方向判断',
  category: 'visuospatial_perception',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'lineangle-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['结果描述本次线段方向匹配表现，不是空间能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研档仅增加试次，角度步长与选项数和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'visuospatial_perception', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'visuospatial_perception', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'visuospatial_perception', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'visuospatial_perception', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'visuospatial_perception', 'count', 'descriptive', 'secondary'),
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
    title: '线条方向判断',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先看目标线段斜向哪边，再逐个对比选项。', '角度很接近时，注意线段与水平方向的夹角大小。'],
    disclaimer: '结果只描述本次线段方向匹配的表现，不是空间能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const lineangleRegistryMetaV2 = {
  ...lineangleRegistryMeta,
  randomizationAlgorithmVersion: 'lineangle-axis-sequence-v2.0.0',
  profileDefinitionVersion: '2.0.0', metricDefinitionVersion: '2.0.0', reportDefinitionVersion: '2.0.0',
  reportDefinition: { ...lineangleRegistryMeta.reportDefinition, practicalTips: ['线段没有箭头，反向但平行仍是同一方向。', '先确定倾斜朝向，再比较与目标的夹角；与自己的正确率和用时一起读。'], disclaimer: '本次无向线段匹配正确率和用时，不是能力指数、诊断或已验证常模；不能与1.0.0直接比较。' },
}
