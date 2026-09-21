import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const sstRegistryMeta = {
  name: '停止信号任务 SST',
  category: 'response_inhibition',
  referenceEligibleMetricKeys: ['ssrtMs'] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 4],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['体验版 stop 试次过少，SSRT 仅用于体验机制，不得作为个人抑制结论。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [5, 7],
      configPatch: { totalTrials: 96 },
      reportCaveats: ['正式版 SSRT 为增强版估计，稳定性受限，不是临床抑制分数。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [7, 12],
      configPatch: { totalTrials: 200 },
      reportCaveats: ['科研档约 50 个 stop 试次，采用 integration SSRT；仍不是常模或诊断。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    ssrtMs: metric('ssrtMs', '停止信号反应时 SSRT', 'response_inhibition', 'ms', 'lower_is_better', 'primary'),
    pRespondStop: metric('pRespondStop', 'Stop trial 响应概率', 'response_inhibition', 'ratio', 'target_range', 'primary'),
    goMedianRtMs: metric('goMedianRtMs', 'Go 中位RT', 'response_inhibition', 'ms', 'descriptive', 'secondary'),
    goOmissionRate: metric('goOmissionRate', 'Go 遗漏率', 'response_inhibition', 'ratio', 'lower_is_better', 'secondary'),
    goChoiceErrorRate: metric('goChoiceErrorRate', 'Go 选择错误率', 'response_inhibition', 'ratio', 'lower_is_better', 'secondary'),
    meanSsdMs: metric('meanSsdMs', '平均 SSD', 'response_inhibition', 'ms', 'descriptive', 'secondary'),
    unsuccessfulStopRtMs: metric('unsuccessfulStopRtMs', '失败 Stop 的 RT', 'response_inhibition', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: 'Stop 试次、p(respond|stop) 与遗漏是否达到门槛。' },
    insufficientStopTrials: { key: 'insufficientStopTrials', label: 'Stop 试次不足', description: 'Stop 试次过少。' },
    pRespondStopOutOfRange: { key: 'pRespondStopOutOfRange', label: 'Stop 响应概率失控', description: 'p(respond|stop) 低于 0.25 或高于 0.75。' },
    highGoOmission: { key: 'highGoOmission', label: 'Go 遗漏过高', description: 'Go 遗漏率达到 0.2。' },
    strategicSlowingSuspected: { key: 'strategicSlowingSuspected', label: '疑似策略性等待', description: '失败 Stop 的平均 RT 不低于全部有响应 Go 试次的平均 RT。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '停止信号任务 SST',
    headlineMetric: 'ssrtMs',
    primaryMetrics: ['ssrtMs', 'pRespondStop'],
    secondaryMetrics: ['goMedianRtMs', 'goOmissionRate', 'goChoiceErrorRate', 'meanSsdMs', 'unsuccessfulStopRtMs'],
    practicalTips: ['科研版以 SSRT 为主；体验/正式版不得输出过度确定的个人抑制结论。'],
    disclaimer: '结果反映本次动作停止任务表现，不是临床诊断或常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
