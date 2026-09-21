import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  SingleTaskReportDefinition,
  CognitiveProfileDefinition,
} from '../../cognitive.types'
import { metric } from '../task-definition-helpers'

export const digitbackwardRegistryMeta = {
  name: '数字倒背',
  category: 'working_memory',
  referenceEligibleMetricKeys: [] as const,
  randomizationAlgorithmVersion: 'seq-v1.0.0',
  profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [2, 3], configPatch: { startSpan: 2, maxSpan: 4 }, reportCaveats: ['体验档广度范围较窄，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [5, 7], configPatch: { startSpan: 2, maxSpan: 7 }, reportCaveats: ['完全倒序作答；结果与顺背分开呈现。'] },
    research: { profile: 'research' as const, estimatedMinutes: [6, 9], configPatch: { startSpan: 2, maxSpan: 8 }, reportCaveats: ['科研档扩展到广度 8；仍不是 Wechsler 分数或常模。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    maxSpan: metric('maxSpan', '最大倒背广度', 'working_memory_manipulation', 'level', 'higher_is_better', 'primary'),
    totalCorrectTrials: metric('totalCorrectTrials', '正确试次总数', 'working_memory_manipulation', 'count', 'higher_is_better', 'primary'),
    sequenceDistance: metric('sequenceDistance', '平均序列距离', 'working_memory_manipulation', 'score', 'lower_is_better', 'secondary'),
    medianResponseDurationMs: metric('medianResponseDurationMs', '中位作答时长', 'working_memory_manipulation', 'ms', 'descriptive', 'secondary'),
    completedLevelCount: metric('completedLevelCount', '完成级数', 'working_memory_manipulation', 'count', 'descriptive', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '完成级数与作答模式是否达到门槛。' },
    insufficientCompletedLevels: { key: 'insufficientCompletedLevels', label: '完成级数不足', description: '不足两个完整广度级。' },
    constantResponse: { key: 'constantResponse', label: '恒定回答', description: '多个试次重复提交完全相同序列。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时中断。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: {
    title: '数字倒背',
    headlineMetric: 'maxSpan',
    primaryMetrics: ['maxSpan', 'totalCorrectTrials'],
    secondaryMetrics: ['sequenceDistance', 'medianResponseDurationMs', 'completedLevelCount'],
    practicalTips: ['倒背要求在短时保持之外进行顺序操作，应与顺背结果分开阅读。'],
    disclaimer: '结果只反映本次数字倒背任务表现，不是完整工作记忆、Wechsler 等价值或年龄常模。',
  } satisfies SingleTaskReportDefinition,
  recommendedForCreate: false,
}
