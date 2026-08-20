import { StroopTask } from './StroopTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const stroopRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'stroop',
  name: '干扰控制任务',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: StroopTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'medianRtCongruent', label: '一致试次中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'medianRtIncongruent', label: '冲突试次中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'stroopEffectMs', label: '干扰效应', unit: 'ms', displayType: 'ms' },
    { key: 'accuracy', label: '总正确率', displayType: 'percentage' },
    { key: 'congruentAccuracy', label: '一致正确率', displayType: 'percentage' },
    { key: 'incongruentAccuracy', label: '冲突正确率', displayType: 'percentage' },
    { key: 'errorCost', label: '错误代价', displayType: 'percentage' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validCongruentRtCount', label: '一致有效 RT 数', displayType: 'number' },
    { key: 'validIncongruentRtCount', label: '冲突有效 RT 数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '干扰控制任务表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtCongruent', 'medianRtIncongruent', 'stroopEffectMs'],
    indexLabel: 'Stroop 表现指数',
    practicalTips: ['面对冲突信息时先确认目标规则，再做响应。', '减少多任务切换可降低无关信息干扰。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
