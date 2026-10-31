import { deferredCognitiveRunner } from '../../core/deferred-runner'
const WordanalogyTask = deferredCognitiveRunner(() => import('./WordanalogyTask').then(module => module.WordanalogyTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const wordanalogyRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'wordanalogy',
  name: '言语类比推理',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: WordanalogyTask, prepareRunner: WordanalogyTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '言语类比推理表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '类比推理指数',
    practicalTips: ['先说出前一对词的关系（功能、部分、因果……），再套到后一对上。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
