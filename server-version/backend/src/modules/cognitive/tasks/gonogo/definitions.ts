import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const gonogoRegistryMeta = {
  name: 'Go/No-Go',
  category: 'response_inhibition',
  referenceEligibleMetricKeys: ['commissionRate', 'dPrime'] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 40, nogoRatio: 0.25 },
      reportCaveats: ['体验版，结果仅供体验。短程抑制指标不稳定。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 120, nogoRatio: 0.25 },
      reportCaveats: ['正式版反映本次反应抑制表现，不是临床抑制分数。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [10, 14],
      configPatch: { totalTrials: 240, nogoRatio: 0.25 },
      reportCaveats: ['科研档增加试次；仍不是常模或诊断。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    commissionRate: metric('commissionRate', 'No-Go 误按率', 'response_inhibition', 'ratio', 'lower_is_better', 'primary'),
    dPrime: metric('dPrime', '信号检测敏感度 d′', 'response_inhibition', 'd-prime', 'higher_is_better', 'primary'),
    goMedianRtMs: metric('goMedianRtMs', 'Go 正确反应中位RT', 'response_inhibition', 'ms', 'descriptive', 'secondary'),
    hitRate: metric('hitRate', 'Go 命中率', 'response_inhibition', 'ratio', 'higher_is_better', 'secondary'),
    omissionRate: metric('omissionRate', 'Go 遗漏率', 'response_inhibition', 'ratio', 'lower_is_better', 'secondary'),
    commissionErrors: metric('commissionErrors', 'No-Go 误按次数', 'response_inhibition', 'count', 'lower_is_better', 'secondary'),
    goTrialCount: metric('goTrialCount', 'Go 试次数', 'response_inhibition', 'count', 'descriptive', 'secondary'),
    nogoTrialCount: metric('nogoTrialCount', 'No-Go 试次数', 'response_inhibition', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: 'No-Go 试次与遗漏是否达到门槛。' },
    insufficientNoGoTrials: { key: 'insufficientNoGoTrials', label: 'No-Go 试次不足', description: 'No-Go 试次过少。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: 'Go 遗漏过高', description: 'Go 遗漏率达到 0.3。' },
    extremeCommissionRate: { key: 'extremeCommissionRate', label: '误按率极端', description: 'No-Go 误按率达到 0.5。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: 'Go/No-Go',
    headlineMetric: 'commissionRate',
    primaryMetrics: ['commissionRate', 'dPrime'],
    secondaryMetrics: ['goMedianRtMs', 'hitRate', 'omissionRate', 'commissionErrors'],
    practicalTips: ['Go RT 只解释速度—准确权衡，不能单独代表抑制能力。'],
    disclaimer: '结果反映本次反应抑制任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
