import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const flankerRegistryMeta = {
  name: 'Flanker 箭头干扰',
  category: 'interference_control',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 24 },
      reportCaveats: ['体验版试次较少，干扰效应稳定性有限，不进入综合分析。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 80 },
      reportCaveats: ['正式版同时呈现干扰 RT 与两条件准确率，不形成单一抑制等级。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [9, 12],
      configPatch: { totalTrials: 160 },
      reportCaveats: ['科研档增加平衡试次；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    flankerEffectMs: metric('flankerEffectMs', 'Flanker 干扰效应', 'interference_control', 'ms', 'lower_is_better', 'primary'),
    incongruentAccuracy: metric('incongruentAccuracy', '不一致条件准确率', 'interference_control', 'ratio', 'higher_is_better', 'primary'),
    congruentAccuracy: metric('congruentAccuracy', '一致条件准确率', 'interference_control', 'ratio', 'higher_is_better', 'primary'),
    errorCost: metric('errorCost', '准确率干扰代价', 'interference_control', 'ratio', 'lower_is_better', 'primary'),
    accuracy: metric('accuracy', '总体准确率', 'interference_control', 'ratio', 'higher_is_better', 'secondary'),
    medianRtCongruent: metric('medianRtCongruent', '一致条件中位RT', 'interference_control', 'ms', 'descriptive', 'secondary'),
    medianRtIncongruent: metric('medianRtIncongruent', '不一致条件中位RT', 'interference_control', 'ms', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '未反应比例', 'interference_control', 'ratio', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '两条件有效正确试次和总体准确率是否达到门槛。' },
    insufficientCongruentTrials: { key: 'insufficientCongruentTrials', label: '一致条件有效试次不足', description: '一致条件正确有效反应过少。' },
    insufficientIncongruentTrials: { key: 'insufficientIncongruentTrials', label: '不一致条件有效试次不足', description: '不一致条件正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '准确率过低', description: '总体准确率低于 0.5。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '未反应过多', description: '未反应比例达到 0.3。' },
    constantResponse: { key: 'constantResponse', label: '恒定反应', description: '足够多试次始终按同一方向。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或中断试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Flanker 箭头干扰',
    headlineMetric: 'flankerEffectMs',
    primaryMetrics: ['flankerEffectMs', 'incongruentAccuracy', 'congruentAccuracy', 'errorCost'],
    secondaryMetrics: ['accuracy', 'medianRtCongruent', 'medianRtIncongruent', 'omissionRate'],
    practicalTips: ['干扰效应必须与两种条件的准确率一起解释，避免速度—准确权衡误读。'],
    disclaimer: '结果反映本次箭头干扰任务表现，不是临床诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
