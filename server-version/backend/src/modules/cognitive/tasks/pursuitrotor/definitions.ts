import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const pursuitrotorRegistryMeta = {
  name: '追踪旋转',
  category: 'sensorimotor',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'pursuitrotor-circular-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 2 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 4 },
      reportCaveats: ['结果描述本次追踪运动的表现，不是运动能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 12],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['科研档增加轮次；轨道参数与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    onTargetRate: metric('onTargetRate', '在目标上时间比', 'sensorimotor', 'ratio', 'higher_is_better', 'primary'),
    totalTimeOnTargetMs: metric('totalTimeOnTargetMs', '累计在目标上时间', 'sensorimotor', 'count', 'descriptive', 'secondary'),
    totalTrackMs: metric('totalTrackMs', '累计追踪总时长', 'sensorimotor', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '存在有效追踪数据。' },
    noTracking: { key: 'noTracking', label: '无有效追踪', description: '没有可计入的追踪时长。' },
    lowTracking: { key: 'lowTracking', label: '追踪比例过低', description: '在目标上时间比低于 0.3。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '追踪旋转',
    headlineMetric: 'onTargetRate',
    primaryMetrics: ['onTargetRate'],
    secondaryMetrics: ['totalTimeOnTargetMs', 'totalTrackMs'],
    practicalTips: ['眼睛看着目标点的前方一点，不要盯着指针。', '手臂放松，用手腕而不是整条手臂来追踪。'],
    disclaimer: '结果只描述本次追踪运动的表现，不是运动能力诊断或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
