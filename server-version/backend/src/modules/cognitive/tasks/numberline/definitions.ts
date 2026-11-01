import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const numberlineRegistryMeta = {
  name: '数字线估计',
  category: 'numerical_cognition',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'numberline-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 20 },
      reportCaveats: ['结果描述本次数字线估计表现，不是数学能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['科研档仅增加试次，难度与标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    paePercent: metric('paePercent', '平均绝对误差', 'numerical_cognition', 'ratio', 'lower_is_better', 'primary'),
    biasPercent: metric('biasPercent', '方向偏差', 'numerical_cognition', 'ratio', 'signed', 'secondary'),
    withinTenRate: metric('withinTenRate', '十格命中率', 'numerical_cognition', 'ratio', 'higher_is_better', 'secondary'),
    medianRtMs: metric('medianRtMs', '作答用时中位数', 'numerical_cognition', 'ms', 'lower_is_better', 'secondary'),
    validTrialCount: metric('validTrialCount', '有效试次数', 'numerical_cognition', 'count', 'descriptive', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'numerical_cognition', 'count', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '有效试次与完成情况是否达到门槛。' },
    insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '有效估计数量少于计划试次的一半。' },
    excessiveTimeouts: { key: 'excessiveTimeouts', label: '超时过多', description: '超时次数超过计划试次的一半。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '数字线估计',
    headlineMetric: 'paePercent',
    primaryMetrics: ['paePercent', 'withinTenRate'],
    secondaryMetrics: ['biasPercent', 'medianRtMs', 'validTrialCount', 'timeoutCount'],
    practicalTips: ['估计位置时，先想清楚这个数和 0、中点、最大值的关系，再作答。', '数字越大不代表越难，试着把线段均匀分段来定位。'],
    disclaimer: '结果只描述本次数字线上的估计表现，不是数学能力、计算水平或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
