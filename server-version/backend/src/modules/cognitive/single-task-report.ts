import type { CognitiveProfile, MetricDefinition, QualityDefinition, SingleTaskReportDefinition } from './cognitive.types'
import type { CognitiveReference } from './reference'
import type { FrozenReportSnapshot } from './profile-freeze'
import { getCognitiveRegistryEntry } from './cognitive.registry'
import { resolveLegacyCognitiveProtocolPresentation } from './legacy-protocol-presentation'
import { legacyExperienceHeadline, legacySuppressTips } from './legacy-report-policy'
import type { CognitiveParticipantPresentationV1 } from './participant-presentation.types'

export interface CognitiveReportMetricView {
  presentationVersion?: string
  participantLabel?: string
  explanation?: string
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
  interpretationSummary: string | null
  headline: CognitiveReportMetricView | null
  productIndex: { label: '任务表现指数'; value: number } | null
  showProductIndex: boolean
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

const formatMapValue = (metricKey: string, value: unknown): string => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (/rate/i.test(metricKey)) return `${Math.round(number * 100)}%`
  if (/rt/i.test(metricKey)) return `${Math.round(number)} ms`
  return String(Math.round(number * 100) / 100)
}

const formatMetric = (key: string, definition: Pick<MetricDefinition, 'unit'> | undefined, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (definition?.unit === 'map') {
    if (typeof value !== 'object' || Array.isArray(value)) return '—'
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([nLevel, item]) => `${nLevel}-back：${formatMapValue(key, item)}`)
    return entries.length > 0 ? entries.join('；') : '—'
  }
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
  presentation?: CognitiveParticipantPresentationV1,
): CognitiveReportMetricView => {
  const definition = definitions[key]
  return {
    key,
    ...(presentation ? { presentationVersion: presentation.presentationVersion, participantLabel: presentation.metrics[key]?.label ?? definition?.label ?? key, explanation: presentation.metrics[key]?.singleExplanation } : {}),
    label: definition?.label ?? key,
    unit: definition?.unit,
    value: metrics[key],
    formatted: formatMetric(key, definition, metrics[key]),
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
    randomizationAlgorithmVersion: entry.randomizationAlgorithmVersion,
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

const resolveHeadlineKey = (
  testType: string,
  profile: CognitiveProfile | null,
  reportDefinition: SingleTaskReportDefinition | undefined,
  primaryKeys: string[],
  metricDefinitions: Record<string, MetricDefinition>,
  presentation?: CognitiveParticipantPresentationV1,
): string | undefined => {
  const profileHeadline = profile === 'experience' ? (presentation ? presentation.experienceHeadline : legacyExperienceHeadline(testType)) : undefined
  if (profileHeadline && metricDefinitions[profileHeadline]) return profileHeadline
  return reportDefinition?.headlineMetric || primaryKeys[0]
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
  // For newly frozen assignments, participant-facing protocol wording is read
  // from the immutable snapshot. Historical formats use a fixed legacy adapter.
  const presentation = frozen.presentationVersion ? frozen.participantPresentation : undefined
  if (frozen.presentationVersion && !presentation) throw new Error('COG_PRESENTATION_SNAPSHOT_INVALID')
  const protocolPresentation = presentation
    ? (input.profile ? presentation.protocols[input.profile] ?? null : null)
    : resolveLegacyCognitiveProtocolPresentation({
    testType: input.testType,
    engineVersion: input.engineVersion,
    scoringVersion: input.scoringVersion,
    profile: input.profile,
  })
  const interpretable = input.qualityFlags.interpretable !== false
  const metricVisible = (key: string) => {
    if (presentation?.singleHiddenMetrics.includes(key)) return false
    const definition = metricDefinitions[key]
    if (!definition) return true
    if (!input.profile || !definition.availableProfiles) return true
    return definition.availableProfiles.includes(input.profile)
  }
  const primaryKeys = (reportDefinition?.primaryMetrics ?? []).filter(metricVisible)
  const secondaryKeys = (reportDefinition?.secondaryMetrics ?? []).filter(metricVisible)
  const headlineKey = resolveHeadlineKey(
    input.testType,
    input.profile,
    reportDefinition,
    primaryKeys,
    metricDefinitions,
    presentation,
  )
  const showProductIndex = input.frozenReport?.protocolShowProductIndex
    ?? protocolPresentation?.showProductIndex
    ?? (reportDefinition?.showProductIndex !== false)
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
    profileLabel: input.frozenReport?.profileLabel
      ?? protocolPresentation?.profileLabel
      ?? profileLabelOf(input.profile),
    title: presentation?.title ?? reportDefinition?.title ?? input.testType,
    interpretable,
    qualityState: interpretable ? 'interpretable' : 'insufficient',
    qualityFlags,
    interpretationSummary: interpretable
      ? input.frozenReport?.participantConclusion ?? protocolPresentation?.participantConclusion ?? null
      : null,
    headline: interpretable && headlineKey && metricVisible(headlineKey) ? metricView(headlineKey, input.metrics, metricDefinitions, presentation) : null,
    productIndex: showProductIndex && interpretable ? { label: '任务表现指数', value: input.score } : null,
    showProductIndex,
    primaryMetrics: interpretable ? primaryKeys.map((key) => metricView(key, input.metrics, metricDefinitions, presentation)) : [],
    secondaryMetrics: interpretable ? secondaryKeys.map((key) => metricView(key, input.metrics, metricDefinitions, presentation)) : [],
    caveats: input.frozenReport?.reportCaveats
      ?? protocolPresentation?.reportCaveats
      ?? frozen.reportCaveats
      ?? [],
    practicalTips: (presentation ? presentation.suppressTips : legacySuppressTips(input.testType)) ? [] : presentation?.practicalTips ?? reportDefinition?.practicalTips ?? [],
    method: {
      testType: input.testType,
      engineVersion: input.engineVersion,
      scoringVersion: input.scoringVersion,
      configVersion: input.configVersion,
      profile: input.profile,
    },
    disclaimer: presentation?.disclaimer ?? reportDefinition?.disclaimer ?? '结果反映本次任务表现，不是医学诊断或人口常模。',
    reference: hiddenReference,
  }
}
