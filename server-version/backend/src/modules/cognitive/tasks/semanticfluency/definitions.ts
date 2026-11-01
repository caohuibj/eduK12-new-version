import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const semanticfluencyRegistryMeta = {
  name: '语义流畅性',
  category: 'verbal_fluency',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'semanticfluency-sequence-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 2 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [3, 5],
      configPatch: { totalTrials: 4 },
      reportCaveats: ['结果描述本次类别流畅性表现，不是语言能力诊断或年龄常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['科研档增加类别轮次；词库与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    uniqueValidPerTrial: metric('uniqueValidPerTrial', '每轮有效词数', 'verbal_fluency', 'ratio', 'higher_is_better', 'primary'),
    intrusionRate: metric('intrusionRate', '未匹配词比例', 'verbal_fluency', 'ratio', 'lower_is_better', 'secondary'),
    duplicateRate: metric('duplicateRate', '重复比例', 'verbal_fluency', 'ratio', 'lower_is_better', 'secondary'),
    uniqueValidCount: metric('uniqueValidCount', '有效词总数', 'verbal_fluency', 'count', 'descriptive', 'secondary'),
    emptyTrialCount: metric('emptyTrialCount', '空轮次数', 'verbal_fluency', 'count', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '总输入量与侵入率是否达到门槛。' },
    insufficientResponses: { key: 'insufficientResponses', label: '输入过少', description: '总有效输入少于 3 个词。' },
    excessiveIntrusions: { key: 'excessiveIntrusions', label: '侵入过多', description: '非词库词占比达到 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 轮次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '语义流畅性',
    headlineMetric: 'uniqueValidPerTrial',
    primaryMetrics: ['uniqueValidPerTrial', 'intrusionRate'],
    secondaryMetrics: ['duplicateRate', 'uniqueValidCount', 'emptyTrialCount'],
    practicalTips: ['先想子类（家畜、鸟类、昆虫……），一类一类往外冒。', '想不起来时换个子类，别卡在一个词上。'],
    disclaimer: '结果只描述本次类别流畅性表现，不是语言能力诊断或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
