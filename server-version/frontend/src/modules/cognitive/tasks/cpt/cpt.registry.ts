import { createElement } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { usesSoftwareFrameTiming } from '../../core/timing'
import type { CognitiveFrontendRegistryEntry } from '../../registry'
import { CptFrameTask } from './CptFrameTask'
import { CptTask } from './CptTask'

const CptRunner = (props: CognitiveTaskProps) => createElement(
  usesSoftwareFrameTiming(props.taskContext) ? CptFrameTask : CptTask,
  props,
)

export const cptRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'cpt',
  name: '连续执行任务',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  RunnerComponent: CptRunner,
  metricDefinitions: [
    { key: 'dPrime', label: 'd′', displayType: 'number' },
    { key: 'omissionRate', label: '遗漏率', displayType: 'percentage' },
    { key: 'commissionRate', label: '误报率', displayType: 'percentage' },
    { key: 'rtICV', label: '反应稳定性', displayType: 'number' },
  ],
  reportDefinition: {
    title: '连续执行任务 CPT-X',
    headlineMetric: 'dPrime',
    summaryMetrics: ['dPrime', 'omissionRate', 'commissionRate', 'rtICV'],
    indexLabel: '任务表现指数',
    disclaimer: '结果反映本次持续注意任务表现，不是临床诊断或常模。',
  },
}
