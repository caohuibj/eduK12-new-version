import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { LexicaldecisionTask } from './LexicaldecisionTask'

export const lexicaldecisionRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'lexicaldecision',
  name: '中文词汇判断',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: LexicaldecisionTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'dPrime', label: '词汇判断 d-prime', displayType: 'number' },
    { key: 'lexicalityEffectMs', label: '真词/伪词反应时差', unit: 'ms', displayType: 'ms' },
    { key: 'accuracyReal', label: '真词正确率', displayType: 'percentage' },
    { key: 'accuracyPseudo', label: '伪词正确率', displayType: 'percentage' },
    { key: 'medianRtReal', label: '真词反应时中位数', unit: 'ms', displayType: 'ms' },
    { key: 'medianRtPseudo', label: '伪词反应时中位数', unit: 'ms', displayType: 'ms' },
    { key: 'omissionRate', label: '遗漏比例', displayType: 'percentage' },
    { key: 'validResponseCount', label: '有效响应数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '中文词汇判断',
    headlineMetric: 'dPrime',
    summaryMetrics: ['dPrime', 'lexicalityEffectMs', 'accuracyReal', 'accuracyPseudo'],
    indexLabel: '任务表现指数',
    disclaimer: '结果只描述本次中文真词/伪词判断表现，不是语言能力、阅读能力或临床判断。',
  },
}
