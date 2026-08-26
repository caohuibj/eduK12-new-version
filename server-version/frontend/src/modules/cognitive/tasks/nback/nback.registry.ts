import { NbackTask } from './NbackTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const nbackRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'nback',
  name: 'N-Back',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: NbackTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'maxReliableN', label: '达到门槛的最高 N', displayType: 'number' },
    { key: 'dPrimeByN', label: '各 N 的 d′', displayType: 'text' },
    { key: 'loadCostDPrime', label: '负荷效应', displayType: 'number' },
  ],
  reportDefinition: {
    title: 'N-Back 工作记忆更新',
    headlineMetric: 'maxReliableN',
    summaryMetrics: ['dPrimeByN', 'loadCostDPrime'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次工作记忆更新任务表现，不是临床诊断或常模。',
  },
}
