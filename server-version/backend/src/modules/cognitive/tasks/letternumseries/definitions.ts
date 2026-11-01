import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const letternumseriesRegistryMeta = {
  name: '字母数字序列',
  category: 'working_memory_updating',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'letternumseries-sequence-v1.0.0',
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
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 10 },
      reportCaveats: ['结果描述本次字母数字序列的重排回忆表现，不是记忆能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['科研档仅增加试次，序列长度与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    overallAccuracy: metric('overallAccuracy', '重排回忆正确率', 'working_memory_updating', 'ratio', 'higher_is_better', 'primary'),
    lettersAccuracy: metric('lettersAccuracy', '字母排序正确率', 'working_memory_updating', 'ratio', 'higher_is_better', 'secondary'),
    digitsAccuracy: metric('digitsAccuracy', '数字排序正确率', 'working_memory_updating', 'ratio', 'higher_is_better', 'secondary'),
    emptyRecallCount: metric('emptyRecallCount', '空回忆试次数', 'working_memory_updating', 'count', 'lower_is_better', 'secondary'),
    medianResponseMs: metric('medianResponseMs', '回忆用时中位数', 'working_memory_updating', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '有效回忆是否达到门槛。' },
    emptyRecallExcess: { key: 'emptyRecallExcess', label: '空回忆过多', description: '空回忆试次占比达到 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '字母数字序列',
    headlineMetric: 'overallAccuracy',
    primaryMetrics: ['overallAccuracy', 'lettersAccuracy'],
    secondaryMetrics: ['digitsAccuracy', 'emptyRecallCount', 'medianResponseMs'],
    practicalTips: ['先记住“有哪些”，回忆时再排序：字母按 A→Z，数字从小到大。', '听呈现时可以分组默念：先字母后数字。'],
    disclaimer: '结果只描述本次字母数字序列任务的回忆表现，不是记忆能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
