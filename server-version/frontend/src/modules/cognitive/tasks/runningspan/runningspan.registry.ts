import { deferredCognitiveRunner } from '../../core/deferred-runner'
const RunningspanTask = deferredCognitiveRunner(() => import('./RunningspanTask').then(module => module.RunningspanTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const runningspanRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'runningspan',
  name: '运行记忆广度',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: RunningspanTask, prepareRunner: RunningspanTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'runningSpanAccuracy', label: '串行回忆正确率', displayType: 'percentage' },
    { key: 'totalCorrectPositions', label: '串行正确总数', displayType: 'number' },
    { key: 'intrusionRate', label: '侵入比例', displayType: 'percentage' },
    { key: 'medianResponseMs', label: '回忆用时中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '运行记忆广度表现',
    headlineMetric: 'runningSpanAccuracy',
    summaryMetrics: ['intrusionRate', 'totalCorrectPositions'],
    indexLabel: '记忆更新指数',
    practicalTips: ['不知道序列何时结束：试着一直保持“最近几个”在脑子里。', '按顺序回忆，别只求快；稳住的顺序就是得分。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
