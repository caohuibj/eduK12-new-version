import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const timecopyRegistryMeta = {
  name: '时间间隔复制',
  category: 'temporal_cognition',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'timecopy-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 6 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 10 },
      reportCaveats: ['结果描述本次时间复制表现，不是注意力或时间管理能力诊断。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 20 },
      reportCaveats: ['科研档仅增加试次，目标范围和难度与标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    meanAbsErrorRatio: metric('meanAbsErrorRatio', '平均相对误差', 'temporal_cognition', 'ratio', 'lower_is_better', 'primary'),
    biasRatio: metric('biasRatio', '方向偏差', 'temporal_cognition', 'ratio', 'signed', 'secondary'),
    withinTwentyRate: metric('withinTwentyRate', '20%内命中率', 'temporal_cognition', 'ratio', 'higher_is_better', 'secondary'),
    medianReproductionMs: metric('medianReproductionMs', '复制时长中位数', 'temporal_cognition', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '存在有效复制且平均误差未过量。' },
    emptyResponses: { key: 'emptyResponses', label: '无有效复制', description: '没有可计入的复制试次。' },
    excessiveDeviation: { key: 'excessiveDeviation', label: '平均误差过量', description: '平均绝对相对误差达到 1（平均偏离目标的 100%）；这是本任务的质量提示，非诊断界限。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    title: '时间间隔复制',
    headlineMetric: 'meanAbsErrorRatio',
    primaryMetrics: ['meanAbsErrorRatio', 'withinTwentyRate'],
    secondaryMetrics: ['biasRatio', 'medianReproductionMs'],
    showProductIndex: false,
    practicalTips: ['心里默数或感受节奏都可以，选一种并保持一致。', '复制时不要看表，凭感觉按下结束。'],
    disclaimer: '结果只描述本次时间复制表现，不是注意力、时间管理或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
