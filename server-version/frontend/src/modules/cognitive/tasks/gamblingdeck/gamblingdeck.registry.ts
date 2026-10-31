import { deferredCognitiveRunner } from '../../core/deferred-runner'
const GamblingdeckTask = deferredCognitiveRunner(() => import('./GamblingdeckTask').then(module => module.GamblingdeckTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const gamblingdeckRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'gamblingdeck',
  name: '宝箱决策学习',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: GamblingdeckTask, prepareRunner: GamblingdeckTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'advantageousChoiceRate', label: '优势箱选择比例', displayType: 'percentage' },
    { key: 'netScore', label: '累计净得分', displayType: 'number' },
    { key: 'blockTrendSlope', label: '分块学习斜率', displayType: 'number' },
    { key: 'deckChoiceRates', label: '各箱选择比例', displayType: 'text' },
  ],
  reportDefinition: {
    title: '宝箱决策学习表现',
    headlineMetric: 'advantageousChoiceRate',
    summaryMetrics: ['netScore', 'blockTrendSlope'],
    indexLabel: '决策学习指数',
    practicalTips: ['先在小损失里观察规律：有的箱子赢多输得也多。', '如果发现自己总选同一个箱子，试着换一个对比一下。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
