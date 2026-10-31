import { deferredCognitiveRunner } from '../../core/deferred-runner'
const TimecopyTask = deferredCognitiveRunner(() => import('./TimecopyTask').then(module => module.TimecopyTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const timecopyRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'timecopy',
  name: '时间间隔复制',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: false,
    resumeDisposition: 'restart-required',
    resumeReason: '观察、待复制与复制计时阶段没有独立持久化断点。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: TimecopyTask, prepareRunner: TimecopyTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'meanAbsErrorRatio', label: '平均相对误差', displayType: 'percentage' },
    { key: 'biasRatio', label: '方向偏差', displayType: 'percentage' },
    { key: 'withinTwentyRate', label: '20%内命中率', displayType: 'percentage' },
    { key: 'medianReproductionMs', label: '复制时长中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '时间间隔复制表现',
    headlineMetric: 'meanAbsErrorRatio',
    summaryMetrics: ['withinTwentyRate', 'biasRatio'],
    showProductIndex: false,
    indexLabel: '时间复制指数',
    practicalTips: ['心里默数或感受节奏都可以，选一种并保持一致。', '复制时不要看表，凭感觉按下结束。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
