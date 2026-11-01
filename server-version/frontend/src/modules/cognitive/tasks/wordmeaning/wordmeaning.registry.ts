import { deferredCognitiveRunner } from '../../core/deferred-runner'
const WordmeaningTask = deferredCognitiveRunner(() => import('./WordmeaningTask').then(module => module.WordmeaningTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const wordmeaningRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'wordmeaning',
  name: '词汇理解',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: WordmeaningTask, prepareRunner: WordmeaningTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '词汇理解表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '词义掌握指数',
    practicalTips: ['把词语放进句子里想一想，再对照选项。', '四个选项都读一遍，排除关系不符的。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}

const ReviewedRunner = deferredCognitiveRunner(() => import('./WordmeaningTaskV11').then(module => module.WordmeaningTaskV11))
export const wordmeaningRegistryEntryV11: CognitiveFrontendRegistryEntry = {

 ...wordmeaningRegistryEntry, completionMode: 'manual',
 readiness: { category: 'fixed-trial', inputs: ['keyboard','pointer','touch'], orientation: 'any',
 globalKeyboardCapture: true, resumeDisposition: 'restart-required',
 resumeReason: '练习及题内阶段未持久化，未封存的中断记录不能只按最大试次索引自动恢复。',
 frozenMediaSlots: ['instruction','example','stimulus'] }, engineVersion: '1.1.0', scoringVersion: '1.1.0',
 RunnerComponent: ReviewedRunner, prepareRunner: ReviewedRunner.prepare,
 reportDefinition: { ...wordmeaningRegistryEntry.reportDefinition, showProductIndex: false, practicalTips: ['把不熟悉的词放进句子，用自己的话解释。', '区分同义与仅仅相关的意思；报告只描述本次词义选择。'] },
}
