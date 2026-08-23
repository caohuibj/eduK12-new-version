import { CorsiTask } from './CorsiTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const corsiRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'corsi',
  name: 'Corsi 方块广度',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CorsiTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'maxSpan', label: '最大空间广度', displayType: 'number' },
    { key: 'totalCorrectTrials', label: '总正确试次', displayType: 'number' },
    { key: 'firstTryPassCount', label: '首次通过级数', displayType: 'number' },
  ],
  reportDefinition: {
    title: 'Corsi 视空间广度',
    headlineMetric: 'maxSpan',
    summaryMetrics: ['totalCorrectTrials', 'firstTryPassCount'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次视空间记忆任务表现，不是临床诊断或常模。Corsi 不与数字广度合并为记忆总分。',
  },
}
