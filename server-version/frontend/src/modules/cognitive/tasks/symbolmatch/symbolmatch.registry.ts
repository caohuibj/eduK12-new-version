import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SymbolmatchTask = deferredCognitiveRunner(() => import('./SymbolmatchTask').then(module => module.SymbolmatchTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const symbolmatchRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'symbolmatch',
  name: '符号数字配对',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SymbolmatchTask, prepareRunner: SymbolmatchTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '符号数字配对表现',
    headlineMetric: 'medianRtMs',
    summaryMetrics: ['accuracy', 'errorCount'],
    indexLabel: '配对速度指数',
    practicalTips: ['先记映射表的位置，再快速作答；眼睛少离开图例。', '准确优先：错了再改反而更慢。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
