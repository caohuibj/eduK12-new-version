import { deferredCognitiveRunner } from '../../core/deferred-runner'
const CogestTask = deferredCognitiveRunner(() => import('./CogestTask').then(module => module.CogestTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cogestRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'cogest',
  name: '认知估算',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CogestTask, prepareRunner: CogestTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '合理量级选中率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '认知估算表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '本次估算选中率',
    practicalTips: ['先想想现实中的物体和场景，再判断数量是否合理。', '比较数量级，排除明显不合现实的值。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
