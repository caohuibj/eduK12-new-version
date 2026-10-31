import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const embeddedfiguresRegistryMeta = {
  name: '嵌入图形',
  category: 'fluid_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'embeddedfigures-gen-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 6 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 10 },
      reportCaveats: ['结果描述本次隐藏图形查找表现，不是空间能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['科研档增加生成题数量；题库轨与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'fluid_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'fluid_reasoning', 'ms', 'lower_is_better', 'primary'),
    errorCount: metric('errorCount', '错误次数', 'fluid_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'fluid_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'fluid_reasoning', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '嵌入图形',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先记住目标的形状和大小，再在复杂图形里排除明显不像的。', '顶点数量是关键：目标永远是三角形。'],
    disclaimer: '结果只描述本次隐藏图形查找表现，不是空间能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}


/** New line-context protocol. Old report/profile metadata remains unchanged. */
export const embeddedfiguresV2Meta = {
  ...embeddedfiguresRegistryMeta,
  randomizationAlgorithmVersion: 'embeddedfigures-gen-v1.1.0',
  profileDefinitionVersion: '1.1.0', metricDefinitionVersion: '1.1.0', qualityDefinitionVersion: '1.1.0', reportDefinitionVersion: '1.1.0',
  profiles: {
    experience: {...embeddedfiguresRegistryMeta.profiles.experience, estimatedMinutes: [2,3], reportCaveats:['6题简短体验，可能受偶然失误影响；不与其他版本作常模比较。']},
    standard: {...embeddedfiguresRegistryMeta.profiles.standard, estimatedMinutes: [3,5], reportCaveats:['10题自编线条图形匹配，不是标准EFT或能力诊断。']},
    research: {...embeddedfiguresRegistryMeta.profiles.research, estimatedMinutes: [5,7], reportCaveats:['16题使用相同刺激规则并增加重复；没有经验证的年龄常模或题目难度标定。']},
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  qualityDefinitions: {...embeddedfiguresRegistryMeta.qualityDefinitions, interpretable:{key:'interpretable',label:'完成序列可描述',description:'准确率描述本次完整序列，用时只使用足够的有效正确反应。'}},
  reportDefinition: {...embeddedfiguresRegistryMeta.reportDefinition, showProductIndex:false,
    practicalTips:['先比较一个有辨识度的角，再沿三条边确认完整轮廓。','若想再次体验，可先减少环境干扰；不要把一次的用时理解成固定能力。'],
    disclaimer:'结果描述本次七选择自编图形匹配；并非GEFT/L-EFT原版，不提供常模、诊断、IQ或稳定能力推断。'},
}
