import { deferredCognitiveRunner } from '../../core/deferred-runner'
const MazeTask = deferredCognitiveRunner(() => import('./MazeTask').then(module => module.MazeTask))
import type { CognitiveFrontendRegistryEntry } from '../../registry'

export const mazeRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'maze',
  name: '迷宫学习',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: MazeTask, prepareRunner: MazeTask.prepare,
  completionMode: 'task',
  metricDefinitions: [
    { key: 'pathEfficiency', label: '路径效率', displayType: 'percentage' },
    { key: 'completedCount', label: '完成迷宫数', displayType: 'number' },
    { key: 'totalDeadEnds', label: '累计死路次数', displayType: 'number' },
    { key: 'medianCompletionTimeMs', label: '完成用时中位数', displayType: 'number' },
  ],
  reportDefinition: {
    title: '迷宫学习表现',
    headlineMetric: 'pathEfficiency',
    summaryMetrics: ['completedCount', 'totalDeadEnds'],
    indexLabel: '空间导航指数',
    practicalTips: ['先记住整体方向（目标是右下角），再选择具体路线。', '进入死路时尽快回头，不要反复尝试同一方向。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
