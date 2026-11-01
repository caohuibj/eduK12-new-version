import { deferredCognitiveRunner } from '../../core/deferred-runner'
const LineangleTask = deferredCognitiveRunner(() => import('./LineangleTask').then(module => module.LineangleTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const lineangleRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'lineangle',
  name: '线条方向判断',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: LineangleTask, prepareRunner: LineangleTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '线条方向判断表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '方向匹配指数',
    practicalTips: ['先看目标线段斜向哪边，再逐个对比选项。', '角度很接近时，注意线段与水平方向的夹角大小。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}

export const lineangleRegistryEntryV2: CognitiveFrontendRegistryEntry = {
  ...lineangleRegistryEntry, engineVersion: '2.0.0', scoringVersion: '2.0.0',
  reportDefinition: { ...lineangleRegistryEntry.reportDefinition, showProductIndex: false, indexLabel: '本次匹配正确率', disclaimer: '仅描述本次无向线段匹配，不是能力指数、诊断或经过验证的同龄人常模。' },
}
