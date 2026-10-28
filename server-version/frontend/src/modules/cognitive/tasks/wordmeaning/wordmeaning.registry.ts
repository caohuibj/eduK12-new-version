import { deferredCognitiveRunner } from '../../core/deferred-runner'
const WordmeaningTask = deferredCognitiveRunner(() => import('./WordmeaningTask').then(module => module.WordmeaningTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const wordmeaningRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'wordmeaning',
  name: '词汇理解',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: WordmeaningTask, prepareRunner: WordmeaningTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '词汇理解表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '词义掌握指数',
    practicalTips: ['把词语放进句子里想一想，再对照选项。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
