import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const sentencecheckRegistryMeta = {
  name: '句图验证推理',
  category: 'verbal_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'sentencecheck-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['结果描述本次句图相符判断的表现，不是语言能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研档仅增加试次，模板与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'verbal_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'verbal_reasoning', 'ms', 'lower_is_better', 'primary'),
    negationPenaltyMs: metric('negationPenaltyMs', '否定句代价', 'verbal_reasoning', 'ms', 'signed', 'secondary'),
    errorCount: metric('errorCount', '错误次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    timeoutCount: metric('timeoutCount', '超时次数', 'verbal_reasoning', 'count', 'lower_is_better', 'secondary'),
    validRtCount: metric('validRtCount', '有效正确RT数', 'verbal_reasoning', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '总体正确率低于 0.5，用时指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '句图验证推理',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['negationPenaltyMs', 'errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先弄清句子说的是形状还是颜色，再核对图片。', '遇到“不是”先转换成“它是什么”，再比较。'],
    disclaimer: '结果只描述本次句图验证的表现，不是语言能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

const withCrossedConditionCaveat = (profile: (typeof sentencecheckRegistryMeta.profiles)[CognitiveProfile]) => ({
  ...profile,
  reportCaveats: [...profile.reportCaveats, '本项目变式交叉安排真假与肯定/否定；不要与旧版条件混淆的记录直接比较。'],
})

/** New identity only: crossed condition generation; legacy definitions remain frozen. */
export const sentencecheckRegistryMetaV11 = {
  ...sentencecheckRegistryMeta,
  randomizationAlgorithmVersion: 'sentencecheck-crossed-v1.1.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    experience: withCrossedConditionCaveat(sentencecheckRegistryMeta.profiles.experience),
    standard: withCrossedConditionCaveat(sentencecheckRegistryMeta.profiles.standard),
    research: withCrossedConditionCaveat(sentencecheckRegistryMeta.profiles.research),
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.1.0',
  metricDefinitions: {
    ...sentencecheckRegistryMeta.metricDefinitions,
    negationPenaltyMs: metric('negationPenaltyMs', '否定与肯定用时差', 'verbal_reasoning', 'ms', 'signed', 'secondary'),
  },
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    ...sentencecheckRegistryMeta.reportDefinition,
    practicalTips: ['先弄清句子问的是形状还是颜色，再核对图片。', '肯定和否定句都可能相符或不相符，请逐题核对。'],
    disclaimer: '结果描述本次自编句图核对；条件安排已纠正，仍没有本项目的信效度或年龄常模依据，也不与旧版记录直接比较。',
  },
}
