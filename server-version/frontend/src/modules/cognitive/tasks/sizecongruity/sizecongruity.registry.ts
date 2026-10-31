import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SizecongruityTask = deferredCognitiveRunner(() => import('./SizecongruityTask').then(module => module.SizecongruityTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const sizecongruityRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'sizecongruity',
  name: '数量大小比较',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SizecongruityTask, prepareRunner: SizecongruityTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'sizeCongruityEffectMs', label: '数量一致性效应', unit: 'ms', displayType: 'ms' },
    { key: 'incongruentAccuracy', label: '不一致条件正确率', displayType: 'percentage' },
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'congruentAccuracy', label: '一致条件正确率', displayType: 'percentage' },
    { key: 'medianRtCongruent', label: '一致条件中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'medianRtIncongruent', label: '不一致条件中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validCongruentRtCount', label: '一致有效 RT 数', displayType: 'number' },
    { key: 'validIncongruentRtCount', label: '不一致有效 RT 数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '数量大小比较表现',
    headlineMetric: 'sizeCongruityEffectMs',
    summaryMetrics: ['medianRtCongruent', 'medianRtIncongruent', 'incongruentAccuracy'],
    indexLabel: '数量比较指数',
    practicalTips: ['只比较数值大小，忽略数字显示的大小；先确认规则再作答。', '当数字外观与数值打架时，稍作停顿反而更准。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
