import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SentencecheckTask = deferredCognitiveRunner(() => import('./SentencecheckTask').then(module => module.SentencecheckTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const sentencecheckRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'sentencecheck',
  name: '句图验证推理',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: SentencecheckTask, prepareRunner: SentencecheckTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'negationPenaltyMs', label: '否定句代价', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '句图验证推理表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'negationPenaltyMs'],
    indexLabel: '句图核对指数',
    practicalTips: ['先弄清句子说的是形状还是颜色，再核对图片。', '遇到“不是”先转换成“它是什么”，再比较。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
