import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const wordproblemRegistryMeta = {
  name: '应用题推理',
  category: 'verbal_reasoning',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'wordproblem-sequence-v1.0.0',
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
      reportCaveats: ['结果描述本次应用题推理的表现，不是语言能力诊断或年龄常模。'],
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
    title: '应用题推理',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy', 'medianRtMs'],
    secondaryMetrics: ['errorCount', 'timeoutCount', 'validRtCount'],
    practicalTips: ['先读懂题目条件，再列式计算；算完检查一遍单位。', '不确定时用估算排除明显不合理的选项。'],
    disclaimer: '结果只描述本次应用题推理的表现，不是语言能力、智力或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}

/** Audited pilot protocol; no simulated reference or validated ability ranking. */
export const wordproblemRegistryMetaV2 = {
 ...wordproblemRegistryMeta,
 randomizationAlgorithmVersion:'wordproblem-sequence-v2.0.0',
 profileDefinitionVersion:'2.0.0',
 profiles:{
  experience:{profile:'experience' as const,estimatedMinutes:[3,6],configPatch:{totalTrials:18},reportCaveats:['18题简短体验；不与长版或其他人排名比较。']},
  standard:{profile:'standard' as const,estimatedMinutes:[4,9],configPatch:{totalTrials:30},reportCaveats:['30题；记录本次表现，无同龄常模。']},
  research:{profile:'research' as const,estimatedMinutes:[4,11],configPatch:{totalTrials:36},reportCaveats:['36道独立正式题；时长为估计，尚无信效度或常模研究。']},
 } satisfies Record<CognitiveProfile,CognitiveProfileDefinition>,
 metricDefinitionVersion:'2.0.0',qualityDefinitionVersion:'2.0.0',reportDefinitionVersion:'2.0.0',
 qualityDefinitions:{...wordproblemRegistryMeta.qualityDefinitions,interpretable:{key:'interpretable',label:'可描述本次表现',description:'完整的正式题记录可描述答对和超时比例；正确用时不足时仅限制用时解释。'}},
 recommendedForCreate:true,
}
