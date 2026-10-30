import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric } from '../../task-primitives'

export const auditorynbackRegistryMeta = {
  name: '听觉 n-back 工作记忆',
  category: 'auditory_working_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'auditorynback-seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: {
      profile: 'experience' as const,
      estimatedMinutes: [2, 3],
      configPatch: { totalTrials: 12 },
      reportCaveats: ['体验版试次较少，d′ 不稳定，仅供体验。'],
    },
    standard: {
      profile: 'standard' as const,
      estimatedMinutes: [4, 6],
      configPatch: { totalTrials: 40 },
      reportCaveats: ['结果反映本次听觉工作记忆更新表现，不是人口常模。'],
    },
    research: {
      profile: 'research' as const,
      estimatedMinutes: [6, 9],
      configPatch: { totalTrials: 60 },
      reportCaveats: ['科研版增加试次以提高 d′ 稳定性；n 水平、音集与节奏和标准档一致；仍不是人口常模。'],
    },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    dPrime: metric('dPrime', '听觉 n-back d′', 'auditory_working_memory', 'd-prime', 'higher_is_better', 'primary'),
    hitRate: metric('hitRate', '匹配命中率', 'auditory_working_memory', 'ratio', 'higher_is_better', 'secondary'),
    falseAlarmRate: metric('falseAlarmRate', '非匹配误报率', 'auditory_working_memory', 'ratio', 'lower_is_better', 'secondary'),
    medianHitRtMs: metric('medianHitRtMs', '命中中位反应时', 'auditory_working_memory', 'ms', 'descriptive', 'secondary'),
    matchCount: metric('matchCount', '匹配试次数', 'auditory_working_memory', 'count', 'descriptive', 'secondary'),
    nonmatchCount: metric('nonmatchCount', '非匹配试次数', 'auditory_working_memory', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '匹配/非匹配试次数量与 d′ 达到门槛。' },
    insufficientTargets: { key: 'insufficientTargets', label: '匹配试次不足', description: '匹配或非匹配试次过少，d′ 不稳定。' },
    excessiveOmissions: { key: 'excessiveOmissions', label: '目标遗漏过高', description: '匹配试次漏按率达到 0.4。' },
    floorPerformance: { key: 'floorPerformance', label: '低于随机水平', description: 'd′ 为负，反应模式与任务规则相反，可能未理解规则。' },
    ceilingPerformance: { key: 'ceilingPerformance', label: '接近天花板', description: '命中率接近 1 且误报接近 0，区分度有限。' },
    stimulusEchoMismatch: { key: 'stimulusEchoMismatch', label: '刺激回显不一致', description: '客户端回显的音序与服务端按种子重建的序列不一致，结果按受限解释。' },
    audioEnvironmentUnverified: { key: 'audioEnvironmentUnverified', label: '音频环境未留痕', description: '全部试次未上报 Web Audio 输出延迟；结果仍可解释，跨设备比较需谨慎。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '听觉 n-back 工作记忆',
    headlineMetric: 'dPrime',
    primaryMetrics: ['dPrime'],
    secondaryMetrics: ['hitRate', 'falseAlarmRate', 'medianHitRtMs', 'matchCount', 'nonmatchCount'],
    practicalTips: ['在心里轻轻记住最近两个音，新音响起时和「往前第二个」比较。', '不要把整段旋律都记住，只追踪滑动窗口内的两个音。'],
    disclaimer: '结果只描述本次听觉工作记忆更新表现，不是诊断或人口常模判断。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
