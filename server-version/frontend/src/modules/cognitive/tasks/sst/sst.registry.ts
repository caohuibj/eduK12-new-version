import { SstTask } from './SstTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const sstRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'sst',
  name: '停止信号任务',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SstTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'ssrtMs', label: 'SSRT', unit: 'ms', displayType: 'ms' },
    { key: 'pRespondStop', label: 'Stop 响应概率', displayType: 'percentage' },
    { key: 'goMedianRtMs', label: 'Go 中位反应时', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '停止信号任务 SST',
    headlineMetric: 'ssrtMs',
    summaryMetrics: ['ssrtMs', 'pRespondStop', 'goMedianRtMs'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次动作停止任务表现，不是临床诊断或常模。体验/正式版 SSRT 稳定性受限。',
  },
}
