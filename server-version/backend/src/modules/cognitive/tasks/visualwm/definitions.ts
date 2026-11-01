import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const visualwmRegistryMeta = {
  name: '视觉工作记忆',
  category: 'visual_working_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'visualwm-gen-v1.0.0',
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
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['结果描述本次视觉工作记忆表现，不是记忆诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 24 },
      reportCaveats: ['科研档增加试次；集合大小范围与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'visual_working_memory', 'ratio', 'higher_is_better', 'primary'),
    hitRate: metric('hitRate', '变化命中率', 'visual_working_memory', 'ratio', 'higher_is_better', 'secondary'),
    falseAlarmRate: metric('falseAlarmRate', '变化误报率', 'visual_working_memory', 'ratio', 'lower_is_better', 'secondary'),
    medianRtMs: metric('medianRtMs', '作答中位用时', 'visual_working_memory', 'ms', 'lower_is_better', 'secondary'),
    correctCount: metric('correctCount', '正确试次数', 'visual_working_memory', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '视觉工作记忆',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'hitRate'],
    secondaryMetrics: ['falseAlarmRate', 'medianRtMs', 'correctCount'],
    practicalTips: ['如果想再尝试，先确认已经理解“相同”和“改变”的按键。', '本次记录受试次数、颜色辨认和设备呈现影响，适合结合准确率与用时一起阅读。'],
    disclaimer: '结果只描述本次视觉工作记忆表现，不是记忆诊断或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
