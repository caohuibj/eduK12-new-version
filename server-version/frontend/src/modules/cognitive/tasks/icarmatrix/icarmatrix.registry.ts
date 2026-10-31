import { deferredCognitiveRunner } from '../../core/deferred-runner'
const IcarmatrixV2Task = deferredCognitiveRunner(() => import('./IcarmatrixV2Task').then(module => module.IcarmatrixV2Task))
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
export const icarmatrixV2RegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'icarmatrix',
  engineVersion: '2.0.0',
  name: '图形矩阵推理 · 规则题库版',
  scoringVersion: '1.0.0',
  RunnerComponent: IcarmatrixV2Task, prepareRunner: IcarmatrixV2Task.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'correctCount', label: '答对题数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '图形矩阵推理表现（规则题库版）',
    headlineMetric: 'accuracy',
    summaryMetrics: ['correctCount'],
    indexLabel: '图形推理指数',
    practicalTips: ['先横着看每行变了什么，再竖着验证。', '规则可能组合：位置、旋转、填充、大小分开看。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
