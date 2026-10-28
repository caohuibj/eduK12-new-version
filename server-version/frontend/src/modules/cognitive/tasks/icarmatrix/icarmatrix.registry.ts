import { deferredCognitiveRunner } from '../../core/deferred-runner'
const IcarmatrixTask = deferredCognitiveRunner(() => import('./IcarmatrixTask').then(module => module.IcarmatrixTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const icarmatrixRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'icarmatrix',
  name: '图形矩阵推理',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: IcarmatrixTask, prepareRunner: IcarmatrixTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '图形矩阵推理表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '矩阵推理指数',
    practicalTips: ['先横着看每行缺什么，再竖着验证规律。', '属性可能同时变化：形状、填充、数量分开来看。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
