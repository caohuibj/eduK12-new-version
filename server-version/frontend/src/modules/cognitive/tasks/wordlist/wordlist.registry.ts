import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { WordlistTask } from './WordlistTask'

export const wordlistRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'wordlist',
  name: '中文词表自由回忆',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: WordlistTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'immediateAccuracy', label: '即时回忆正确率', displayType: 'percentage' },
    { key: 'learningGain', label: '学习轮次增益', displayType: 'percentage' },
    { key: 'delayedRecallAccuracy', label: '延迟回忆正确率', displayType: 'percentage' },
    { key: 'totalImmediateCorrect', label: '即时累计正确数', displayType: 'number' },
    { key: 'intrusionCount', label: '侵入词数量', displayType: 'number' },
    { key: 'duplicateResponseCount', label: '重复响应数量', displayType: 'number' },
    { key: 'omissionRate', label: '遗漏比例', displayType: 'percentage' },
    { key: 'medianResponseDurationMs', label: '回忆作答时长中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '中文词表自由回忆',
    headlineMetric: 'immediateAccuracy',
    summaryMetrics: ['immediateAccuracy', 'learningGain', 'delayedRecallAccuracy', 'totalImmediateCorrect'],
    indexLabel: '任务表现指数',
    disclaimer: '结果只描述本次中文词表键盘自由回忆表现，不是记忆能力、临床状态或人口常模判断。',
  },
}
