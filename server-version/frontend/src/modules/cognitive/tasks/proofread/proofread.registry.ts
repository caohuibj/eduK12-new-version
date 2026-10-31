import { deferredCognitiveRunner } from '../../core/deferred-runner'
const ProofreadTask = deferredCognitiveRunner(() => import('./ProofreadTask').then(module => module.ProofreadTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const proofreadRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'proofread',
  name: '文本校对',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: ProofreadTask, prepareRunner: ProofreadTask.prepare,
  completionMode: 'manual',
  readiness: { category: 'fixed-trial', inputs: ['keyboard','pointer','touch'], orientation: 'any',
    globalKeyboardCapture: true, resumeDisposition: 'restart-required',
    resumeReason: '练习及题内阶段未持久化，未封存的中断记录不能只按最大试次索引自动恢复。',
    frozenMediaSlots: ['instruction','example','stimulus'] },
  metricDefinitions: [
    { key: 'answeredCount', label: '已作答题数', displayType: 'number' },
    { key: 'correctCount', label: '答对题数', displayType: 'number' },
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '文本校对表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '校对指数',
    practicalTips: ['仔细读句子的每个字，找出写错或用错的那个。', '四个选项都读一遍，根据原文比较选项。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
