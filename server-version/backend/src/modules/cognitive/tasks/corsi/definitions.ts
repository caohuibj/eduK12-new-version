import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const corsiRegistryMeta = {
  name: 'Corsi 视空间广度',
  category: 'visuospatial_memory',
  referenceEligibleMetricKeys: ['maxSpan'] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
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
