import { deferredCognitiveRunner } from '../../core/deferred-runner'
const TrustgameTask = deferredCognitiveRunner(() => import('./TrustgameTask').then(module => module.TrustgameTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const trustgameRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'trustgame',
  name: '信任与公平博弈',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: TrustgameTask, prepareRunner: TrustgameTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'acceptanceRate', label: '总体接受率', displayType: 'percentage' },
    { key: 'unfairAcceptanceRate', label: '不公平提议接受率', displayType: 'percentage' },
    { key: 'rejectedUnfairCount', label: '拒绝不公平提议数', displayType: 'number' },
    { key: 'fairOfferCount', label: '公平提议轮数', displayType: 'number' },
    { key: 'medianDecisionMs', label: '决策用时中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '信任与公平博弈表现',
    headlineMetric: 'acceptanceRate',
    summaryMetrics: ['unfairAcceptanceRate', 'rejectedUnfairCount'],
    indexLabel: '公平感指数',
    practicalTips: ['没有对错：按你真实的取舍选择即可。', '拒绝意味着双方都拿不到，想一想何时值得。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
