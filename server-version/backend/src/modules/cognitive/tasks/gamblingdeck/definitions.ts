import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const gamblingdeckRegistryMeta = {
  name: '宝箱决策学习',
  category: 'decision_learning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'gamblingdeck-fixed-schedule-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['体验版，学习趋势指标仅作演示。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['结果描述本次决策学习过程，不是冲动性诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 12],
      configPatch: { totalTrials: 100 },
      reportCaveats: ['科研档仅增加试次，计划与难度和标准档一致；分块趋势估计更稳；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    advantageousChoiceRate: metric('advantageousChoiceRate', '优势箱选择比例', 'decision_learning', 'ratio', 'higher_is_better', 'primary'),
    netScore: metric('netScore', '累计净得分', 'decision_learning', 'count', 'higher_is_better', 'primary'),
    blockTrendSlope: metric('blockTrendSlope', '分块学习斜率', 'decision_learning', 'ratio', 'signed', 'secondary'),
    deckChoiceRates: metric('deckChoiceRates', '各箱选择比例', 'decision_learning', 'map', 'descriptive', 'research_only'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '全部试次完成箱选择。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '宝箱决策学习',
    headlineMetric: 'advantageousChoiceRate',
    primaryMetrics: ['advantageousChoiceRate', 'netScore'],
    secondaryMetrics: ['blockTrendSlope'],
    practicalTips: ['先在小损失里观察规律：有的箱子赢多输得也多。', '如果发现自己总选同一个箱子，试着换一个对比一下。'],
    disclaimer: '结果只描述本次四箱任务的决策学习过程，不是冲动性、风险性格或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
