import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from './cognitive.types'

const allProfiles: CognitiveProfile[] = ['experience', 'standard', 'research']

const metric = (
  key: string,
  label: string,
  construct: string,
  unit: MetricDefinition['unit'],
  direction: MetricDefinition['direction'],
  role: MetricDefinition['role'],
  extra: Partial<MetricDefinition> = {},
): MetricDefinition => ({
  key,
  label,
  construct,
  description: label,
  unit,
  valueType: unit === 'map' ? 'object' : unit === 'count' || unit === 'level' ? 'integer' : 'number',
  direction,
  role,
  availableProfiles: allProfiles,
  export: { summary: role !== 'research_only', label },
  ...extra,
})

export const fakeRegistryMeta = {
  name: 'Fake 测试',
  category: 'framework',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，仅供体验。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，不反映真实能力。'] },
    research: { profile: 'research' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，不得用于研究结论。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    trialCount: metric('trialCount', '试次数', 'framework', 'count', 'descriptive', 'secondary'),
    correctCount: metric('correctCount', '正确数', 'framework', 'count', 'higher_is_better', 'secondary'),
    accuracy: metric('accuracy', '正确率', 'framework', 'ratio', 'higher_is_better', 'primary'),
    meanRtMs: metric('meanRtMs', '平均反应时', 'framework', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '框架任务默认可展示。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Fake 测试',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy'],
    secondaryMetrics: ['meanRtMs', 'correctCount', 'trialCount'],
    disclaimer: 'Fake 任务仅用于验证框架，不反映真实能力。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const reactionRegistryMeta = {
  name: '简单反应时',
  category: 'processing_speed',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [1, 2],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 20 },
      reportCaveats: ['正式版结果反映本次任务表现，不是人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研版增加试次以提高稳定性，仍不是临床常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    medianRtMs: metric('medianRtMs', '中位反应时', 'processing_speed', 'ms', 'lower_is_better', 'primary'),
    rtICV: metric('rtICV', '反应时变异系数', 'processing_speed', 'ratio', 'lower_is_better', 'primary'),
    missRate: metric('missRate', '遗漏率', 'processing_speed', 'ratio', 'lower_is_better', 'primary'),
    meanRtMs: metric('meanRtMs', '平均反应时', 'processing_speed', 'ms', 'lower_is_better', 'secondary'),
    sdRtMs: metric('sdRtMs', '反应时标准差', 'processing_speed', 'ms', 'lower_is_better', 'secondary'),
    fastestRtMs: metric('fastestRtMs', '最快有效反应', 'processing_speed', 'ms', 'descriptive', 'secondary'),
    prematureCount: metric('prematureCount', '提前反应次数', 'processing_speed', 'count', 'lower_is_better', 'secondary'),
    validTrialCount: metric('validTrialCount', '有效试次数', 'processing_speed', 'count', 'higher_is_better', 'secondary'),
    missCount: metric('missCount', '遗漏次数', 'processing_speed', 'count', 'lower_is_better', 'secondary'),
    totalTrials: metric('totalTrials', '总试次数', 'processing_speed', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '有效试次是否达到评分门槛。' },
    insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '有效 hit 比例过低。' },
    highMissRate: { key: 'highMissRate', label: '遗漏过高', description: '超时/无效反应比例过高。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '简单反应时',
    headlineMetric: 'medianRtMs',
    primaryMetrics: ['medianRtMs', 'rtICV', 'missRate'],
    secondaryMetrics: ['meanRtMs', 'sdRtMs', 'fastestRtMs', 'prematureCount', 'validTrialCount'],
    disclaimer: '结果反映本次任务表现，不是医学诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const memoryRegistryMeta = {
  name: '数字广度顺背',
  category: 'working_memory',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { maxLength: 6 },
      reportCaveats: ['体验版，结果仅供体验。本版本 startLength 仍为已发布配置的 2。'],
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
  recommendedForCreate: true,
}

export const stroopRegistryMeta = {
  name: '色词 Stroop',
  category: 'inhibitory_control',
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
  recommendedForCreate: true,
}
