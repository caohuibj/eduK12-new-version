import { MemoryTask } from './MemoryTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const memoryRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'memory',
  name: '数字序列短时记忆',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: MemoryTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'maxSpan', label: '最大数字广度', unit: '位', displayType: 'number' },
    { key: 'levelsPassed', label: '通过层级', displayType: 'number' },
    { key: 'firstTryPassCount', label: '首次通过次数', displayType: 'number' },
    { key: 'trialCount', label: '正式试次数', displayType: 'number' },
    { key: 'interruptedCount', label: '中断试次数', displayType: 'number' },
    { key: 'medianResponseDurationMs', label: '中位作答时长', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '数字序列短时记忆',
    headlineMetric: 'maxSpan',
    summaryMetrics: ['levelsPassed', 'firstTryPassCount'],
    indexLabel: '序列记忆表现指数',
    practicalTips: ['较长信息可以尝试分组、复述和分段记忆。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
