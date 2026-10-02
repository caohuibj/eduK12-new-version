import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const fakeRegistryMeta = {
  name: 'Fake 测试',
  category: 'framework',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'none',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，仅供体验。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，不反映真实能力。'] },
    research: { profile: 'research' as const, estimatedMinutes: [1, 2], configPatch: { trialCount: 3 }, reportCaveats: ['框架任务，不得用于研究结论。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    trialCount: metric('trialCount', '试次数', 'framework', 'count', 'descriptive', 'secondary'),
    correctCount: metric('correctCount', '正确数', 'framework', 'count', 'higher_is_better', 'secondary'),
    accuracy: metric('accuracy', '正确率', 'framework', 'ratio', 'higher_is_better', 'primary'),
    meanRtMs: metric('meanRtMs', '平均反应时', 'framework', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '框架任务默认可展示。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Fake 测试',
    headlineMetric: 'accuracy',
    primaryMetrics: ['accuracy'],
    secondaryMetrics: ['meanRtMs', 'correctCount', 'trialCount'],
    disclaimer: 'Fake 任务仅用于验证框架，不反映真实能力。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
