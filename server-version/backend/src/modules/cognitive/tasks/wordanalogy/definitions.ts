import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const wordanalogyRegistryMeta = {
  name: '言语类比推理',
  category: 'verbal_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'wordanalogy-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 4],
      configPatch: { totalTrials: 18 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 30 },
      reportCaveats: ['结果描述本次言语类比推理的表现，不是语言能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 9],
      configPatch: { totalTrials: 36 },
      reportCaveats: ['科研档使用全部 36 题；题库与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体正确率', 'verbal_reasoning', 'ratio', 'higher_is_better', 'primary'),
    medianRtMs: metric('medianRtMs', '正确作答中位用时', 'verbal_reasoning', 'ms', 'lower_is_better', 'primary'),
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
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '言语类比推理',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先说出前一对词的关系（功能、部分、因果……），再套到后一对上。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果只描述本次言语类比推理的表现，不是语言能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}

/** Corrected-bank pilot identity; preserve the historical 1.0.0 metadata above. */
export const wordanalogyRegistryMetaV11 = {
  ...wordanalogyRegistryMeta,
  randomizationAlgorithmVersion: 'wordanalogy-sequence-v1.1.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    ...wordanalogyRegistryMeta.profiles,
    experience: { ...wordanalogyRegistryMeta.profiles.experience, reportCaveats: ['体验版使用18道正式题；本次比例不代表稳定能力或同龄排名。'] },
    research: { ...wordanalogyRegistryMeta.profiles.research, reportCaveats: ['科研参数档使用36道已审题目；未建立常模、信效度或新旧题库等值证据。'] },
  },
  reportDefinitionVersion: '1.1.0',
  reportDefinition: { ...wordanalogyRegistryMeta.reportDefinition,
    practicalTips: ["先用自己的话说清前一对词的关系，再比较四个选项。", "回想哪些关系让你犹豫，下一次阅读时留意类似表达。"],
  },
}
