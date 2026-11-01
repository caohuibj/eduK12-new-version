import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const seqlearnRegistryMeta = {
  name: '序列反应学习',
  category: 'implicit_learning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seqlearn-fixed-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 4],
      configPatch: { totalTrials: 40, randomBlockIndices: [3] },
      reportCaveats: ['体验版，学习指标仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 60, randomBlockIndices: [4] },
      reportCaveats: ['结果描述本次序列学习过程，不是学习能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 100, randomBlockIndices: [6] },
      reportCaveats: ['科研档仅增加试次，序列与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    srtPatternAdvantageMs: metric('srtPatternAdvantageMs', '序列学习效应', 'implicit_learning', 'ms', 'signed', 'primary'),
    accuracy: metric('accuracy', '总体正确率', 'implicit_learning', 'ratio', 'higher_is_better', 'secondary'),
    randomBlockAccuracy: metric('randomBlockAccuracy', '随机块正确率', 'implicit_learning', 'ratio', 'higher_is_better', 'secondary'),
    medianRtLatePatternMs: metric('medianRtLatePatternMs', '后期序列块中位RT', 'implicit_learning', 'ms', 'lower_is_better', 'secondary'),
    medianRtRandomMs: metric('medianRtRandomMs', '随机块中位RT', 'implicit_learning', 'ms', 'lower_is_better', 'secondary'),
    medianRtEarlyPatternMs: metric('medianRtEarlyPatternMs', '早期序列块中位RT', 'implicit_learning', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '随机块与后期序列块的正确有效 RT 是否足够。' },
    insufficientRandomRt: { key: 'insufficientRandomRt', label: '随机块有效RT不足', description: '随机块正确有效反应过少。' },
    insufficientPatternRt: { key: 'insufficientPatternRt', label: '序列块有效RT不足', description: '后期序列块正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '序列反应学习',
    headlineMetric: 'srtPatternAdvantageMs',
    primaryMetrics: ['srtPatternAdvantageMs', 'accuracy'],
    secondaryMetrics: ['randomBlockAccuracy', 'medianRtLatePatternMs', 'medianRtRandomMs', 'medianRtEarlyPatternMs'],
    practicalTips: ['看到信号后，尽量准确、及时地选择对应位置。', '回想是否逐渐熟悉了按键；用时差还会受练习和疲劳影响。'],
    disclaimer: '结果只描述本次序列反应任务的表现，不是学习能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
