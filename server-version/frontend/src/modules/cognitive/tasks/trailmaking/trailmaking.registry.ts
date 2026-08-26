import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { TrailmakingTask } from './TrailmakingTask'

export const trailmakingRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'trailmaking',
  name: 'Trail Making 视觉搜索与切换',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: TrailmakingTask,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'completionTimeMs', label: '累计正确步骤时长', unit: 'ms', displayType: 'ms' },
    { key: 'partACompletionTimeMs', label: 'A 部分累计正确步骤时长', unit: 'ms', displayType: 'ms' },
    { key: 'partBCompletionTimeMs', label: 'B 部分累计正确步骤时长', unit: 'ms', displayType: 'ms' },
    { key: 'setShiftCostMs', label: '规则切换代价', unit: 'ms', displayType: 'ms' },
    { key: 'errorCount', label: '错误次数', displayType: 'number' },
    { key: 'errorRate', label: '错误率', displayType: 'percentage' },
    { key: 'meanCorrectStepTimeMs', label: '平均正确步骤时间', unit: 'ms', displayType: 'ms' },
    { key: 'completedStepCount', label: '完成步骤数', displayType: 'number' },
    { key: 'omissionRate', label: '遗漏率', displayType: 'percentage' },
  ],
  reportDefinition: {
    title: 'Trail Making 视觉搜索与切换',
    headlineMetric: 'completionTimeMs',
    summaryMetrics: ['completionTimeMs', 'partACompletionTimeMs', 'partBCompletionTimeMs', 'setShiftCostMs'],
    indexLabel: '任务表现指数',
    disclaimer: '累计正确步骤时长只累计在时限内完成的正确步骤，会受到动作速度、设备和指针方式影响；它不是端到端用时。本任务不进行设备常模校正，也不作 motor 能力结论。',
  },
}
