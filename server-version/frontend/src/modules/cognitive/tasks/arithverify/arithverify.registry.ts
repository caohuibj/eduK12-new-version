import { deferredCognitiveRunner } from '../../core/deferred-runner'
const ArithverifyTask = deferredCognitiveRunner(() => import('./ArithverifyTask').then(module => module.ArithverifyTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const arithverifyRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'arithverify',
  name: '算术验证',
  engineVersion: '1.0.0',
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
    title: '算术验证表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'problemSizeSlopeMs'],
    indexLabel: '算术验证指数',
    practicalTips: ['先算结果，再和给出的数比较；保持稳定节奏比抢快更重要。', '个位加法越熟练，判断越快；多练习能缩短反应时间。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
