import { deferredCognitiveRunner } from '../../core/deferred-runner'
const LetternumseriesTask = deferredCognitiveRunner(() => import('./LetternumseriesTask').then(module => module.LetternumseriesTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const letternumseriesRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'letternumseries',
  name: '字母数字序列',
  engineVersion: '1.0.1',
  scoringVersion: '1.0.0',
  RunnerComponent: LetternumseriesTask, prepareRunner: LetternumseriesTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'overallAccuracy', label: '重排回忆正确率', displayType: 'percentage' },
    { key: 'lettersAccuracy', label: '字母排序正确率', displayType: 'percentage' },
    { key: 'digitsAccuracy', label: '数字排序正确率', displayType: 'percentage' },
    { key: 'emptyRecallCount', label: '空回忆试次数', displayType: 'number' },
    { key: 'medianResponseMs', label: '回忆用时中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '字母数字序列表现',
    headlineMetric: 'overallAccuracy',
    summaryMetrics: ['lettersAccuracy', 'digitsAccuracy'],
    indexLabel: '序列重排指数',
    practicalTips: ['先记住“有哪些”，回忆时再排序：字母按 A→Z，数字从小到大。', '听呈现时可以分组默念：先字母后数字。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
