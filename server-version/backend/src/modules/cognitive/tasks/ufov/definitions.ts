import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const ufovRegistryMeta = {
  name: '有用视野',
  category: 'visual_attention',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'ufov-gen-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 8 },
      reportCaveats: ['体验版，结果仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 16 },
      reportCaveats: ['结果描述本次双重任务表现，不是注意力诊断或驾驶能力评估。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 24 },
      reportCaveats: ['科研档增加试次；刺激时长与难度和标准档一致；仍不是年龄常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dualCorrectRate: metric('dualCorrectRate', '双重正确率', 'visual_attention', 'ratio', 'higher_is_better', 'primary'),
    centralAccuracy: metric('centralAccuracy', '中心判别正确率', 'visual_attention', 'ratio', 'higher_is_better', 'secondary'),
    peripheralAccuracy: metric('peripheralAccuracy', '周边定位正确率', 'visual_attention', 'ratio', 'higher_is_better', 'secondary'),
    dualCorrectCount: metric('dualCorrectCount', '双重正确数', 'visual_attention', 'count', 'descriptive', 'secondary'),
    medianRtMs: metric('medianRtMs', '有效作答用时中位数', 'visual_attention', 'ms', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '正确有效 RT 是否足够。' },
    insufficientValidRt: { key: 'insufficientValidRt', label: '有效RT不足', description: '正确有效反应过少。' },
    lowAccuracy: { key: 'lowAccuracy', label: '总体正确率过低', description: '双重正确率低于 0.5，指标需谨慎解释。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在 interrupted 试次。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.1',
  reportDefinition: {
    showProductIndex: false,
    title: '有用视野',
    headlineMetric: 'dualCorrectRate',
    primaryMetrics: ['dualCorrectRate', 'centralAccuracy'],
    secondaryMetrics: ['peripheralAccuracy', 'dualCorrectCount', 'medianRtMs'],
    practicalTips: ['眼睛盯住中心图形，余光注意周边亮点。', '先答中心的，再点周边的，两题都别漏。'],
    disclaimer: '结果只描述本次双重任务的表现，不是注意力诊断、驾驶能力评估或年龄常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
