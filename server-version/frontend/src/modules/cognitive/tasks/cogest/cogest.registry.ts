import { deferredCognitiveRunner } from '../../core/deferred-runner'
const CogestTask = deferredCognitiveRunner(() => import('./CogestTask').then(module => module.CogestTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cogestRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'cogest',
  name: '认知估计',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CogestTask, prepareRunner: CogestTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '认知估计表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '估计能力指数',
    practicalTips: ['把题目给出的条件一条条列出来，再逐步推导。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
