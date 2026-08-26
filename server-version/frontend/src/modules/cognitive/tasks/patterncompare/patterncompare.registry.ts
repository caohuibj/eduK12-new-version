import { PatterncompareTask } from './PatterncompareTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const patterncompareRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'patterncompare',
  name: '图形模式比较',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: PatterncompareTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'correctPerMinute', label: '每分钟正确数', displayType: 'number' },
    { key: 'accuracy', label: '准确率', displayType: 'percentage' },
    { key: 'medianCorrectRtMs', label: '正确反应中位RT', unit: 'ms', displayType: 'ms' },
    { key: 'lapseRate', label: '未反应比例', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: '图形模式比较',
    headlineMetric: 'correctPerMinute',
    summaryMetrics: ['correctPerMinute', 'accuracy', 'medianCorrectRtMs', 'lapseRate'],
    indexLabel: '任务表现指数',
    disclaimer: '结果来自内部自制几何刺激，只反映本次任务表现，不是 NIH Toolbox 分数、临床诊断或人口常模。',
  },
}
