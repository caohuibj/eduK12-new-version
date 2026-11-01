import { deferredCognitiveRunner } from '../../core/deferred-runner'
const VisualwmTask = deferredCognitiveRunner(() => import('./VisualwmTask').then(module => module.VisualwmTask))
const VisualwmTaskV11 = deferredCognitiveRunner(() => import('./VisualwmTaskV11').then(module => module.VisualwmTaskV11))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const visualwmRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'visualwm',
  name: '视觉工作记忆',
  engineVersion: '1.0.1',
  readiness: {
    category: 'staged',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '学习、保持与探测阶段及当前空间刺激状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
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

export const visualwmRegistryEntryV11: CognitiveFrontendRegistryEntry = {
  ...visualwmRegistryEntry,
  engineVersion: '1.1.0',
  RunnerComponent: VisualwmTaskV11,
  prepareRunner: VisualwmTaskV11.prepare,
  metricDefinitions: visualwmRegistryEntry.metricDefinitions.map((metric) => metric.key === 'medianRtMs'
    ? { ...metric, label: '已答反应中位用时' }
    : { ...metric }),
  reportDefinition: {
    ...visualwmRegistryEntry.reportDefinition,
    showProductIndex: false,
    title: '颜色变化判断表现',
    practicalTips: ['先看正式记录是否完整，再结合总体正确率、命中率与误报率阅读。', '反应用时包括符合条件的正确和错误作答，不代表记忆容量。'],
    disclaimer: '这是颜色变化检测的项目变式，只描述本次表现，不是标准测验复刻、记忆容量或年龄常模。',
  },
}
