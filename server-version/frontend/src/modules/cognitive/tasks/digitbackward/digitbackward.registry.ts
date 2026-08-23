import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { DigitbackwardTask } from './DigitbackwardTask'

export const digitbackwardRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'digitbackward', name: '数字倒背', engineVersion: '1.0.0', scoringVersion: '1.0.0', RunnerComponent: DigitbackwardTask, completionMode: 'task',
  metricDefinitions: [
    { key: 'maxSpan', label: '最大倒背广度', displayType: 'number' },
    { key: 'totalCorrectTrials', label: '正确试次总数', displayType: 'number' },
    { key: 'sequenceDistance', label: '平均序列距离', displayType: 'number' },
  ],
  reportDefinition: { title: '数字倒背', headlineMetric: 'maxSpan', summaryMetrics: ['maxSpan', 'totalCorrectTrials', 'sequenceDistance'], indexLabel: '任务表现指数', disclaimer: '结果只反映本次数字倒背任务表现，不是完整工作记忆、Wechsler 等价值或年龄常模。' },
}
