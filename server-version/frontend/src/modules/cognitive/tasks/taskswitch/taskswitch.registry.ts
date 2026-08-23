import { TaskswitchTask } from './TaskswitchTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const taskswitchRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'taskswitch',
  name: '任务转换',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: TaskswitchTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'switchCostRtMs', label: 'RT 转换代价', unit: 'ms', displayType: 'ms' },
    { key: 'switchCostAccuracy', label: '准确率转换代价', displayType: 'percentage' },
    { key: 'accuracySwitch', label: 'Switch 准确率', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: '任务转换 Task Switching',
    headlineMetric: 'switchCostRtMs',
    summaryMetrics: ['switchCostRtMs', 'switchCostAccuracy', 'accuracySwitch'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次认知灵活性任务表现，不是临床诊断或常模。',
  },
}
