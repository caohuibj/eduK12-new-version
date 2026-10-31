import { deferredCognitiveRunner } from '../../core/deferred-runner'
const LogicdeduceTask = deferredCognitiveRunner(() => import('./LogicdeduceTask').then(module => module.LogicdeduceTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const logicdeduceRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'logicdeduce',
  name: '多条件逻辑推断',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: LogicdeduceTask, prepareRunner: LogicdeduceTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '多条件逻辑推断表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '逻辑推理指数',
    practicalTips: ['把题目给出的条件一条条列出来，再逐步推导。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}

export const logicdeduceRegistryEntryV2: CognitiveFrontendRegistryEntry={...logicdeduceRegistryEntry, completionMode: 'manual',
 readiness: { category: 'fixed-trial', inputs: ['keyboard','pointer','touch'], orientation: 'any',
 globalKeyboardCapture: true, resumeDisposition: 'restart-required',
 resumeReason: '练习及题内阶段未持久化，未封存的中断记录不能只按最大试次索引自动恢复。',
 frozenMediaSlots: ['instruction','example','stimulus'] },engineVersion:'2.0.0',scoringVersion:'2.0.0',reportDefinition:{...logicdeduceRegistryEntry.reportDefinition,showProductIndex:false,indexLabel:'本次答对比例',disclaimer:'仅描述本次试点任务，不提供常模、排名、诊断或已验证的能力结论。'}}
