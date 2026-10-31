import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const icarmatrixRegistryMeta = {
  name: '图形矩阵推理',
  category: 'fluid_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'icarmatrix-gen-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版仅使用冻结题库，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 8],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['结果描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 12],
      configPatch: { totalTrials: 24 },
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
    title: '图形矩阵推理',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先横着看每行缺什么，再竖着验证规律。', '属性可能同时变化：形状、填充、数量分开来看。'],
    disclaimer: '结果只描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价，也不是年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const icarmatrixV2RegistryMeta = {
  name: '图形矩阵推理 · 规则题库版',
  category: 'fluid_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'matgen-bank-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 4 },
      reportCaveats: ['体验版仅供体验，结果不构成能力评估。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['结果描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['科研档增加试次以提高稳定性；难度与刺激（matrixType/题库）和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'fluid_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '作答中位用时', 'fluid_reasoning', 'ms', 'descriptive', 'secondary'),
    correctCount: metric('correctCount', '正确题数', 'fluid_reasoning', 'count', 'higher_is_better', 'secondary'),
    accuracyByRuleTag: { ...metric('accuracyByRuleTag', '规则维度正确率', 'fluid_reasoning', 'map', 'higher_is_better', 'research_only'), description: '按图形规则（shape/rotate/shade/size/identity）分维度的正确率；研究画像用，不进入被试报告。' },
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '存在已完成试次。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
    excessiveTimeouts: { key: 'excessiveTimeouts', label: '超时过多', description: '超时试次占比达 0.4。' },
    rapidGuessing: { key: 'rapidGuessing', label: '快速猜测', description: '低于有效 RT 下限的作答占比达 0.3。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '图形矩阵推理 · 规则题库版',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy'],
    secondaryMetrics: ['medianRtMs', 'correctCount'],
    practicalTips: ['先横着看每行变了什么，再竖着验证。', '规则可能组合：位置、旋转、填充、大小分开看。'],
    disclaimer: '结果只描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价，也不是年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
