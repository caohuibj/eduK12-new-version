import { deferredCognitiveRunner } from '../../core/deferred-runner'
const CancellationTask = deferredCognitiveRunner(() => import('./CancellationTask').then(module => module.CancellationTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cancellationRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'cancellation',
  name: '视觉划消',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CancellationTask, prepareRunner: CancellationTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'hitRate', label: '命中率', displayType: 'percentage' },
    { key: 'falseAlarmRate', label: '误报比例', displayType: 'percentage' },
    { key: 'hitCount', label: '命中数', displayType: 'number' },
    { key: 'missCount', label: '漏报数', displayType: 'number' },
    { key: 'falseAlarmCount', label: '误报数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '视觉划消表现',
    headlineMetric: 'hitRate',
    summaryMetrics: ['falseAlarmRate', 'missCount'],
    indexLabel: '视觉搜索指数',
    practicalTips: ['按行从左到右扫，比乱找更快更稳。', '不确定的格子不要乱点，误报会拉低分数。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
