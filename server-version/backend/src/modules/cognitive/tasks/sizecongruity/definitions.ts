import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const sizecongruityRegistryMeta = {
  name: '数量大小比较',
  category: 'inhibitory_control',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'sizecongruity-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['体验版，结果仅供体验。短程干扰效应不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 5],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['结果描述本次数量比较表现，不是数学能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 10],
      configPatch: { totalTrials: 96 },
      reportCaveats: ['科研档仅增加试次，难度与标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    sizeCongruityEffectMs: metric('sizeCongruityEffectMs', '数量一致性效应', 'inhibitory_control', 'ms', 'lower_is_better', 'primary'),
    incongruentAccuracy: metric('incongruentAccuracy', '不一致条件正确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'primary'),
    accuracy: metric('accuracy', '总体正确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'secondary'),
    congruentAccuracy: metric('congruentAccuracy', '一致条件正确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'secondary'),
    medianRtCongruent: metric('medianRtCongruent', '一致条件中位RT', 'inhibitory_control', 'ms', 'lower_is_better', 'secondary'),
    medianRtIncongruent: metric('medianRtIncongruent', '不一致条件中位RT', 'inhibitory_control', 'ms', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'inhibitory_control', 'count', 'lower_is_better', 'secondary'),
    validCongruentRtCount: metric('validCongruentRtCount', '一致有效RT数', 'inhibitory_control', 'count', 'descriptive', 'secondary'),
    validIncongruentRtCount: metric('validIncongruentRtCount', '不一致有效RT数', 'inhibitory_control', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '一致/不一致有效 RT 是否足够。' },
    insufficientValidCongruentRt: { key: 'insufficientValidCongruentRt', label: '一致有效RT不足', description: '一致条件有效反应过少。' },
    insufficientValidIncongruentRt: { key: 'insufficientValidIncongruentRt', label: '不一致有效RT不足', description: '不一致条件有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，干扰指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '数量大小比较',
    headlineMetric: 'sizeCongruityEffectMs',
    primaryMetrics: ['sizeCongruityEffectMs', 'incongruentAccuracy'],
    secondaryMetrics: ['accuracy', 'congruentAccuracy', 'medianRtCongruent', 'medianRtIncongruent', 'timeoutCount'],
    practicalTips: ['只比较数值大小，忽略数字显示的大小；先确认规则再作答。', '当数字外观与数值打架时，稍作停顿反而更准。'],
    disclaimer: '结果只描述本次数量比较的表现，不是数学能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
