import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const stroopRegistryMeta = {
  name: '色词 Stroop',
  category: 'inhibitory_control',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'stroop-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { totalTrials: 16, congruentRatio: 0.5 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 5],
      configPatch: { totalTrials: 24, congruentRatio: 0.5 },
      reportCaveats: ['本 configVersion 的正式档保持已发布 24 试次，不改历史协议。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 10],
      configPatch: { totalTrials: 48, congruentRatio: 0.5 },
      reportCaveats: ['科研档增加试次；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    stroopEffectMs: metric('stroopEffectMs', 'Stroop 干扰效应', 'inhibitory_control', 'ms', 'lower_is_better', 'primary'),
    errorCost: metric('errorCost', '错误代价', 'inhibitory_control', 'ratio', 'lower_is_better', 'primary'),
    incongruentAccuracy: metric('incongruentAccuracy', '不一致条件准确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'primary'),
    accuracy: metric('accuracy', '总体准确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'secondary'),
    congruentAccuracy: metric('congruentAccuracy', '一致条件准确率', 'inhibitory_control', 'ratio', 'higher_is_better', 'secondary'),
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
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '色词 Stroop',
    headlineMetric: 'stroopEffectMs',
    primaryMetrics: ['stroopEffectMs', 'incongruentAccuracy', 'errorCost'],
    secondaryMetrics: ['accuracy', 'congruentAccuracy', 'medianRtCongruent', 'medianRtIncongruent', 'timeoutCount'],
    disclaimer: '不得仅以总体准确率代表抑制能力，也不是年龄常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}

export const stroopRegistryMetaV11 = {
  ...stroopRegistryMeta,
  referenceEligibleMetricKeys: ['stroopEffectMs', 'incongruentAccuracy'] as const,
  profileDefinitionVersion: '1.1.0',
  metricDefinitionVersion: '1.1.0',
  qualityDefinitionVersion: '1.1.0',
  reportDefinitionVersion: '1.1.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { totalTrials: 16, congruentRatio: 0.5 },
      reportCaveats: ['体验版，结果仅供体验。短程干扰效应不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 5],
      configPatch: { totalTrials: 40, congruentRatio: 0.5 },
      reportCaveats: ['正式版结果反映本次色词干扰表现，不是年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 10],
      configPatch: { totalTrials: 96, congruentRatio: 0.5 },
      reportCaveats: ['科研档增加试次；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitions: {
    ...stroopRegistryMeta.metricDefinitions,
  } as Record<string, MetricDefinition>,
  qualityDefinitions: {
    ...stroopRegistryMeta.qualityDefinitions,
    lowAccuracy: { key: 'lowAccuracy', label: '总体准确率过低', description: '总体准确率低于 0.5，抑制指标需谨慎解释。' },
  } as Record<string, QualityDefinition>,
  reportDefinition: {
    title: '色词 Stroop',
    headlineMetric: 'stroopEffectMs',
    primaryMetrics: ['stroopEffectMs', 'incongruentAccuracy', 'errorCost'],
    secondaryMetrics: ['accuracy', 'congruentAccuracy', 'medianRtCongruent', 'medianRtIncongruent', 'timeoutCount'],
    practicalTips: ['面对冲突信息时先确认目标规则，再做响应。', '减少多任务切换可降低无关信息干扰。'],
    disclaimer: '不得仅以总体准确率代表抑制能力，也不是年龄常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
