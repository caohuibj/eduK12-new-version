import { createElement } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { usesSoftwareFrameTiming } from '../../core/timing'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { GonogoFrameTask } from './GonogoFrameTask'
import { GonogoTask } from './GonogoTask'

const GonogoRunner = (props: CognitiveTaskProps) => createElement(
  usesSoftwareFrameTiming(props.taskContext) ? GonogoFrameTask : GonogoTask,
  props,
)

export const gonogoRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'gonogo',
  name: 'Go/No-Go',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: GonogoRunner,
  metricDefinitions: [
    { key: 'commissionRate', label: 'No-Go 误按率', displayType: 'percentage' },
    { key: 'dPrime', label: 'd′', displayType: 'number' },
    { key: 'goMedianRtMs', label: 'Go 中位反应时', unit: 'ms', displayType: 'ms' },
  ],
  reportDefinition: {
    title: 'Go/No-Go',
    headlineMetric: 'commissionRate',
    summaryMetrics: ['commissionRate', 'dPrime'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次反应抑制任务表现，不是临床诊断或常模。',
  },
}
