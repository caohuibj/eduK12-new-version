import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SeriescompleteTaskV11 = deferredCognitiveRunner(() => import('./SeriescompleteTaskV11').then(module => module.SeriescompleteTaskV11))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const seriescompleteRegistryEntryV11: CognitiveFrontendRegistryEntry = {
  testType: 'seriescomplete',
  name: '数列完成',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: SeriescompleteTaskV11, prepareRunner: SeriescompleteTaskV11.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '数列完成表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '归纳推理指数',
    practicalTips: ['先确定单位与数量级，再作近似估算。', '结合题内线索检查估计，不作能力或同龄人排名。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
