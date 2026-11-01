import { deferredCognitiveRunner } from '../../core/deferred-runner'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
const MatrixTask = deferredCognitiveRunner(() => import('./MatrixTask').then(module => module.MatrixTask))

export const matrixRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'matrix',
  name: '矩阵规则推理',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: MatrixTask, prepareRunner: MatrixTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '正确率', displayType: 'percentage' },
    { key: 'accuracyByRuleFamily', label: '各规则族正确率', displayType: 'text' },
    { key: 'reachedDifficulty', label: '最高有正确作答的设计层级', displayType: 'number' },
    { key: 'medianRtMs', label: '正确反应中位时长', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '矩阵规则推理',
    headlineMetric: 'accuracy',
    summaryMetrics: ['accuracy', 'accuracyByRuleFamily', 'medianRtMs'],
    indexLabel: '任务表现指数',
    disclaimer: '结果只反映本次内部矩阵规则任务表现，不是 Raven、IQ、临床判断或人口常模。设计难度层级仅保留为研究描述字段，不作为参与者能力等级展示。',
  },
}

export const matrixRegistryEntryV11:CognitiveFrontendRegistryEntry={...matrixRegistryEntry,engineVersion:'1.1.0',scoringVersion:'1.0.0',readiness:{ category: 'fixed-trial', inputs: ['keyboard', 'pointer', 'touch'], orientation: 'any', globalKeyboardCapture: false, resumeDisposition: 'restart-required', resumeReason: '当前版本没有持久化练习或题内阶段；中断后按既有规则重新开始。', frozenMediaSlots: ['instruction', 'example', 'stimulus'] },reportDefinition:{...matrixRegistryEntry.reportDefinition,showProductIndex:false}}
