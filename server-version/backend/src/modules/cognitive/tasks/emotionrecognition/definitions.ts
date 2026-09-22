import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const emotionrecognitionRegistryMeta = {
  name: '六类情绪面孔分类',
  category: 'emotion_classification',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'emotionrecognition-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 24 },
      reportCaveats: ['体验版每类面孔数量较少，只描述本次六类面孔分类。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['合成面孔按六类严格平衡；结果不是情绪识别能力、共情或人格判断。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [12, 18],
      configPatch: { totalTrials: 120 },
      reportCaveats: ['科研版覆盖 20 组内部合成身份；内容、文化、可访问性和设备 pilot 完成前保持 DRAFT。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    accuracy: metric('accuracy', '总体分类正确率', 'emotion_classification', 'ratio', 'descriptive', 'primary'),
    balancedAccuracy: metric('balancedAccuracy', '六类平衡正确率', 'emotion_classification', 'ratio', 'descriptive', 'primary'),
    accuracyByEmotion: metric('accuracyByEmotion', '各情绪类别正确率', 'emotion_classification', 'map', 'descriptive', 'research_only'),
    confusionMatrix: metric('confusionMatrix', '情绪分类混淆矩阵', 'emotion_classification', 'map', 'descriptive', 'research_only'),
    medianRtMs: metric('medianRtMs', '反应时中位数', 'emotion_classification', 'ms', 'descriptive', 'secondary'),
    omissionRate: metric('omissionRate', '遗漏比例', 'emotion_classification', 'ratio', 'descriptive', 'secondary'),
    validResponseCount: metric('validResponseCount', '有效响应数', 'emotion_classification', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '六类各自的有效响应和总体分类表现是否达到门槛。' },
    insufficientPerCategory: { key: 'insufficientPerCategory', label: '类别有效响应不足', description: '至少一类有效响应少于该类别试次数的 70%。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率较低', description: '六类平衡正确率低于 0.5。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '遗漏比例达到 0.3。' },
    constantResponse: { key: 'constantResponse', label: '恒定反应', description: '足够多有效响应始终选择同一情绪。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '至少一个正式试次被标记为中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '六类情绪面孔分类',
    headlineMetric: 'balancedAccuracy',
    primaryMetrics: ['accuracy', 'balancedAccuracy'],
    secondaryMetrics: ['medianRtMs', 'omissionRate', 'validResponseCount'],
    practicalTips: ['本任务只描述对当前版本六类合成面孔的分类响应；不输出情绪识别能力、共情能力、人格、临床或文化能力结论。'],
    disclaimer: '结果只描述本次六类合成面孔分类表现，不是情绪能力、共情、人格、文化能力或临床判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
