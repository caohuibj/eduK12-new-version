import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition } from './cognitive.types'
import type { CognitiveReference } from './reference'
import type { FrozenReportSnapshot } from './profile-freeze'
import { getCognitiveRegistryEntry } from './cognitive.registry'

export interface CognitiveReportMetricView {
  key: string
  label: string
  unit?: string
  value: unknown
  formatted: string
}

export interface CognitiveSingleTaskReport {
  testType: string
  profile: CognitiveProfile | null
  profileLabel: string | null
  title: string
  interpretable: boolean
  qualityState: 'interpretable' | 'insufficient'
  qualityFlags: Array<{ key: string; label: string; active: boolean }>
  headline: CognitiveReportMetricView | null
  productIndex: { label: '任务表现指数'; value: number } | null
  primaryMetrics: CognitiveReportMetricView[]
  secondaryMetrics: CognitiveReportMetricView[]
  caveats: string[]
  practicalTips: string[]
  method: {
    testType: string
    engineVersion: string
    scoringVersion: string
    configVersion: string
    profile: CognitiveProfile | null
  }
  disclaimer: string
  reference: CognitiveReference | null
}

const profileLabelOf = (profile: CognitiveProfile | null): string | null => {
  if (profile === 'experience') return '体验版'
  if (profile === 'research') return '科研版'
  if (profile === 'standard') return '正式版'
  return null
}

const formatMetric = (definition: Pick<MetricDefinition, 'unit'> | undefined, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  if (definition?.unit === 'ratio') return `${Math.round(number * 100)}%`
  if (definition?.unit === 'ms') return `${Math.round(number)} ms`
  return String(Math.round(number * 100) / 100)
}

const metricView = (
  key: string,
  metrics: Record<string, unknown>,
  definitions: Record<string, MetricDefinition>,
): CognitiveReportMetricView => {
  const definition = definitions[key]
  return {
    key,
    label: definition?.label ?? key,
    unit: definition?.unit,
    value: metrics[key],
    formatted: formatMetric(definition, metrics[key]),
  }
}

const registryCompatReport = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
}): FrozenReportSnapshot | null => {
  const entry = getCognitiveRegistryEntry(input.testType, input.engineVersion, input.scoringVersion)
  if (!entry) return null
  return {
    profile: 'standard',
    profileDefinitionVersion: entry.profileDefinitionVersion,
    metricDefinitionVersion: entry.metricDefinitionVersion,
    qualityDefinitionVersion: entry.qualityDefinitionVersion,
    reportDefinitionVersion: entry.reportDefinitionVersion,
    reportCaveats: [],
    metricDefinitions: entry.metricDefinitions,
    qualityDefinitions: entry.qualityDefinitions,
    reportDefinition: entry.reportDefinition,
  }
}

export const buildCognitiveSingleTaskReport = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  configVersion: string
  profile: CognitiveProfile | null
  frozenReport: FrozenReportSnapshot | null
  score: number
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
  reference: CognitiveReference | null | undefined
}): CognitiveSingleTaskReport | null => {
  const frozen = input.frozenReport ?? registryCompatReport(input)
  if (!frozen) return null
  const reportDefinition: SingleTaskReportDefinition | undefined = frozen.reportDefinition
  const metricDefinitions: Record<string, MetricDefinition> = frozen.metricDefinitions ?? {}
  const qualityDefinitions: Record<string, QualityDefinition> = frozen.qualityDefinitions ?? {}
  const interpretable = input.qualityFlags.interpretable !== false
  const primaryKeys = reportDefinition?.primaryMetrics ?? []
  const secondaryKeys = reportDefinition?.secondaryMetrics ?? []
  const headlineKey = reportDefinition?.headlineMetric || primaryKeys[0]
  const qualityFlags = Object.entries(input.qualityFlags)
    .filter(([key]) => key !== 'interpretable')
    .map(([key, value]) => ({
      key,
      label: qualityDefinitions[key]?.label ?? key,
      active: value === true,
    }))
  const hiddenReference = !interpretable || !input.reference || input.reference.mode === 'none'
    ? null
    : input.reference

  return {
    testType: input.testType,
    profile: input.profile,
    profileLabel: profileLabelOf(input.profile),
    title: reportDefinition?.title ?? input.testType,
    interpretable,
    qualityState: interpretable ? 'interpretable' : 'insufficient',
    qualityFlags,
    headline: interpretable && headlineKey ? metricView(headlineKey, input.metrics, metricDefinitions) : null,
    productIndex: interpretable ? { label: '任务表现指数', value: input.score } : null,
    primaryMetrics: primaryKeys.map((key) => metricView(key, input.metrics, metricDefinitions)),
    secondaryMetrics: secondaryKeys.map((key) => metricView(key, input.metrics, metricDefinitions)),
    caveats: input.frozenReport?.reportCaveats ?? frozen.reportCaveats ?? [],
    practicalTips: reportDefinition?.practicalTips ?? [],
    method: {
      testType: input.testType,
      engineVersion: input.engineVersion,
      scoringVersion: input.scoringVersion,
      configVersion: input.configVersion,
      profile: input.profile,
    },
    disclaimer: reportDefinition?.disclaimer ?? '结果反映本次任务表现，不是医学诊断或人口常模。',
    reference: hiddenReference,
  }
}
