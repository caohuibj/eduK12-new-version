import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const mentalrotationRegistryMeta = {
  name: '心理旋转', category: 'visuospatial_reasoning', referenceEligibleMetricKeys: [] as const, randomizationAlgorithmVersion: 'seq-v1.0.0', profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [2, 4], configPatch: { totalTrials: 12 }, reportCaveats: ['体验档角度条件较少，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [6, 9], configPatch: { totalTrials: 40 }, reportCaveats: ['角度、镜像和图形族平衡；不代表完整空间能力。'] },
    research: { profile: 'research' as const, estimatedMinutes: [11, 16], configPatch: { totalTrials: 80 }, reportCaveats: ['科研档使用完整内部题库；仍不是空间智力常模。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '正确率', 'visuospatial_reasoning', 'ratio', 'higher_is_better', 'primary'),
    angleCost: metric('angleCost', '大角度反应时代价', 'visuospatial_reasoning', 'ms', 'lower_is_better', 'primary'),
    medianCorrectRtMs: metric('medianCorrectRtMs', '正确反应中位RT', 'visuospatial_reasoning', 'ms', 'lower_is_better', 'primary'),
    mirrorErrorRate: metric('mirrorErrorRate', '镜像项目错误率', 'visuospatial_reasoning', 'ratio', 'lower_is_better', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏比例', 'visuospatial_reasoning', 'ratio', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '准确率、遗漏和角度覆盖是否达到门槛。' },
    constantResponse: { key: 'constantResponse', label: '恒定回答', description: '足够多试次始终选择同一种判断。' },
    insufficientAngleCoverage: { key: 'insufficientAngleCoverage', label: '角度有效试次不足', description: '小角度或大角度正确有效反应不足。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '遗漏比例达到 0.3。' },
    lowAccuracy: { key: 'lowAccuracy', label: '准确率过低', description: '总体正确率低于 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: { title: '心理旋转', headlineMetric: 'accuracy', primaryMetrics: ['accuracy', 'angleCost', 'medianCorrectRtMs'], secondaryMetrics: ['mirrorErrorRate', 'omissionRate'], practicalTips: ['角度代价只在大小角度都有足够正确反应时解释，并与正确率同屏阅读。'], disclaimer: '结果只反映本次内部几何旋转任务表现，不是完整空间智力、诊断或人口常模。' } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
