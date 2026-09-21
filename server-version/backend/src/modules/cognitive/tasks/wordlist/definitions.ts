import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const wordlistRegistryMeta = {
  name: '中文词表自由回忆',
  category: 'language_learning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'wordlist-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 5],
      configPatch: { listLength: 8, learningRounds: 2, delayedEnabled: false },
      reportCaveats: ['体验版只描述即时自由回忆过程，不包括延迟回忆。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [6, 8],
      configPatch: { listLength: 12, learningRounds: 3, delayedEnabled: false },
      reportCaveats: ['结果描述本次键盘自由回忆表现，不是记忆能力诊断或人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [10, 14],
      configPatch: { listLength: 15, learningRounds: 5, delayedEnabled: true },
      reportCaveats: ['科研版增加学习轮次和延迟回忆；延迟阶段需要单独完成并经 pilot 审查。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    immediateAccuracy: metric('immediateAccuracy', '即时回忆正确率', 'language_learning', 'ratio', 'descriptive', 'primary'),
    learningGain: metric('learningGain', '学习轮次增益', 'language_learning', 'ratio', 'descriptive', 'primary'),
    delayedRecallAccuracy: metric('delayedRecallAccuracy', '延迟回忆正确率', 'language_learning', 'ratio', 'descriptive', 'primary', { availableProfiles: ['research'], requiresQualityFlags: ['delayedStageIncomplete'] }),
    totalImmediateCorrect: metric('totalImmediateCorrect', '即时回忆累计正确数', 'language_learning', 'count', 'descriptive', 'secondary'),
    recallByRound: metric('recallByRound', '各轮回忆正确率', 'language_learning', 'map', 'descriptive', 'research_only'),
    intrusionCount: metric('intrusionCount', '侵入词数量', 'language_learning', 'count', 'descriptive', 'secondary'),
    duplicateResponseCount: metric('duplicateResponseCount', '重复响应数量', 'language_learning', 'count', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏比例', 'language_learning', 'ratio', 'descriptive', 'secondary'),
    medianResponseDurationMs: metric('medianResponseDurationMs', '回忆作答时长中位数', 'language_learning', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '即时回忆和延迟阶段的作答质量是否达到门槛。' },
    emptyImmediateRecall: { key: 'emptyImmediateRecall', label: '即时回忆为空', description: '至少一个即时回忆轮次没有可归一化的输入。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '遗漏比例达到 0.5。' },
    excessiveIntrusions: { key: 'excessiveIntrusions', label: '侵入词过多', description: '侵入词占全部归一化输入的比例达到 0.5。' },
    repeatedResponsePattern: { key: 'repeatedResponsePattern', label: '重复响应模式', description: '足够多输入始终归一化为同一个词。' },
    delayedStageIncomplete: { key: 'delayedStageIncomplete', label: '延迟阶段不完整', description: '延迟回忆没有有效完成；延迟指标保留为空。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '至少一个正式回忆阶段被标记为中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '中文词表自由回忆',
    headlineMetric: 'immediateAccuracy',
    primaryMetrics: ['immediateAccuracy', 'learningGain', 'delayedRecallAccuracy'],
    secondaryMetrics: ['totalImmediateCorrect', 'intrusionCount', 'duplicateResponseCount', 'omissionRate', 'medianResponseDurationMs'],
    practicalTips: ['输入归一化只清理 Unicode 格式、空白和标点，并统一英文字母大小写；不做繁简转换、同义词匹配或模糊纠错。'],
    disclaimer: '结果只描述本次中文词表的键盘自由回忆表现，不是记忆能力、临床状态或人口常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
