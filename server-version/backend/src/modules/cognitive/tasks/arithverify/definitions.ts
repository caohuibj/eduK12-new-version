import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const arithverifyRegistryMeta = {
  name: '算术验证',
  category: 'numerical_cognition',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'arithverify-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 2],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['结果描述本次算式验证表现，不是数学能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 8],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研档仅增加试次，难度与标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'numerical_cognition', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'numerical_cognition', 'ms', 'lower_is_better', 'primary'),
    problemSizeSlopeMs: metric('problemSizeSlopeMs', '问题规模斜率', 'numerical_cognition', 'ms', 'signed', 'secondary'),
    errorCount: metric('errorCount', '错误次数', 'numerical_cognition', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'numerical_cognition', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'numerical_cognition', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '算术验证',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs', 'problemSizeSlopeMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先算结果，再和给出的数比较；保持稳定节奏比抢快更重要。', '个位加法越熟练，判断越快；多练习能缩短反应时间。'],
    disclaimer: '结果只描述本次加法等式验证的表现，不是数学能力、计算水平或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
