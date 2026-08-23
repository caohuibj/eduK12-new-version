import { CardsortTask } from './CardsortTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cardsortRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'cardsort',
  name: '规则卡片分类',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CardsortTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'switchCostRtMs', label: '规则转换 RT 代价', unit: 'ms', displayType: 'ms' },
    { key: 'switchCostAccuracy', label: '规则转换准确率代价', displayType: 'percentage' },
    { key: 'perseverativeErrorRate', label: '持续性错误率', displayType: 'percentage' },
    { key: 'postSwitchRecovery', label: '转换后恢复', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: '规则卡片分类',
    headlineMetric: 'switchCostRtMs',
    summaryMetrics: ['switchCostRtMs', 'switchCostAccuracy', 'perseverativeErrorRate', 'postSwitchRecovery'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次双规则分类任务表现，不是商业卡片分类测验、临床诊断或人口常模。',
  },
}
