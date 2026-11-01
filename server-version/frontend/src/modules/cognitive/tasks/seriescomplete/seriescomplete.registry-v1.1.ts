import { deferredCognitiveRunner } from '../../core/deferred-runner'
const SeriescompleteTaskV11 = deferredCognitiveRunner(() => import('./SeriescompleteTaskV11').then(module => module.SeriescompleteTaskV11))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const seriescompleteRegistryEntryV11: CognitiveFrontendRegistryEntry = {
  testType: 'seriescomplete',
  name: '数列完成',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: SeriescompleteTaskV11, prepareRunner: SeriescompleteTaskV11.prepare,
  completionMode: 'manual',
  readiness: { category: 'fixed-trial', inputs: ['keyboard','pointer','touch'], orientation: 'any',
    globalKeyboardCapture: true, resumeDisposition: 'restart-required',
    resumeReason: '练习及题内阶段未持久化，未封存的中断记录不能只按最大试次索引自动恢复。',
    frozenMediaSlots: ['instruction','example','stimulus'] },
  metricDefinitions: [
    { key: 'accuracy', label: '总体正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '数列完成表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '本次数列与字母序列正确率',
    practicalTips: ['先观察相邻变化，再检查你发现的规律是否适用于各项。', '字母题按A到Z的字母顺序判断；不作能力排名。'],
    disclaimer: '题目含数字与英文字母序列；题目分组未经难度标定，结果只描述本次作答，不是纯数字能力、诊断或排名。',
  },
}
