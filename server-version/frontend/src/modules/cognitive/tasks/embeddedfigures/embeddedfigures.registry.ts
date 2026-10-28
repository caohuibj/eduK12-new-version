import { deferredCognitiveRunner } from '../../core/deferred-runner'
const EmbeddedfiguresTask = deferredCognitiveRunner(() => import('./EmbeddedfiguresTask').then(module => module.EmbeddedfiguresTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const embeddedfiguresRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'embeddedfigures',
  name: '嵌入图形',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: EmbeddedfiguresTask, prepareRunner: EmbeddedfiguresTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '嵌入图形表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '知觉去干扰指数',
    practicalTips: ['先记住目标的形状和大小，再在复杂图形里排除明显不像的。', '顶点数量是关键：目标永远是三角形。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
