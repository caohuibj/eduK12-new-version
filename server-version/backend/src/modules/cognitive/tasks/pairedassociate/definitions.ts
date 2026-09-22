import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const pairedassociateRegistryMeta = {
  name: '图形—位置配对学习',
  category: 'episodic_learning_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [3, 5], configPatch: { pairCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0 }, reportCaveats: ['体验档仅 6 对、2 轮，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [8, 12], configPatch: { pairCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0 }, reportCaveats: ['正式档描述多轮配对学习，不包含延迟指标。'] },
    research: { profile: 'research' as const, estimatedMinutes: [16, 21], configPatch: { pairCount: 18, learningRounds: 4, delayedEnabled: true, delayedDelayMs: 30000 }, reportCaveats: ['延迟阶段未完成时 delayedAccuracy 保持缺失。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    correctByTrial: metric('correctByTrial', '各轮正确数', 'paired_learning', 'map', 'descriptive', 'primary', { valueType: 'array' }),
    learningSlope: metric('learningSlope', '学习斜率', 'paired_learning', 'ratio', 'higher_is_better', 'primary'),
    trialsToCriterion: metric('trialsToCriterion', '达到标准所需轮次', 'paired_learning', 'count', 'lower_is_better', 'primary'),
    immediateAccuracy: metric('immediateAccuracy', '最终即时正确率', 'paired_learning', 'ratio', 'higher_is_better', 'primary'),
    delayedAccuracy: metric('delayedAccuracy', '延迟正确率', 'paired_learning', 'ratio', 'higher_is_better', 'primary', { availableProfiles: ['research'] }),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '各轮作答是否有足够覆盖。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '遗漏过多', description: '至少一轮有一半或更多配对未作答。' },
    constantPositionResponse: { key: 'constantPositionResponse', label: '恒定位置回答', description: '即时学习阶段始终选择同一位置。' },
    delayedStageIncomplete: { key: 'delayedStageIncomplete', label: '延迟阶段未完成', description: '科研档没有有效延迟阶段，延迟正确率为缺失。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '图形—位置配对学习',
    headlineMetric: 'immediateAccuracy',
    primaryMetrics: ['correctByTrial', 'learningSlope', 'trialsToCriterion', 'immediateAccuracy', 'delayedAccuracy'],
    secondaryMetrics: [],
    practicalTips: ['学习斜率、达到标准轮次与最终正确率应一起阅读；延迟缺失不按 0 计。'],
    disclaimer: '结果来自内部非语言配对刺激，不等同 CANTAB PAL、临床记忆判断或人口常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
