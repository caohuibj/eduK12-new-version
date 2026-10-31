import { deferredCognitiveRunner } from '../../core/deferred-runner'
const UfovTask = deferredCognitiveRunner(() => import('./UfovTask').then(module => module.UfovTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const ufovRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'ufov',
  name: '有用视野',
  engineVersion: '1.0.1',
  readiness: {
    category: 'visuospatial',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '刺激呈现与中心/周边两阶段作答状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: UfovTask, prepareRunner: UfovTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'dualCorrectRate', label: '双重正确率', displayType: 'percentage' },
    { key: 'centralAccuracy', label: '中心判别正确率', displayType: 'percentage' },
    { key: 'peripheralAccuracy', label: '周边定位正确率', displayType: 'percentage' },
    { key: 'dualCorrectCount', label: '双重正确数', displayType: 'number' },
    { key: 'medianRtMs', label: '有效作答用时中位数', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: '有用视野表现',
    headlineMetric: 'dualCorrectRate',
    summaryMetrics: ['centralAccuracy', 'peripheralAccuracy'],
    indexLabel: '分配注意指数',
    practicalTips: ['眼睛盯住中心图形，余光注意周边亮点。', '先答中心的，再点周边的，两题都别漏。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
