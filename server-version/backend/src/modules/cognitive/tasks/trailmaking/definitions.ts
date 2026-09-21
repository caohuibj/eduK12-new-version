import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const trailmakingRegistryMeta = {
  name: 'Trail Making 视觉搜索',
  category: 'visual_search_set_shifting',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'trailmaking-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { form: 'A', partAItemCount: 12, partBItemCount: 0 },
      reportCaveats: ['体验版只包含 A 部分，结果仅描述本次视觉搜索与动作任务表现。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { form: 'AB', partAItemCount: 12, partBItemCount: 12 },
      reportCaveats: ['A+B 的完成时间会受到设备、指针方式和动作速度影响，不进行设备常模校正。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [9, 13],
      configPatch: { form: 'AB', partAItemCount: 24, partBItemCount: 24 },
      reportCaveats: ['科研版使用较长的 A+B 序列和 seed 等价布局，仍只提供描述性结果。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    completionTimeMs: metric('completionTimeMs', '累计正确步骤时长', 'visual_search_set_shifting', 'ms', 'descriptive', 'primary', { description: '只累计在时限内完成的正确步骤时长；错误尝试和遗漏步骤另行报告，不是从开始到结束的端到端用时。' }),
    errorCount: metric('errorCount', '错误尝试次数', 'visual_search_set_shifting', 'count', 'lower_is_better', 'primary'),
    setShiftCostMs: metric('setShiftCostMs', 'Set shifting 时间代价', 'visual_search_set_shifting', 'ms', 'signed', 'primary', { availableProfiles: ['standard', 'research'] }),
    partACompletionTimeMs: metric('partACompletionTimeMs', 'A 部分累计正确步骤时长', 'visual_search_set_shifting', 'ms', 'descriptive', 'secondary', { description: 'A 部分只累计在时限内完成的正确步骤时长。' }),
    partBCompletionTimeMs: metric('partBCompletionTimeMs', 'B 部分累计正确步骤时长', 'visual_search_set_shifting', 'ms', 'descriptive', 'secondary', { availableProfiles: ['standard', 'research'], description: 'B 部分只累计在时限内完成的正确步骤时长。' }),
    meanCorrectStepTimeMs: metric('meanCorrectStepTimeMs', '平均正确步骤时间', 'visual_search_set_shifting', 'ms', 'descriptive', 'secondary'),
    completedStepCount: metric('completedStepCount', '完成步骤数', 'visual_search_set_shifting', 'count', 'descriptive', 'secondary'),
    errorRate: metric('errorRate', '错误尝试比例', 'visual_search_set_shifting', 'ratio', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏步骤比例', 'visual_search_set_shifting', 'ratio', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完成步骤和错误尝试是否达到任务门槛。' },
    insufficientCompletedSteps: { key: 'insufficientCompletedSteps', label: '完成步骤不足', description: '未完成足够比例的正式步骤。' },
    excessiveErrors: { key: 'excessiveErrors', label: '错误尝试过多', description: '错误目标尝试比例达到质量门槛。' },
    timeLimitReached: { key: 'timeLimitReached', label: '存在超时或遗漏', description: '至少一个正式步骤没有在时限内完成。' },
    deviceInfoIncomplete: { key: 'deviceInfoIncomplete', label: '设备信息不完整', description: '部分步骤没有可靠的粗粒度设备或指针信息。' },
    mixedPointerType: { key: 'mixedPointerType', label: '指针方式混合', description: '本次任务中观察到多种指针方式。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '至少一个正式步骤被标记为中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Trail Making 视觉搜索',
    headlineMetric: 'completionTimeMs',
    primaryMetrics: ['completionTimeMs', 'errorCount', 'setShiftCostMs'],
    secondaryMetrics: ['partACompletionTimeMs', 'partBCompletionTimeMs', 'meanCorrectStepTimeMs', 'completedStepCount', 'errorRate', 'omissionRate'],
    practicalTips: ['累计正确步骤时长应与错误尝试、A/B 部分和设备/指针信息一起阅读；它不是从任务开始到结束的端到端用时。'],
    disclaimer: '结果只描述本次视觉搜索、动作速度和规则切换任务表现，不是 motor 能力诊断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
