import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const lexicaldecisionRegistryMeta = {
  name: '中文词汇判断',
  category: 'language_decision',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'lexicaldecision-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['体验版试次数较少，结果只描述本次词汇判断任务。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [7, 10],
      configPatch: { totalTrials: 100 },
      reportCaveats: ['真词和伪词按冻结刺激库平衡抽样；结果不是语言能力诊断或人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [14, 20],
      configPatch: { totalTrials: 200 },
      reportCaveats: ['科研版增加试次并保留词频带、字长和生成器版本，发布前仍须完成词库与设备 pilot。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrime: metric('dPrime', '词汇判断 d-prime', 'language_decision', 'd-prime', 'descriptive', 'primary'),
    lexicalityEffectMs: metric('lexicalityEffectMs', '真词/伪词反应时差', 'language_decision', 'ms', 'descriptive', 'primary'),
    accuracyReal: metric('accuracyReal', '真词正确率', 'language_decision', 'ratio', 'descriptive', 'primary'),
    accuracyPseudo: metric('accuracyPseudo', '伪词正确率', 'language_decision', 'ratio', 'descriptive', 'primary'),
    medianRtReal: metric('medianRtReal', '真词反应时中位数', 'language_decision', 'ms', 'descriptive', 'secondary'),
    medianRtPseudo: metric('medianRtPseudo', '伪词反应时中位数', 'language_decision', 'ms', 'descriptive', 'secondary'),
    accuracyByFrequencyBand: metric('accuracyByFrequencyBand', '各词频带正确率', 'language_decision', 'map', 'descriptive', 'research_only'),
    omissionRate: metric('omissionRate', '遗漏比例', 'language_decision', 'ratio', 'descriptive', 'secondary'),
    validResponseCount: metric('validResponseCount', '有效响应数', 'language_decision', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '真词/伪词有效响应和总体准确率是否达到门槛。' },
    insufficientRealWords: { key: 'insufficientRealWords', label: '真词有效响应不足', description: '真词有效响应少于该类别试次数的 70%。' },
    insufficientPseudoWords: { key: 'insufficientPseudoWords', label: '伪词有效响应不足', description: '伪词有效响应少于该类别试次数的 70%。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率较低', description: '真词和伪词平衡正确率低于 0.5。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '遗漏比例达到 0.3。' },
    constantResponse: { key: 'constantResponse', label: '恒定反应', description: '足够多有效响应始终使用同一按钮。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '至少一个正式试次被标记为中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '中文词汇判断',
    headlineMetric: 'dPrime',
    primaryMetrics: ['dPrime', 'lexicalityEffectMs', 'accuracyReal', 'accuracyPseudo'],
    secondaryMetrics: ['medianRtReal', 'medianRtPseudo', 'omissionRate', 'validResponseCount'],
    practicalTips: ['结果应结合词长、词频带、反应时下限和遗漏情况阅读；冻结词库与伪词生成器均处于 DRAFT 审查阶段。'],
    disclaimer: '结果只描述本次中文真词/伪词判断表现，不是语言能力、阅读能力或临床判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
