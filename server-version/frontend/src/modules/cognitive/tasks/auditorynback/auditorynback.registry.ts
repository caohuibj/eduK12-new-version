import { deferredCognitiveRunner } from '../../core/deferred-runner'
const AuditorynbackTask = deferredCognitiveRunner(() => import('./AuditorynbackTask').then(module => module.AuditorynbackTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const auditorynbackRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'auditorynback',
  name: '听觉 n-back 工作记忆',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '已播放音序列、练习与当前音频/响应阶段未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: AuditorynbackTask, prepareRunner: AuditorynbackTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'dPrime', label: '听觉 n-back d′', displayType: 'number' },
    { key: 'hitRate', label: '匹配命中率', displayType: 'percentage' },
    { key: 'falseAlarmRate', label: '非匹配误报率', displayType: 'percentage' },
    { key: 'medianHitRtMs', label: '命中中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'matchCount', label: '匹配试次数', displayType: 'number' },
    { key: 'nonmatchCount', label: '非匹配试次数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '听觉工作记忆表现',
    headlineMetric: 'dPrime',
    summaryMetrics: ['hitRate', 'falseAlarmRate'],
    indexLabel: '听觉工作记忆指数',
    practicalTips: ['在心里轻轻记住最近两个音，新音响起时和「往前第二个」比较。', '不要把整段旋律都记住，只追踪滑动窗口内的两个音。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
