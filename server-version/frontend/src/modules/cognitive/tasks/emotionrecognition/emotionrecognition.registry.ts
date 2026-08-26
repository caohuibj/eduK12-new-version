import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { EmotionrecognitionTask } from './EmotionrecognitionTask'

export const emotionrecognitionRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'emotionrecognition',
  name: '六类情绪面孔分类',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: EmotionrecognitionTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'accuracy', label: '总体分类正确率', displayType: 'percentage' },
    { key: 'balancedAccuracy', label: '六类平衡正确率', displayType: 'percentage' },
    { key: 'medianRtMs', label: '反应时中位数', unit: 'ms', displayType: 'ms' },
    { key: 'omissionRate', label: '遗漏比例', displayType: 'percentage' },
    { key: 'validResponseCount', label: '有效响应数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '六类情绪面孔分类',
    headlineMetric: 'balancedAccuracy',
    summaryMetrics: ['accuracy', 'balancedAccuracy', 'medianRtMs', 'omissionRate'],
    indexLabel: '任务表现指数',
    disclaimer: '结果只描述本次六类合成面孔分类表现，不是情绪能力、共情、人格、文化能力或临床判断。',
  },
}
