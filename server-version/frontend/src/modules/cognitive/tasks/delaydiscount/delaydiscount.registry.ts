import { deferredCognitiveRunner } from '../../core/deferred-runner'
const DelaydiscountTask = deferredCognitiveRunner(() => import('./DelaydiscountTask').then(module => module.DelaydiscountTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const delaydiscountRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'delaydiscount',
  name: '延迟满足选择',
  engineVersion: '1.0.1',
  scoringVersion: '1.0.0',
  RunnerComponent: DelaydiscountTask, prepareRunner: DelaydiscountTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'aucDelayDiscounting', label: '折扣曲线下面积', displayType: 'percentage' },
    { key: 'meanIndifferenceRate', label: '平均无差异点', displayType: 'percentage' },
    { key: 'laterChoiceRate', label: '选延后奖赏比例', displayType: 'percentage' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validTrialCount', label: '有效选择数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '延迟满足选择表现',
    headlineMetric: 'aucDelayDiscounting',
    summaryMetrics: ['laterChoiceRate', 'meanIndifferenceRate'],
    showProductIndex: false,
    indexLabel: '延迟折扣指数',
    practicalTips: ['没有标准答案：可以回想，金额和等待时间分别怎样影响了你的选择。', '想一想等待是否值得，不要因为想“表现好”而刻意选某一边。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
