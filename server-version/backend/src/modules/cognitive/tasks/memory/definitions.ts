import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const memoryRegistryMeta = {
  name: '数字广度顺背',
  category: 'working_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'memory-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { maxLength: 6 },
      reportCaveats: ['体验版，结果仅供体验。本 scoringVersion 对应已发布 startLength=2 配置。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { maxLength: 8 },
      reportCaveats: ['正式版结果不是人口百分位。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 8],
      configPatch: { maxLength: 9 },
      reportCaveats: ['科研版提高上限，仍须与具体记分定义一起解释。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    maxSpan: metric('maxSpan', '最大正确广度', 'working_memory', 'count', 'higher_is_better', 'primary'),
    levelsPassed: metric('levelsPassed', '通过长度级数', 'working_memory', 'count', 'higher_is_better', 'secondary'),
    firstTryPassCount: metric('firstTryPassCount', '首次尝试即通过的级数', 'working_memory', 'count', 'higher_is_better', 'secondary'),
    medianResponseDurationMs: metric('medianResponseDurationMs', '中位作答时长', 'working_memory', 'ms', 'descriptive', 'secondary'),
    trialCount: metric('trialCount', '实际完成试次数', 'working_memory', 'count', 'descriptive', 'secondary'),
    interruptedCount: metric('interruptedCount', '中断试次数', 'working_memory', 'count', 'lower_is_better', 'quality'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '是否完成足够层级。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '数字广度顺背',
    headlineMetric: 'maxSpan',
    primaryMetrics: ['maxSpan', 'levelsPassed'],
    secondaryMetrics: ['firstTryPassCount', 'medianResponseDurationMs', 'trialCount'],
    disclaimer: 'maxSpan 是本次任务容量指标，不是标准化记忆等级。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}

export const memoryRegistryMetaV11 = {
  ...memoryRegistryMeta,
  referenceEligibleMetricKeys: ['maxSpan'] as const,
  profileDefinitionVersion: '1.1.0',
  metricDefinitionVersion: '1.1.0',
  qualityDefinitionVersion: '1.1.0',
  reportDefinitionVersion: '1.1.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { startLength: 3, maxLength: 6 },
      reportCaveats: ['体验版，结果仅供体验。startLength=3 的短程，不能当作完整广度测量。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { startLength: 3, maxLength: 8 },
      reportCaveats: ['正式版结果不是人口常模，maxSpan 只描述本次任务容量。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 8],
      configPatch: { startLength: 3, maxLength: 9 },
      reportCaveats: ['科研版提高上限，仍须与具体记分定义一起解释。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitions: {
    ...memoryRegistryMeta.metricDefinitions,
    totalCorrectTrials: metric('totalCorrectTrials', '正确试次数', 'working_memory', 'count', 'higher_is_better', 'primary'),
    perseverativeTrialCount: metric(
      'perseverativeTrialCount',
      '持续重复作答试次数',
      'working_memory',
      'count',
      'lower_is_better',
      'quality',
    ),
  } as Record<string, MetricDefinition>,
  qualityDefinitions: {
    ...memoryRegistryMeta.qualityDefinitions,
    insufficientCompletedLevels: { key: 'insufficientCompletedLevels', label: '完成层级不足', description: '完成的长度层级少于两级，结果不够稳定。' },
    invalidSequencePattern: { key: 'invalidSequencePattern', label: '序列模式异常', description: '作答呈持续重复同一数字等异常模式。' },
  } as Record<string, QualityDefinition>,
  reportDefinition: {
    title: '数字广度顺背',
    headlineMetric: 'maxSpan',
    primaryMetrics: ['maxSpan', 'totalCorrectTrials'],
    secondaryMetrics: ['levelsPassed', 'firstTryPassCount', 'medianResponseDurationMs', 'trialCount'],
    practicalTips: ['较长信息可以尝试分组、复述和分段记忆。'],
    disclaimer: 'maxSpan 是本次任务容量指标，不是标准化记忆等级。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
