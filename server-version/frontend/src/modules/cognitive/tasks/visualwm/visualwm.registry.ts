import { deferredCognitiveRunner } from '../../core/deferred-runner'
const VisualwmTask = deferredCognitiveRunner(() => import('./VisualwmTask').then(module => module.VisualwmTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const visualwmRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'visualwm',
  name: '视觉工作记忆',
  engineVersion: '1.0.1',
  scoringVersion: '1.0.0',
  RunnerComponent: VisualwmTask, prepareRunner: VisualwmTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'hitRate', label: '变化命中率', displayType: 'percentage' },
    { key: 'falseAlarmRate', label: '变化误报率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'correctCount', label: '正确试次数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '视觉工作记忆表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['hitRate', 'falseAlarmRate'],
    indexLabel: '视觉记忆指数',
    practicalTips: ['不要用言语描述颜色，直接记住颜色本身。', '保持眼睛不动，用余光覆盖所有方块。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
