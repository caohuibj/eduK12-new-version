import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition, CognitiveProfileDefinition } from '../../cognitive.types'
import { metric, allProfiles } from '../../task-primitives'

export const towerRegistryMeta = {
  name: '塔式规划', category: 'planning', referenceEligibleMetricKeys: [] as const, randomizationAlgorithmVersion: 'seq-v1.0.0', profileDefinitionVersion: '1.0.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [3, 5], configPatch: { problemCount: 4 }, reportCaveats: ['体验档仅含低、中难度问题，不进入综合分析。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [8, 13], configPatch: { problemCount: 10 }, reportCaveats: ['报告解题、最短路径效率与规则违反，不形成计划能力等级。'] },
    research: { profile: 'research' as const, estimatedMinutes: [15, 22], configPatch: { problemCount: 18 }, reportCaveats: ['科研档覆盖三档最短路径难度；重复测试可能有练习效应。'] },
  } satisfies Record<CognitiveProfile, CognitiveProfileDefinition>,
  metricDefinitionVersion: '1.0.0',
  metricDefinitions: {
    minimumMoveSolveRate: metric('minimumMoveSolveRate', '最短步解题比例', 'planning', 'ratio', 'higher_is_better', 'primary'),
    excessMoves: metric('excessMoves', '已解题平均额外步数', 'planning', 'count', 'lower_is_better', 'primary'),
    solveRate: metric('solveRate', '解题比例', 'planning', 'ratio', 'higher_is_better', 'secondary'),
    firstMoveLatencyMs: metric('firstMoveLatencyMs', '首步计划时长', 'planning', 'ms', 'descriptive', 'secondary'),
    ruleViolations: metric('ruleViolations', '规则违反次数', 'planning', 'count', 'lower_is_better', 'primary'),
    noAttemptRate: metric('noAttemptRate', '未尝试问题比例', 'planning', 'ratio', 'lower_is_better', 'secondary'),
  } as Record<string, MetricDefinition>,
  qualityDefinitionVersion: '1.0.0',
  qualityDefinitions: {
    interpretable: { key: 'interpretable', label: '可解释', description: '尝试覆盖和规则违反是否达到门槛。' },
    excessiveRuleViolations: { key: 'excessiveRuleViolations', label: '规则违反过多', description: '无效移动次数达到质量门。' },
    insufficientAttemptedProblems: { key: 'insufficientAttemptedProblems', label: '尝试问题不足', description: '少于一半问题有移动尝试。' },
    interrupted: { key: 'interrupted', label: '作答中断', description: '存在切屏或超时。' },
  } as Record<string, QualityDefinition>,
  reportDefinitionVersion: '1.0.0',
  reportDefinition: { title: '塔式规划', headlineMetric: 'minimumMoveSolveRate', primaryMetrics: ['minimumMoveSolveRate', 'excessMoves', 'ruleViolations'], secondaryMetrics: ['solveRate', 'firstMoveLatencyMs', 'noAttemptRate'], practicalTips: ['解题比例、额外步数和规则违反应分开阅读；首步时长只作方法信息。'], disclaimer: '结果只反映本次内部塔式任务表现，不是商业 Tower 测验、计划能力诊断或人口常模。' } satisfies SingleTaskReportDefinition,
  recommendedForCreate: true,
}
