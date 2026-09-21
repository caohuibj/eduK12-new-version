import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const nbackRegistryMeta = {
  name: 'N-Back 工作记忆更新',
  category: 'working_memory_updating',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { nLevels: [1], trialCountByN: [30], blockCountByN: [1] },
      reportCaveats: ['体验版只有 1-back，结果仅供体验。maxReliableN 不是标准化工作记忆等级。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [6, 8],
      configPatch: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1] },
      reportCaveats: ['正式版看各 N 的 d′ 与负荷效应，不是常模等级。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [12, 16],
      configPatch: { nLevels: [1, 2, 3], trialCountByN: [60, 60, 60], blockCountByN: [2, 2, 2] },
      reportCaveats: ['科研档含 1/2/3-back；仍不是人口常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrimeByN: metric('dPrimeByN', '各 N 水平 d′', 'working_memory_updating', 'map', 'higher_is_better', 'primary'),
    maxReliableN: metric('maxReliableN', '达到质量门槛的最高 N', 'working_memory_updating', 'level', 'higher_is_better', 'primary'),
    hitRateByN: metric('hitRateByN', '各 N 命中率', 'working_memory_updating', 'map', 'higher_is_better', 'secondary'),
    falseAlarmRateByN: metric('falseAlarmRateByN', '各 N 误报率', 'working_memory_updating', 'map', 'lower_is_better', 'secondary'),
    medianRtByN: metric('medianRtByN', '各 N 正确反应中位RT', 'working_memory_updating', 'map', 'descriptive', 'secondary'),
    loadCostDPrime: metric('loadCostDPrime', '高负荷相对低负荷的 d′ 下降', 'working_memory_updating', 'd-prime', 'signed', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '至少一个 N 水平达到质量门槛。' },
    insufficientTargetsByN: { key: 'insufficientTargetsByN', label: '某 N 目标不足', description: '至少一个 N 水平目标试次过少。' },
    ceilingOrFloorByN: { key: 'ceilingOrFloorByN', label: '某 N 触顶或触底', description: '命中率接近天花板或地板。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '目标遗漏过高', description: '目标遗漏率达到 0.4。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'N-Back 工作记忆更新',
    headlineMetric: 'maxReliableN',
    primaryMetrics: ['dPrimeByN', 'maxReliableN'],
    secondaryMetrics: ['hitRateByN', 'falseAlarmRateByN', 'medianRtByN', 'loadCostDPrime'],
    practicalTips: ['maxReliableN 只是本次配置内表现，不是标准化工作记忆等级。'],
    disclaimer: '结果反映本次工作记忆更新任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
