import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { ReversallearningTask } from './ReversallearningTask'

export const reversallearningRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'reversallearning',
  name: '概率学习与规则反转',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: ReversallearningTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'acquisitionAccuracy', label: '习得阶段正确率', displayType: 'percentage' },
    { key: 'reversalAccuracy', label: '反转阶段正确率', displayType: 'percentage' },
    { key: 'reversalCost', label: '反转代价', displayType: 'percentage' },
    { key: 'perseverativeErrorCount', label: '坚持旧规则错误次数', displayType: 'number' },
    { key: 'trialsToAcquisitionCriterion', label: '达到习得标准所需试次', displayType: 'number' },
    { key: 'trialsToReversalCriterion', label: '达到反转标准所需试次', displayType: 'number' },
    { key: 'feedbackWinRate', label: '反馈获得率', displayType: 'percentage' },
    { key: 'omissionRate', label: '遗漏率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '中位反应时', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '概率学习与规则反转',
    headlineMetric: 'reversalAccuracy',
    summaryMetrics: ['acquisitionAccuracy', 'reversalAccuracy', 'reversalCost', 'perseverativeErrorCount'],
    indexLabel: '任务表现指数',
    disclaimer: '结果只描述本次固定阶段概率学习任务中的选择、反馈和反转表现，不代表人格、风险偏好或诊断。',
  },
}
