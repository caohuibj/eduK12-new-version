import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { PicturesequenceTask } from './PicturesequenceTask'

export const picturesequenceRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'picturesequence', name: '图片序列学习', engineVersion: '1.0.0', scoringVersion: '1.0.0', RunnerComponent: PicturesequenceTask, completionMode: 'task',
  metricDefinitions: [
    { key: 'adjacentPairScore', label: '相邻顺序得分', displayType: 'percentage' },
    { key: 'positionScore', label: '位置得分', displayType: 'percentage' },
    { key: 'learningGain', label: '学习增益', displayType: 'percentage' },
    { key: 'delayedRetention', label: '延迟保持变化', displayType: 'percentage' },
  ],
  reportDefinition: { title: '图片序列学习', headlineMetric: 'adjacentPairScore', summaryMetrics: ['adjacentPairScore', 'positionScore', 'learningGain', 'delayedRetention'], indexLabel: '任务表现指数', disclaimer: '使用内部自制场景刺激，不等同 NIH PSM、临床诊断或人口常模。' },
}
