import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SeriescompleteTask = deferredCognitiveRunner(() => import('./SeriescompleteTask').then(module => module.SeriescompleteTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const seriescompleteRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'seriescomplete',
  name: '数列完成',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SeriescompleteTask, prepareRunner: SeriescompleteTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '数列完成表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '归纳推理指数',
    practicalTips: ['把题目给出的条件一条条列出来，再逐步推导。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
