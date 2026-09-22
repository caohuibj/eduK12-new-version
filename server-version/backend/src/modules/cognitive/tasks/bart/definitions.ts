import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const bartRegistryMeta = {
  name: 'BART 泵压任务',
  category: 'risk_taking',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'bart-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 4],
      configPatch: { balloonCount: 10 },
      reportCaveats: ['体验版只描述本次虚拟 balloon 行为，不输出风险等级。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { balloonCount: 30 },
      reportCaveats: ['指标只描述泵压、爆破和现金化次数，不推断稳定的人格或风险特征。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 12],
      configPatch: { balloonCount: 50 },
      reportCaveats: ['科研版增加 balloon 数量用于稳定性审查；不使用好坏等级或风险分类。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    adjustedPumps: metric('adjustedPumps', 'Adjusted pumps', 'risk_taking', 'count', 'descriptive', 'primary'),
    explosionCount: metric('explosionCount', '爆破次数', 'risk_taking', 'count', 'descriptive', 'primary'),
    cashoutCount: metric('cashoutCount', '现金化次数', 'risk_taking', 'count', 'descriptive', 'primary'),
    meanPumpsAllCompleted: metric('meanPumpsAllCompleted', '已完成 balloon 平均泵压', 'risk_taking', 'count', 'descriptive', 'secondary'),
    cashoutRate: metric('cashoutRate', '现金化比例', 'risk_taking', 'ratio', 'descriptive', 'secondary'),
    completedBalloonCount: metric('completedBalloonCount', '完成 balloon 数', 'risk_taking', 'count', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏比例', 'risk_taking', 'ratio', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完成 balloon 和现金化观察数是否达到门槛。' },
    insufficientCompletedBalloons: { key: 'insufficientCompletedBalloons', label: '完成 balloon 不足', description: '完成的 balloon 少于配置数量的 70%。' },
    insufficientCashoutBalloons: { key: 'insufficientCashoutBalloons', label: '现金化观察不足', description: '用于 adjusted pumps 的现金化 balloon 少于 3 个。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '未完成 balloon 比例达到 0.3。' },
    constantPumpPattern: { key: 'constantPumpPattern', label: '泵压模式恒定', description: '足够多已完成 balloon 使用相同泵压次数。' },
    invalidOutcome: { key: 'invalidOutcome', label: '结果状态不一致', description: '客户端声明与冻结爆破阈值不一致。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '至少一个 balloon 被标记为中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'BART 泵压任务',
    headlineMetric: 'adjustedPumps',
    primaryMetrics: ['adjustedPumps', 'explosionCount', 'cashoutCount'],
    secondaryMetrics: ['meanPumpsAllCompleted', 'cashoutRate', 'completedBalloonCount', 'omissionRate'],
    showProductIndex: false,
    practicalTips: ['Adjusted pumps、爆破次数和现金化次数应作为本次任务内的描述性指标阅读，不形成风险高低或好坏等级。'],
    disclaimer: '结果只描述本次虚拟 balloon 任务中的泵压、爆破和现金化行为，不是风险偏好、冲动性、人格或临床判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}

export const bartRegistryMetaV11 = {
  ...bartRegistryMeta,
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: {
    ...bartRegistryMeta.metricDefinitions,
    adjustedPumps: metric('adjustedPumps', '现金化气球平均泵压', 'risk_taking', 'count', 'descriptive', 'primary', { valueType: 'number', precision: 4 }),
    meanPumpsAllCompleted: metric('meanPumpsAllCompleted', '已完成气球平均泵压', 'risk_taking', 'count', 'descriptive', 'secondary', { valueType: 'number', precision: 4 }),
  } as Record<string, MetricDefinition>,
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    ...bartRegistryMeta.reportDefinition,
    practicalTips: ['平均泵压、爆破次数和现金化次数应作为本次任务内的描述性指标阅读，不形成风险高低或好坏等级。'],
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
