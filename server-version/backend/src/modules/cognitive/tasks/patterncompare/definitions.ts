import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const patterncompareRegistryMeta = {
  name: '图形模式比较',
  category: 'processing_speed',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [1, 2],
      configPatch: { durationSec: 30 },
      reportCaveats: ['体验版仅持续 30 秒，速度指标稳定性有限，不进入综合分析。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [2, 3],
      configPatch: { durationSec: 60 },
      reportCaveats: ['正式版使用自制几何刺激，只描述本次加工速度表现。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [3, 4],
      configPatch: { durationSec: 90 },
      reportCaveats: ['科研档持续 90 秒；刺激为内部自制，不使用 NIH 常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    correctPerMinute: metric('correctPerMinute', '每分钟正确数', 'processing_speed', 'score', 'higher_is_better', 'primary'),
    accuracy: metric('accuracy', '准确率', 'processing_speed', 'ratio', 'higher_is_better', 'primary'),
    medianCorrectRtMs: metric('medianCorrectRtMs', '正确反应中位RT', 'processing_speed', 'ms', 'lower_is_better', 'primary'),
    lapseRate: metric('lapseRate', '未反应比例', 'processing_speed', 'ratio', 'lower_is_better', 'secondary'),
    correctCount: metric('correctCount', '正确次数', 'processing_speed', 'count', 'higher_is_better', 'secondary'),
    completedTrialCount: metric('completedTrialCount', '完成试次数', 'processing_speed', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完成量、准确率和反应模式是否达到门槛。' },
    insufficientCompletedTrials: { key: 'insufficientCompletedTrials', label: '完成试次不足', description: '限时内完成的正式试次不足。' },
    lowAccuracy: { key: 'lowAccuracy', label: '准确率过低', description: '总体准确率低于 0.5。' },
    excessiveLapses: { key: 'excessiveLapses', label: '未反应过多', description: '未反应比例达到 0.3。' },
    constantResponse: { key: 'constantResponse', label: '恒定反应', description: '足够多试次始终选择同一答案。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或中断试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '图形模式比较',
    headlineMetric: 'correctPerMinute',
    primaryMetrics: ['correctPerMinute', 'accuracy', 'medianCorrectRtMs'],
    secondaryMetrics: ['lapseRate', 'correctCount', 'completedTrialCount'],
    practicalTips: ['速度指标必须与准确率同屏阅读，避免把快速猜测当作加工速度。'],
    disclaimer: '结果来自内部自制几何刺激，只反映本次任务表现，不是 NIH Toolbox 分数、临床诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
