import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SeqlearnTask = deferredCognitiveRunner(() => import('./SeqlearnTask').then(module => module.SeqlearnTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const seqlearnRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'seqlearn',
  name: '序列反应学习',
  engineVersion: '1.0.0',
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
    indexLabel: '序列学习指数',
    practicalTips: ['位置规律不会被告知：跟着感觉快速反应即可。', '保持稳定节奏，学习效应来自重复暴露。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
