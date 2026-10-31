import { deferredCognitiveRunner } from '../../core/deferred-runner'
const CogestTaskV11 = deferredCognitiveRunner(() => import('./CogestTaskV11').then(module => module.CogestTaskV11))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cogestRegistryEntryV11: CognitiveFrontendRegistryEntry = {
  testType: 'cogest',
  name: '认知估计',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: CogestTaskV11, prepareRunner: CogestTaskV11.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '认知估计表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '本次估算正确率',
    practicalTips: ['先确定单位与数量级，再作近似估算。', '结合题内线索检查估计，不作能力或同龄人排名。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
