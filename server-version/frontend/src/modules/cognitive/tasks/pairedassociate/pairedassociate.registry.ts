import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { PairedassociateTask } from './PairedassociateTask'

export const pairedassociateRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'pairedassociate', name: '图形—位置配对学习', engineVersion: '1.0.0', scoringVersion: '1.0.0', RunnerComponent: PairedassociateTask, completionMode: 'task',
  metricDefinitions: [
    { key: 'learningSlope', label: '学习斜率', displayType: 'number' },
    { key: 'trialsToCriterion', label: '达到标准所需轮次', displayType: 'number' },
    { key: 'immediateAccuracy', label: '最终即时正确率', displayType: 'percentage' },
    { key: 'delayedAccuracy', label: '延迟正确率', displayType: 'percentage' },
  ],
  reportDefinition: { title: '图形—位置配对学习', headlineMetric: 'immediateAccuracy', summaryMetrics: ['learningSlope', 'trialsToCriterion', 'immediateAccuracy', 'delayedAccuracy'], indexLabel: '任务表现指数', disclaimer: '结果来自内部非语言配对刺激，不等同 CANTAB PAL、临床记忆判断或人口常模。' },
}
