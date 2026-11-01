import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const mazeRegistryMeta = {
  name: '迷宫学习',
  category: 'spatial_navigation',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'maze-backtracker-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 2 },
      reportCaveats: ['体验版仅 2 个迷宫，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 8],
      configPatch: { totalTrials: 4 },
      reportCaveats: ['结果描述本次迷宫导航表现，不是空间能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [8, 12],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['科研档增加迷宫数量；迷宫尺寸与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.1',
  metricDefinitions: {
    pathEfficiency: metric('pathEfficiency', '路径效率', 'spatial_navigation', 'ratio', 'higher_is_better', 'primary'),
    completedCount: metric('completedCount', '完成迷宫数', 'spatial_navigation', 'count', 'higher_is_better', 'secondary'),
    totalDeadEnds: metric('totalDeadEnds', '重复进入已到过位置的次数', 'spatial_navigation', 'count', 'lower_is_better', 'secondary'),
    medianCompletionTimeMs: metric('medianCompletionTimeMs', '平均完成用时', 'spatial_navigation', 'ms', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '全部迷宫完成。' },
    incompleteMazes: { key: 'incompleteMazes', label: '未全部完成', description: '存在未完成的迷宫。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '迷宫学习',
    headlineMetric: 'pathEfficiency',
    primaryMetrics: ['pathEfficiency', 'completedCount'],
    secondaryMetrics: ['totalDeadEnds', 'medianCompletionTimeMs'],
    practicalTips: ['先记住整体方向（目标是右下角），再选择具体路线。', '进入死路时尽快回头，不要反复尝试同一方向。'],
    disclaimer: '结果只描述本次迷宫导航表现，不是空间能力诊断或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
