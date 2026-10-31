import { deferredCognitiveRunner } from '../../core/deferred-runner'
const ArithverifyTask = deferredCognitiveRunner(() => import('./ArithverifyTask').then(module => module.ArithverifyTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const arithverifyRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'arithverify',
  name: '算术验证',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '练习阶段与当前算式呈现/计时状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: ArithverifyTask, prepareRunner: ArithverifyTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'problemSizeSlopeMs', label: '问题规模斜率', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '算术验证表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'problemSizeSlopeMs'],
    indexLabel: '算术验证指数',
    practicalTips: ['先算结果，再和给出的数比较；保持稳定节奏比抢快更重要。', '回想这次更常见的是算错、看错给出的结果，还是未及时作答；可先选几道简单算式，慢慢核对判断过程。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
