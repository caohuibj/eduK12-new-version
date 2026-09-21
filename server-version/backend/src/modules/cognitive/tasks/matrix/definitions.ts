import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const matrixRegistryMeta = {
  name: '矩阵规则推理', category: 'fluid_reasoning', referenceEligibleMetricKeys: [] as const, randomizationAlgorithmVersion: 'seq-v1.0.0', profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [3, 5], configPatch: { itemCount: 6 }, reportCaveats: ['体验档题目较少，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [8, 12], configPatch: { itemCount: 16 }, reportCaveats: ['内部生成题库，只描述本次规则归纳表现。'] },
    research: { profile: 'research' as const, estimatedMinutes: [12, 18], configPatch: { itemCount: 24 }, reportCaveats: ['科研档覆盖全部三种规则族和难度；仍不是智力测验。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '正确率', 'fluid_reasoning', 'ratio', 'higher_is_better', 'primary'),
    accuracyByRuleFamily: metric('accuracyByRuleFamily', '各规则族正确率', 'fluid_reasoning', 'map', 'descriptive', 'primary'),
    reachedDifficulty: metric('reachedDifficulty', '达到的最高难度', 'fluid_reasoning', 'level', 'descriptive', 'secondary'),
    medianRtMs: metric('medianRtMs', '正确反应中位时长', 'fluid_reasoning', 'ms', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏比例', 'fluid_reasoning', 'ratio', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '遗漏与回答模式是否达到门槛。' },
    constantResponse: { key: 'constantResponse', label: '恒定选项回答', description: '足够多题始终选择同一选项。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '遗漏比例达到 0.3。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: { title: '矩阵规则推理', headlineMetric: 'accuracy', primaryMetrics: ['accuracy', 'accuracyByRuleFamily'], secondaryMetrics: ['reachedDifficulty', 'medianRtMs', 'omissionRate'], practicalTips: ['正确率按规则族和难度覆盖一起阅读，不换算 IQ 或智力等级。'], disclaimer: '结果只反映本次内部矩阵规则任务表现，不是 Raven、IQ、临床判断或人口常模。' } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
