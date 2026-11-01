import { deferredCognitiveRunner } from '../../core/deferred-runner'
const PursuitrotorTask = deferredCognitiveRunner(() => import('./PursuitrotorTask').then(module => module.PursuitrotorTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const pursuitrotorRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'pursuitrotor',
  name: '追踪旋转',
  engineVersion: '1.0.1',
  readiness: {
    category: 'visuospatial',
    inputs: ['pointer'],
    orientation: 'any',
    globalKeyboardCapture: false,
    resumeDisposition: 'restart-required',
    resumeReason: '题内指针轨迹、目标累计时长与旋转计时状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: PursuitrotorTask, prepareRunner: PursuitrotorTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'onTargetRate', label: '在目标上时间比', displayType: 'percentage' },
    { key: 'totalTimeOnTargetMs', label: '累计在目标上时间', displayType: 'number' },
    { key: 'totalTrackMs', label: '累计追踪总时长', displayType: 'number' },
  ],
  reportDefinition: {
    title: '追踪旋转表现',
    headlineMetric: 'onTargetRate',
    summaryMetrics: ['totalTimeOnTargetMs'],
    indexLabel: '追踪协调指数',
    practicalTips: ['眼睛看着目标点的前方一点，不要盯着指针。', '手臂放松，用手腕而不是整条手臂来追踪。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
