import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { BartTask } from './BartTask'

export const bartRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'bart',
  name: '气球泵压行为任务',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: BartTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'adjustedPumps', label: '现金化气球平均泵压', displayType: 'number' },
    { key: 'explosionCount', label: '爆破次数', displayType: 'number' },
    { key: 'cashoutCount', label: '现金化次数', displayType: 'number' },
    { key: 'meanPumpsAllCompleted', label: '所有完成气球平均泵压', displayType: 'number' },
    { key: 'cashoutRate', label: '现金化率', displayType: 'percentage' },
    { key: 'completedBalloonCount', label: '完成气球数', displayType: 'number' },
    { key: 'omissionRate', label: '遗漏率', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: '气球泵压行为任务',
    headlineMetric: 'adjustedPumps',
    summaryMetrics: ['adjustedPumps', 'explosionCount', 'cashoutCount', 'cashoutRate'],
    indexLabel: '任务表现指数',
    showProductIndex: false,
    disclaimer: '结果只描述本次虚拟气球任务中的泵压、爆破、现金化和遗漏行为，不输出风险高低、好坏、冲动性等级或人格判断。',
  },
}
