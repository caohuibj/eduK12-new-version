import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SymbolmatchTask = deferredCognitiveRunner(() => import('./SymbolmatchTask').then(module => module.SymbolmatchTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const symbolmatchRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'symbolmatch',
  name: '符号数字配对',
  engineVersion: '1.0.1',
  readiness: {
    category: 'timed-response',
    inputs: ['keyboard', 'pointer', 'touch'],
    orientation: 'any',
    globalKeyboardCapture: true,
    resumeDisposition: 'restart-required',
    resumeReason: '练习阶段与当前符号映射/响应计时状态未独立持久化。',
    frozenMediaSlots: ['instruction', 'example', 'stimulus'],
  },
  scoringVersion: '1.0.0',
  RunnerComponent: SymbolmatchTask, prepareRunner: SymbolmatchTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '符号数字配对表现',
    headlineMetric: 'medianRtMs',
    summaryMetrics: ['accuracy', 'errorCount'],
    indexLabel: '配对速度指数',
    practicalTips: ['可以先熟悉图例中各配对的位置；作答时按需要查表，不必强记。', '每题只记录第一次选择。回想是否有看错符号或按错数字，下次先核对配对，再作答。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
