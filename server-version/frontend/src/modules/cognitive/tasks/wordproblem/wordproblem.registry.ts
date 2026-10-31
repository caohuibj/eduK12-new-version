import { deferredCognitiveRunner } from '../../core/deferred-runner'
const WordproblemTask = deferredCognitiveRunner(() => import('./WordproblemTask').then(module => module.WordproblemTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const wordproblemRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'wordproblem',
  name: '应用题推理',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: WordproblemTask, prepareRunner: WordproblemTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '应用题推理表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '应用题指数',
    practicalTips: ['先读懂题目条件，再列式计算；算完检查一遍单位。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}

export const wordproblemRegistryEntryV2: CognitiveFrontendRegistryEntry={...wordproblemRegistryEntry,engineVersion:'2.0.0',scoringVersion:'2.0.0',reportDefinition:{...wordproblemRegistryEntry.reportDefinition,indexLabel:'本次答对比例',disclaimer:'仅描述本次试点任务，不提供常模、排名、诊断或已验证的能力结论。'}}
