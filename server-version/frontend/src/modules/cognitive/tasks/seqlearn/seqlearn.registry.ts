import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SeqlearnTask = deferredCognitiveRunner(() => import('./SeqlearnTask').then(module => module.SeqlearnTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const seqlearnRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'seqlearn',
  name: '序列反应学习',
  engineVersion: '1.0.1',
  readiness: {
    category: 'learning',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '已暴露序列与学习阶段状态不能仅由 trialIndex 证明。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: SeqlearnTask, prepareRunner: SeqlearnTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'srtPatternAdvantageMs', label: '序列学习效应', unit: 'ms', displayType: 'ms' },
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'randomBlockAccuracy', label: '随机块正确率', displayType: 'percentage' },
    { key: 'medianRtLatePatternMs', label: '后期重复块中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'medianRtRandomMs', label: '随机块中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'medianRtEarlyPatternMs', label: '早期重复块中位用时', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '序列反应学习表现',
    headlineMetric: 'srtPatternAdvantageMs',
    summaryMetrics: ['accuracy', 'medianRtLatePatternMs'],
    indexLabel: '本次位置反应正确率（百分数）',
    practicalTips: ['看到信号后，尽量准确、及时地选择对应位置。', '回想是否逐渐熟悉了按键；用时差还会受练习和疲劳影响。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
