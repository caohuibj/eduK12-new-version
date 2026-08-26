import { FlankerTask } from './FlankerTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const flankerRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'flanker',
  name: 'Flanker 箭头干扰',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: FlankerTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'flankerEffectMs', label: 'Flanker 干扰效应', unit: 'ms', displayType: 'ms' },
    { key: 'incongruentAccuracy', label: '不一致条件准确率', displayType: 'percentage' },
    { key: 'congruentAccuracy', label: '一致条件准确率', displayType: 'percentage' },
    { key: 'errorCost', label: '准确率干扰代价', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: 'Flanker 箭头干扰',
    headlineMetric: 'flankerEffectMs',
    summaryMetrics: ['flankerEffectMs', 'incongruentAccuracy', 'congruentAccuracy', 'errorCost'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次箭头干扰任务表现，不是临床诊断或人口常模。',
  },
}
