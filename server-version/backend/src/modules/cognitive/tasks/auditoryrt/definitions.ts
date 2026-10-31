import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const auditoryrtRegistryMeta = {
  name: '听觉简单反应时',
  category: 'auditory_processing',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'auditoryrt-foreperiod-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 24 },
      reportCaveats: ['结果反映本次听觉反应速度，不是人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [5, 8],
      configPatch: { totalTrials: 48 },
      reportCaveats: ['科研版增加试次以提高稳定性；前瞻期调度与难度和标准档一致；仍不是人口常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    medianRtMs: metric('medianRtMs', '有效试次中位反应时', 'auditory_processing', 'ms', 'lower_is_better', 'primary'),
    meanRtMs: metric('meanRtMs', '有效试次平均反应时', 'auditory_processing', 'ms', 'lower_is_better', 'secondary'),
    rtSdMs: metric('rtSdMs', '反应时标准差', 'auditory_processing', 'ms', 'descriptive', 'secondary'),
    rtCv: metric('rtCv', '反应时变异系数', 'auditory_processing', 'ratio', 'lower_is_better', 'secondary'),
    validCount: metric('validCount', '有效试次数', 'auditory_processing', 'count', 'descriptive', 'secondary'),
    anticipationCount: metric('anticipationCount', '预期反应次数', 'auditory_processing', 'count', 'descriptive', 'secondary'),
    lapseCount: metric('lapseCount', '漏失次数', 'auditory_processing', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '有效试次达到门槛。' },
    insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '有效试次低于计划数的一半。' },
    excessiveAnticipations: { key: 'excessiveAnticipations', label: '预期反应过多', description: '早于 150ms 的预期反应占比达 0.3。' },
    highVariability: { key: 'highVariability', label: '反应时波动过大', description: '有效试次变异系数超过 0.5。' },
    audioEnvironmentUnverified: { key: 'audioEnvironmentUnverified', label: '音频环境未留痕', description: '全部试次未上报 Web Audio 输出延迟；结果仍可解释，跨设备比较需谨慎。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '听觉简单反应时',
    headlineMetric: 'medianRtMs',
    primaryMetrics: ['medianRtMs'],
    secondaryMetrics: ['meanRtMs', 'rtSdMs', 'rtCv', 'validCount', 'anticipationCount', 'lapseCount'],
    practicalTips: ['在安静环境施测，音量调到清晰可闻。', '手保持放松，听到声音立即按键，不要抢拍。'],
    disclaimer: '结果只描述本次听觉反应速度，不是听力诊断或人口常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
