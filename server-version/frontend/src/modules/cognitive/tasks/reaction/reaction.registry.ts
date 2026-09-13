import { createElement } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { usesSoftwareFrameTiming } from '../../core/timing'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { ReactionFrameTask } from './ReactionFrameTask'
import { ReactionTask } from './ReactionTask'

const ReactionRunner = (props: CognitiveTaskProps) => createElement(
  usesSoftwareFrameTiming(props.taskContext) ? ReactionFrameTask : ReactionTask,
  props,
)

/** Reaction Test 前端注册条目：testType=reaction，engineVersion=1.0.0（与后端 registry key 对齐）。 */
export const reactionRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'reaction',
  name: '反应速度',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: ReactionRunner,
  metricDefinitions: [
    { key: 'medianRtMs', label: '中位反应时', unit: 'ms', displayType: 'ms' },
    { key: 'meanRtMs', label: '平均反应时', unit: 'ms', displayType: 'ms' },
    { key: 'rtICV', label: '反应稳定性', displayType: 'number' },
    { key: 'fastestRtMs', label: '最快反应时', unit: 'ms', displayType: 'ms' },
    { key: 'missRate', label: '漏答率', displayType: 'percentage' },
    { key: 'prematureCount', label: '过早响应', displayType: 'number' },
    { key: 'validTrialCount', label: '有效试次', displayType: 'number' },
  ],
  reportDefinition: {
    title: '反应速度',
    headlineMetric: 'medianRtMs',
    summaryMetrics: ['medianRtMs', 'missRate'],
    indexLabel: '反应表现指数',
    practicalTips: ['在需要快速响应时先减少外部干扰。', '比较多次结果时尽量使用相近设备和作答方式。'],
    disclaimer: '结果反映本次任务表现，不代表诊断或正式能力评估。',
  },
}
