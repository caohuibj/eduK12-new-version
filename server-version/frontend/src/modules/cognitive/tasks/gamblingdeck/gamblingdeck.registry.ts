import { deferredCognitiveRunner } from '../../core/deferred-runner'
const GamblingdeckTask = deferredCognitiveRunner(() => import('./GamblingdeckTask').then(module => module.GamblingdeckTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const gamblingdeckRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'gamblingdeck',
  name: '宝箱决策学习',
  engineVersion: '1.0.1',
  readiness: {
    category: 'decision',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: false,
    resumeDisposition: 'restart-required',
    resumeReason: '练习阶段、牌堆选择与累计收益状态不能仅由 trialIndex 重建。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
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
    showProductIndex: false,
    indexLabel: '决策学习指数',
    practicalTips: ['先在小损失里观察规律：有的箱子赢多输得也多。', '回想一次选择调整：你依据的是最近一次输赢，还是多次反馈的整体规律？'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
