import { FakeTask } from './FakeTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

/** Fake Test 前端注册条目：testType=fake，engineVersion=1.0.0（与后端 registry key 对齐）。 */
export const fakeRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'fake',
  name: 'Fake 测试',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: FakeTask,
  metricDefinitions: [
    { key: 'trialCount', label: '试次数', displayType: 'number' },
    { key: 'correctCount', label: '正确数', displayType: 'number' },
    { key: 'accuracy', label: '正确率', displayType: 'percentage' },
    { key: 'meanRtMs', label: '平均反应时', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: 'Fake 测试',
    headlineMetric: 'accuracy',
    summaryMetrics: ['accuracy', 'meanRtMs'],
    disclaimer: 'Fake 任务仅用于验证框架，不反映真实能力。',
  },
}
