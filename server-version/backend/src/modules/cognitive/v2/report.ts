import type {
  CognitiveProfile,
  CognitiveScoreResult,
  MetricDefinition,
  QualityDefinition,
  ReportDefinition,
  QualityState,
} from './types'

export interface ReportMetricView {
  key: string
  label: string
  category: string
  direction: MetricDefinition['direction']
  unit: MetricDefinition['unit']
  value: unknown
  formatted: string
}

export interface ThreeLayerReport {
  title: string
  qualityState: QualityState
  conclusion: string
  headline: ReportMetricView[]
  user: ReportMetricView[]
  detail: ReportMetricView[]
  quality: Array<{ key: string; label: string; active: boolean; effect: QualityDefinition['effect'] }>
  method: {
    testType: string
    engineVersion: string
    scoringVersion: string
    configVersion: string
    protocolSignature: string
    profile: CognitiveProfile | null
  }
  disclaimer: string
  practicalTips: string[]
}

const formatMetric = (definition: MetricDefinition, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (definition.valueType === 'object' || definition.valueType === 'array') return JSON.stringify(value)
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  const rounded = definition.precision === undefined
    ? number
    : Number(number.toFixed(definition.precision))
  if (definition.unit === 'ratio') return `${Math.round(number * 100)}%`
  if (definition.unit === 'ms') return `${Math.round(number)} ms`
  return String(rounded)
}

const metricView = (
  key: string,
  metrics: Record<string, unknown>,
  definitions: Record<string, MetricDefinition>,
): ReportMetricView => {
  const definition = definitions[key]
  if (!definition) throw new Error(`Report references unknown metric: ${key}`)
  return {
    key,
    label: definition.label,
    category: definition.category,
    direction: definition.direction,
    unit: definition.unit,
    value: metrics[key],
    formatted: formatMetric(definition, metrics[key]),
  }
}

const visibleForProfile = (definition: MetricDefinition, profile: CognitiveProfile | null): boolean =>
  !profile || definition.availableProfiles.includes(profile)

const projectKeys = (
  keys: string[],
  visibility: MetricDefinition['visibility'],
  definitions: Record<string, MetricDefinition>,
  profile: CognitiveProfile | null,
): string[] => keys.filter((key) => {
  const definition = definitions[key]
  return Boolean(definition && definition.visibility === visibility && visibleForProfile(definition, profile))
})

const conclusionFor = (state: QualityState): string => {
  if (state === 'invalid') return '本次数据未达到可解释条件，暂不提供表现结论。'
  if (state === 'limited') return '本次结果存在质量限制，请结合展开详情谨慎阅读。'
  return '以下结果描述本次任务中的表现，不等同于诊断或正式人口常模。'
}

export const projectThreeLayerReport = (input: {
  testType: string
  configVersion: string
  protocolSignature: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
  definition: ReportDefinition
  metrics: Record<string, unknown>
  score: CognitiveScoreResult
  metricDefinitions: Record<string, MetricDefinition>
  qualityDefinitions: Record<string, QualityDefinition>
}): ThreeLayerReport => {
  const qualityEntries = Object.entries(input.score.quality.flags).map(([key, active]) => ({
    key,
    label: input.qualityDefinitions[key]?.label ?? key,
    active,
    effect: input.qualityDefinitions[key]?.effect ?? 'limited',
  }))
  const headlineKeys = projectKeys(input.definition.headlineMetrics, 'headline', input.metricDefinitions, input.profile)
  const userKeys = projectKeys(input.definition.userMetrics, 'user', input.metricDefinitions, input.profile)
  const detailKeys = projectKeys(input.definition.detailMetrics, 'detail', input.metricDefinitions, input.profile)
  return {
    title: input.definition.title,
    qualityState: input.score.quality.state,
    conclusion: conclusionFor(input.score.quality.state),
    headline: input.score.quality.state === 'invalid'
      ? []
      : headlineKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    user: input.score.quality.state === 'invalid'
      ? []
      : userKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    detail: input.score.quality.state === 'invalid'
      ? []
      : detailKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    quality: qualityEntries,
    method: {
      testType: input.testType,
      engineVersion: input.engineVersion,
      scoringVersion: input.scoringVersion,
      configVersion: input.configVersion,
      protocolSignature: input.protocolSignature,
      profile: input.profile,
    },
    disclaimer: input.definition.disclaimer,
    practicalTips: input.definition.practicalTips,
  }
}
