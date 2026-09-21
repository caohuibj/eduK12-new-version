import type { CognitiveTaskProps } from './core/runner.types'
import { COGNITIVE_RUNNER_ENTRIES } from './generated/runners.generated'

export interface MetricDefinition {
  key: string
  label: string
  unit?: string
  displayType: 'number' | 'percentage' | 'ms' | 'text'
}

export interface ReportDefinition {
  title: string
  headlineMetric: string
  summaryMetrics: string[]
  indexLabel?: string
  showProductIndex?: boolean
  practicalTips?: string[]
  disclaimer?: string
}

export interface CognitiveFrontendRegistryEntry {
  testType: string
  name: string
  engineVersion: string
  scoringVersion: string
  RunnerComponent: React.ComponentType<CognitiveTaskProps>
  metricDefinitions: MetricDefinition[]
  reportDefinition: ReportDefinition
  completionMode?: 'manual' | 'task'
}

const REGISTRY = new Map<string, CognitiveFrontendRegistryEntry>()
const keyOf = (testType: string, engineVersion: string) => `${testType}/${engineVersion}`

export const registerCognitiveRunner = (entry: CognitiveFrontendRegistryEntry): void => {
  const key = keyOf(entry.testType, entry.engineVersion)
  if (REGISTRY.has(key)) throw new Error(`Cognitive frontend registry duplicate key: ${key}`)
  REGISTRY.set(key, entry)
}

for (const entry of COGNITIVE_RUNNER_ENTRIES) registerCognitiveRunner(entry)

export const resolveRunner = (
  testType: string,
  engineVersion: string,
): CognitiveFrontendRegistryEntry | undefined => REGISTRY.get(keyOf(testType, engineVersion))
