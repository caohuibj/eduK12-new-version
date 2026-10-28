import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const runningspanRegistryMeta = {
  name: '运行记忆广度',
  category: 'working_memory_updating',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'runningspan-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['结果描述本次运行广度的更新与回忆表现，不是记忆能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 11],
      configPatch: { totalTrials: 20 },
      reportCaveats: ['科研档仅增加试次，列表范围与回忆长度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    runningSpanAccuracy: metric('runningSpanAccuracy', '串行回忆正确率', 'working_memory_updating', 'ratio', 'higher_is_better', 'primary'),
    totalCorrectPositions: metric('totalCorrectPositions', '串行正确总数', 'working_memory_updating', 'count', 'higher_is_better', 'secondary'),
    intrusionRate: metric('intrusionRate', '侵入比例', 'working_memory_updating', 'ratio', 'lower_is_better', 'secondary'),
    medianResponseMs: metric('medianResponseMs', '回忆用时中位数', 'working_memory_updating', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '回忆是否有效、侵入是否过量。' },
    emptyRecall: { key: 'emptyRecall', label: '存在空回忆', description: '至少一个试次没有任何输入。' },
    excessiveIntrusions: { key: 'excessiveIntrusions', label: '侵入过多', description: '侵入比例达到 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '运行记忆广度',
    headlineMetric: 'runningSpanAccuracy',
    primaryMetrics: ['runningSpanAccuracy', 'intrusionRate'],
    secondaryMetrics: ['totalCorrectPositions', 'medianResponseMs'],
    practicalTips: ['不知道序列何时结束：试着一直保持“最近几个”在脑子里。', '按顺序回忆，别只求快；稳住的顺序就是得分。'],
    disclaimer: '结果只描述本次运行广度任务的回忆表现，不是记忆能力、临床状态或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
