import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SemanticfluencyTask = deferredCognitiveRunner(() => import('./SemanticfluencyTask').then(module => module.SemanticfluencyTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const semanticfluencyRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'semanticfluency',
  name: '语义流畅性',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard'],
    orientation: 'any',
    globalKeyboardCapture: false,
    resumeDisposition: 'restart-required',
    resumeReason: '当前类别、计时与尚未保存的词语输入状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: SemanticfluencyTask, prepareRunner: SemanticfluencyTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'uniqueValidPerTrial', label: '每轮有效词数', displayType: 'number' },
    { key: 'intrusionRate', label: '侵入比例', displayType: 'percentage' },
    { key: 'duplicateRate', label: '重复比例', displayType: 'percentage' },
    { key: 'uniqueValidCount', label: '有效词总数', displayType: 'number' },
    { key: 'emptyTrialCount', label: '空轮次数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '语义流畅性表现',
    headlineMetric: 'uniqueValidPerTrial',
    summaryMetrics: ['intrusionRate', 'duplicateRate'],
    indexLabel: '流畅性指数',
    practicalTips: ['先想子类（家畜、鸟类、昆虫……），一类一类往外冒。', '想不起来时换个子类，别卡在一个词上。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
