import { deferredCognitiveRunner } from '../../core/deferred-runner'
const CogestTaskV11 = deferredCognitiveRunner(() => import('./CogestTaskV11').then(module => module.CogestTaskV11))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const cogestRegistryEntryV11: CognitiveFrontendRegistryEntry = {
  testType: 'cogest',
  name: '认知估算',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  RunnerComponent: CogestTaskV11, prepareRunner: CogestTaskV11.prepare,
  completionMode: 'manual',
  readiness: { category: 'fixed-trial', inputs: ['keyboard','pointer','touch'], orientation: 'any',
    globalKeyboardCapture: true, resumeDisposition: 'restart-required',
    resumeReason: '练习及题内阶段未持久化，未封存的中断记录不能只按最大试次索引自动恢复。',
    frozenMediaSlots: ['instruction','example','stimulus'] },
  metricDefinitions: [
    { key: 'accuracy', label: '合理量级选中率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '正确作答中位用时', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'timeoutCount', label: '超时次数', displayType: 'number' },
    { key: 'validRtCount', label: '有效正确RT数', displayType: 'number' },
  ],
  reportDefinition: {
    showProductIndex: false,
    title: '认知估算表现',
    headlineMetric: 'accuracy',
    summaryMetrics: ['medianRtMs', 'errorCount'],
    indexLabel: '本次合理量级选中率',
    practicalTips: ['结合日常经验判断数量级。', '检查估计是否明显偏大或偏小，不作能力或同龄人排名。'],
    disclaimer: '仅描述本次数量级估算选择；受一般知识、生活经验和文化背景影响，不提供临床、智商或常模判断。',
  },
}
