import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const cptRegistryMeta = {
  name: '连续执行任务 CPT-X',
  category: 'sustained_attention',
  referenceEligibleMetricKeys: ['dPrime', 'omissionRate', 'commissionRate', 'rtICV'] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 60, blockCount: 1, targetRatio: 0.2 },
      reportCaveats: ['体验版，结果仅供体验。短程持续注意指标不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 180, blockCount: 3, targetRatio: 0.2 },
      reportCaveats: ['正式版须同时看 d′、遗漏、误报和 RT 变异。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [14, 20],
      configPatch: { totalTrials: 360, blockCount: 6, targetRatio: 0.2 },
      reportCaveats: ['科研档分 6 个 block，仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrime: metric('dPrime', '目标辨别 d′', 'sustained_attention', 'd-prime', 'higher_is_better', 'primary'),
    omissionRate: metric('omissionRate', '目标遗漏率', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    commissionRate: metric('commissionRate', '非目标误报率', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    rtICV: metric('rtICV', '命中RT变异系数', 'sustained_attention', 'ratio', 'lower_is_better', 'primary'),
    hitMedianRtMs: metric('hitMedianRtMs', '目标命中中位RT', 'sustained_attention', 'ms', 'descriptive', 'secondary'),
    hitRtSdMs: metric('hitRtSdMs', '目标RT标准差', 'sustained_attention', 'ms', 'lower_is_better', 'secondary'),
    blockSlopeRt: metric('blockSlopeRt', '跨 block RT 斜率', 'sustained_attention', 'ms', 'descriptive', 'research_only', { availableProfiles: ['research'] }),
    blockSlopeOmission: metric('blockSlopeOmission', '跨 block 遗漏斜率', 'sustained_attention', 'ratio', 'descriptive', 'research_only', { availableProfiles: ['research'] }),
    perseverationRate: metric('perseverationRate', '极短反应比例', 'sustained_attention', 'ratio', 'lower_is_better', 'secondary'),
    targetCount: metric('targetCount', '目标试次数', 'sustained_attention', 'count', 'descriptive', 'secondary'),
    hitCount: metric('hitCount', '命中次数', 'sustained_attention', 'count', 'higher_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '目标试次与遗漏是否达到门槛。' },
    insufficientTargets: { key: 'insufficientTargets', label: '目标试次不足', description: '目标试次过少。' },
    highOmissionRate: { key: 'highOmissionRate', label: '遗漏过高', description: '目标遗漏率达到 0.4。' },
    highPerseverationRate: { key: 'highPerseverationRate', label: '极短反应过多', description: '低于 100ms 的反应比例过高。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '连续执行任务 CPT-X',
    headlineMetric: 'dPrime',
    primaryMetrics: ['dPrime', 'omissionRate', 'commissionRate', 'rtICV'],
    secondaryMetrics: ['hitMedianRtMs', 'hitRtSdMs', 'perseverationRate', 'blockSlopeRt', 'blockSlopeOmission'],
    practicalTips: ['单一反应时不能代表持续注意，请同时看遗漏与误报。'],
    disclaimer: '结果反映本次持续注意任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
