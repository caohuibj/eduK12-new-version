import { deferredCognitiveRunner } from '../../core/deferred-runner'
const NumberlineTask = deferredCognitiveRunner(() => import('./NumberlineTask').then(module => module.NumberlineTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const numberlineRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'numberline',
  name: '数字线估计',
  engineVersion: '1.0.1',
  readiness: {
    category: 'fixed-trial',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: false,
    resumeDisposition: 'restart-required',
    resumeReason: '数字线练习阶段与未保存的定位状态不能由 trialIndex 安全恢复。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: NumberlineTask, prepareRunner: NumberlineTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'paePercent', label: '平均绝对误差', displayType: 'percentage' },
    { key: 'biasPercent', label: '方向偏差', displayType: 'percentage' },
    { key: 'withinTenRate', label: '十格命中率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '作答用时中位数', unit: 'ms', displayType: 'ms' },
    { key: 'validTrialCount', label: '有效试次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '数字线估计表现',
    headlineMetric: 'paePercent',
    summaryMetrics: ['withinTenRate', 'biasPercent'],
    indexLabel: '数字线估计指数',
    practicalTips: ['估计位置时，先想清楚这个数和 0、中点、最大值的关系，再作答。', '数字越大不代表越难，试着把线段均匀分段来定位。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
