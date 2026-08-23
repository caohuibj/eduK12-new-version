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
  recommendedForCreate: false,
}

export const reactionRegistryMetaV11 = {
  ...reactionRegistryMeta,
  profileDefinitionVersion: '1.1.0',
  metricDefinitionVersion: '1.1.0',
  qualityDefinitionVersion: '1.1.0',
  reportDefinitionVersion: '1.1.0',
  qualityDefinitions: {
    ...reactionRegistryMeta.qualityDefinitions,
    excessivePremature: { key: 'excessivePremature', label: '提前反应过多', description: '至少 20% 试次出现提前反应。' },
    extremeRtPattern: { key: 'extremeRtPattern', label: '反应时模式极端', description: '有效反应时变异系数超过 0.8。' },
  } as Record<string, QualityDefinition>,
  reportDefinition: {
    ...reactionRegistryMeta.reportDefinition,
    practicalTips: ['在需要快速响应时先减少外部干扰。', '比较多次结果时尽量使用相近设备和作答方式。'],
    disclaimer: '结果反映本次任务表现，不是医学诊断或人口常模。任务表现指数不是常模位置。',
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
  recommendedForCreate: false,
}

export const stroopRegistryMetaV11 = {
  ...stroopRegistryMeta,
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

export const gonogoRegistryMeta = {
  name: 'Go/No-Go',
  category: 'response_inhibition',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 40, nogoRatio: 0.25 },
      reportCaveats: ['体验版，结果仅供体验。短程抑制指标不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 120, nogoRatio: 0.25 },
      reportCaveats: ['正式版反映本次反应抑制表现，不是临床抑制分数。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [10, 14],
      configPatch: { totalTrials: 240, nogoRatio: 0.25 },
      reportCaveats: ['科研档增加试次；仍不是常模或诊断。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    commissionRate: metric('commissionRate', 'No-Go 误按率', 'response_inhibition', 'ratio', 'lower_is_better', 'primary'),
    dPrime: metric('dPrime', '信号检测敏感度 d′', 'response_inhibition', 'd-prime', 'higher_is_better', 'primary'),
    goMedianRtMs: metric('goMedianRtMs', 'Go 正确反应中位RT', 'response_inhibition', 'ms', 'descriptive', 'secondary'),
    hitRate: metric('hitRate', 'Go 命中率', 'response_inhibition', 'ratio', 'higher_is_better', 'secondary'),
    omissionRate: metric('omissionRate', 'Go 遗漏率', 'response_inhibition', 'ratio', 'lower_is_better', 'secondary'),
    commissionErrors: metric('commissionErrors', 'No-Go 误按次数', 'response_inhibition', 'count', 'lower_is_better', 'secondary'),
    goTrialCount: metric('goTrialCount', 'Go 试次数', 'response_inhibition', 'count', 'descriptive', 'secondary'),
    nogoTrialCount: metric('nogoTrialCount', 'No-Go 试次数', 'response_inhibition', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: 'No-Go 试次与遗漏是否达到门槛。' },
    insufficientNoGoTrials: { key: 'insufficientNoGoTrials', label: 'No-Go 试次不足', description: 'No-Go 试次过少。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: 'Go 遗漏过高', description: 'Go 遗漏率达到 0.3。' },
    extremeCommissionRate: { key: 'extremeCommissionRate', label: '误按率极端', description: 'No-Go 误按率达到 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Go/No-Go',
    headlineMetric: 'commissionRate',
    primaryMetrics: ['commissionRate', 'dPrime'],
    secondaryMetrics: ['goMedianRtMs', 'hitRate', 'omissionRate', 'commissionErrors'],
    practicalTips: ['Go RT 只解释速度—准确权衡，不能单独代表抑制能力。'],
    disclaimer: '结果反映本次反应抑制任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const cptRegistryMeta = {
  name: '连续执行任务 CPT-X',
  category: 'sustained_attention',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 60, blockCount: 1, targetRatio: 0.2 },
      reportCaveats: ['体验版，结果仅供体验。短程持续注意指标不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 180, blockCount: 3, targetRatio: 0.2 },
      reportCaveats: ['正式版须同时看 d′、遗漏、误报和 RT 变异。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [14, 20],
      configPatch: { totalTrials: 360, blockCount: 6, targetRatio: 0.2 },
      reportCaveats: ['科研档分 6 个 block，仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrime: metric('dPrime', '目标辨别 d′', 'sustained_attention', 'd-prime', 'higher_is_better', 'primary'),
    omissionRate: metric('omissionRate', '目标遗漏率', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    commissionRate: metric('commissionRate', '非目标误报率', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    rtICV: metric('rtICV', '命中RT变异系数', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    hitMedianRtMs: metric('hitMedianRtMs', '目标命中中位RT', 'sustained_attention', 'ms', 'descriptive', 'secondary'),
    hitRtSdMs: metric('hitRtSdMs', '目标RT标准差', 'sustained_attention', 'ms', 'lower_is_better', 'secondary'),
    blockSlopeRt: metric('blockSlopeRt', '跨 block RT 斜率', 'sustained_attention', 'ms', 'descriptive', 'research_only', { availableProfiles: ['research'] }),
    blockSlopeOmission: metric('blockSlopeOmission', '跨 block 遗漏斜率', 'sustained_attention', 'ratio', 'descriptive', 'research_only', { availableProfiles: ['research'] }),
    perseverationRate: metric('perseverationRate', '极短反应比例', 'sustained_attention', 'ratio', 'lower_is_better', 'secondary'),
    targetCount: metric('targetCount', '目标试次数', 'sustained_attention', 'count', 'descriptive', 'secondary'),
    hitCount: metric('hitCount', '命中次数', 'sustained_attention', 'count', 'higher_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '目标试次与遗漏是否达到门槛。' },
    insufficientTargets: { key: 'insufficientTargets', label: '目标试次不足', description: '目标试次过少。' },
    highOmissionRate: { key: 'highOmissionRate', label: '遗漏过高', description: '目标遗漏率达到 0.4。' },
    highPerseverationRate: { key: 'highPerseverationRate', label: '极短反应过多', description: '低于 100ms 的反应比例过高。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '连续执行任务 CPT-X',
    headlineMetric: 'dPrime',
    primaryMetrics: ['dPrime', 'omissionRate', 'commissionRate', 'rtICV'],
    secondaryMetrics: ['hitMedianRtMs', 'hitRtSdMs', 'perseverationRate', 'blockSlopeRt', 'blockSlopeOmission'],
    practicalTips: ['单一反应时不能代表持续注意，请同时看遗漏与误报。'],
    disclaimer: '结果反映本次持续注意任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const nbackRegistryMeta = {
  name: 'N-Back 工作记忆更新',
  category: 'working_memory_updating',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { nLevels: [1], trialCountByN: [30], blockCountByN: [1] },
      reportCaveats: ['体验版只有 1-back，结果仅供体验。maxReliableN 不是标准化工作记忆等级。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [6, 8],
      configPatch: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1] },
      reportCaveats: ['正式版看各 N 的 d′ 与负荷效应，不是常模等级。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [12, 16],
      configPatch: { nLevels: [1, 2, 3], trialCountByN: [60, 60, 60], blockCountByN: [2, 2, 2] },
      reportCaveats: ['科研档含 1/2/3-back；仍不是人口常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrimeByN: metric('dPrimeByN', '各 N 水平 d′', 'working_memory_updating', 'map', 'higher_is_better', 'primary'),
    maxReliableN: metric('maxReliableN', '达到质量门槛的最高 N', 'working_memory_updating', 'level', 'higher_is_better', 'primary'),
    hitRateByN: metric('hitRateByN', '各 N 命中率', 'working_memory_updating', 'map', 'higher_is_better', 'secondary'),
    falseAlarmRateByN: metric('falseAlarmRateByN', '各 N 误报率', 'working_memory_updating', 'map', 'lower_is_better', 'secondary'),
    medianRtByN: metric('medianRtByN', '各 N 正确反应中位RT', 'working_memory_updating', 'map', 'descriptive', 'secondary'),
    loadCostDPrime: metric('loadCostDPrime', '高负荷相对低负荷的 d′ 下降', 'working_memory_updating', 'd-prime', 'signed', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '至少一个 N 水平达到质量门槛。' },
    insufficientTargetsByN: { key: 'insufficientTargetsByN', label: '某 N 目标不足', description: '至少一个 N 水平目标试次过少。' },
    ceilingOrFloorByN: { key: 'ceilingOrFloorByN', label: '某 N 触顶或触底', description: '命中率接近天花板或地板。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '目标遗漏过高', description: '目标遗漏率达到 0.4。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'N-Back 工作记忆更新',
    headlineMetric: 'maxReliableN',
    primaryMetrics: ['dPrimeByN', 'maxReliableN'],
    secondaryMetrics: ['hitRateByN', 'falseAlarmRateByN', 'medianRtByN', 'loadCostDPrime'],
    practicalTips: ['maxReliableN 只是本次配置内表现，不是标准化工作记忆等级。'],
    disclaimer: '结果反映本次工作记忆更新任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

export const corsiRegistryMeta = {
  name: 'Corsi 视空间广度',
  category: 'visuospatial_memory',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 4],
      configPatch: { startSpan: 3, maxSpan: 6 },
      reportCaveats: ['体验版广度上限较低，结果仅供体验。Corsi 不与数字广度合并为记忆总分。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { startSpan: 3, maxSpan: 8 },
      reportCaveats: ['正式版反映视空间广度，不是统一记忆总分。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 10],
      configPatch: { startSpan: 3, maxSpan: 9 },
      reportCaveats: ['科研档上限 9；连续一整级失败即终止。仍不是常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    maxSpan: metric('maxSpan', '最大空间广度', 'visuospatial_memory', 'count', 'higher_is_better', 'primary'),
    totalCorrectTrials: metric('totalCorrectTrials', '总正确试次', 'visuospatial_memory', 'count', 'higher_is_better', 'primary'),
    firstTryPassCount: metric('firstTryPassCount', '首次通过级数', 'visuospatial_memory', 'count', 'higher_is_better', 'secondary'),
    medianResponseDurationMs: metric('medianResponseDurationMs', '中位复现时长', 'visuospatial_memory', 'ms', 'descriptive', 'secondary'),
    sequenceErrorDistance: metric('sequenceErrorDistance', '序列位置错误距离', 'visuospatial_memory', 'score', 'lower_is_better', 'research_only', { availableProfiles: ['research'] }),
    trialCount: metric('trialCount', '正式试次数', 'visuospatial_memory', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完成级数与序列是否达到门槛。' },
    insufficientCompletedLevels: { key: 'insufficientCompletedLevels', label: '完成级数不足', description: '完成的广度级数过少。' },
    invalidBlockSequence: { key: 'invalidBlockSequence', label: '无效方块序列', description: '作答含重复或越界方块。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Corsi 视空间广度',
    headlineMetric: 'maxSpan',
    primaryMetrics: ['maxSpan', 'totalCorrectTrials'],
    secondaryMetrics: ['firstTryPassCount', 'medianResponseDurationMs', 'sequenceErrorDistance'],
    practicalTips: ['Corsi 代表视空间广度，不要与数字广度合并成记忆总分。'],
    disclaimer: '结果反映本次视空间记忆任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
