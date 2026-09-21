import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const taskswitchRegistryMeta = {
  name: '任务转换 Task Switching',
  category: 'cognitive_flexibility',
  referenceEligibleMetricKeys: ['switchCostRtMs', 'switchCostAccuracy'] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 4],
      configPatch: { totalTrials: 48, blockCount: 2, includePureBlocks: false },
      reportCaveats: ['体验版转换试次较少，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [6, 8],
      configPatch: { totalTrials: 128, blockCount: 4, includePureBlocks: false },
      reportCaveats: ['正式版须同时看转换代价与准确率，避免速度—准确权衡误读。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [12, 16],
      configPatch: { totalTrials: 256, blockCount: 8, includePureBlocks: true },
      reportCaveats: ['科研档含纯任务区块以估计 mixing cost；仍不是常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    switchCostRtMs: metric('switchCostRtMs', 'RT 转换代价', 'cognitive_flexibility', 'ms', 'lower_is_better', 'primary'),
    switchCostAccuracy: metric('switchCostAccuracy', '准确率转换代价', 'cognitive_flexibility', 'ratio', 'lower_is_better', 'primary'),
    medianRtSwitch: metric('medianRtSwitch', 'Switch 中位RT', 'cognitive_flexibility', 'ms', 'descriptive', 'secondary'),
    medianRtRepeat: metric('medianRtRepeat', 'Repeat 中位RT', 'cognitive_flexibility', 'ms', 'descriptive', 'secondary'),
    accuracySwitch: metric('accuracySwitch', 'Switch 准确率', 'cognitive_flexibility', 'ratio', 'higher_is_better', 'secondary'),
    accuracyRepeat: metric('accuracyRepeat', 'Repeat 准确率', 'cognitive_flexibility', 'ratio', 'higher_is_better', 'secondary'),
    mixingCost: metric('mixingCost', '混合区块相对单任务代价', 'cognitive_flexibility', 'ms', 'lower_is_better', 'research_only', { availableProfiles: ['research'] }),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '转换与重复正确试次是否达到门槛。' },
    insufficientSwitchTrials: { key: 'insufficientSwitchTrials', label: '转换试次不足', description: '有效 switch 正确试次过少。' },
    insufficientRepeatTrials: { key: 'insufficientRepeatTrials', label: '重复试次不足', description: '有效 repeat 正确试次过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '准确率过低', description: '混合区块总体准确率低于 0.6。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '任务转换 Task Switching',
    headlineMetric: 'switchCostRtMs',
    primaryMetrics: ['switchCostRtMs', 'switchCostAccuracy'],
    secondaryMetrics: ['medianRtSwitch', 'medianRtRepeat', 'accuracySwitch', 'accuracyRepeat', 'mixingCost'],
    practicalTips: ['转换代价必须与 switch/repeat 准确率同屏阅读，避免只看速度。'],
    disclaimer: '结果反映本次认知灵活性任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
