import type {
  CognitiveProfile,
  CognitiveScoreResult,
  MetricDefinition,
  QualityDefinition,
  ReportDefinition,
  QualityState,
} from './types'
import { metricIsQualityGated } from './quality'

export interface ReportMetricView {
  key: string
  label: string
  description: string
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
  research: ReportMetricView[]
  caveats: string[]
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

const formatMapValue = (metricKey: string, value: unknown): string => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (/rate/i.test(metricKey)) return `${Math.round(number * 100)}%`
  if (/rt/i.test(metricKey)) return `${Math.round(number)} ms`
  return String(Math.round(number * 100) / 100)
}

const formatMetric = (definition: MetricDefinition, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (definition.valueType === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return '—'
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([level, item]) => `${level}-back：${formatMapValue(definition.key, item)}`)
    return entries.length > 0 ? entries.join('；') : '—'
  }
  if (definition.valueType === 'array') return JSON.stringify(value)
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  const rounded = definition.precision === undefined
    ? number
    : Number(number.toFixed(definition.precision))
  if (definition.unit === 'ratio') return `${Math.round(number * 100)}%`
  if (definition.unit === 'ms') return `${Math.round(number)} ms`
  return String(rounded)
}

const participantMetricDescription = (definition: MetricDefinition): string => {
  const declared = definition.description?.trim()
  if (declared && declared !== definition.label) return declared
  if (definition.direction === 'higher_is_better') {
    return `${definition.label}用于描述本次任务表现；在其他条件相近且数据质量可接受时，数值较高通常表示该指标表现较高。`
  }
  if (definition.direction === 'lower_is_better') {
    return `${definition.label}用于描述本次任务表现；在其他条件相近且数据质量可接受时，数值较低通常表示该指标表现较好。`
  }
  if (definition.direction === 'target_range') {
    return `${definition.label}用于检查结果是否处在该任务预期的可解释范围，应结合数据质量和其他指标共同阅读。`
  }
  if (definition.direction === 'signed') {
    return `${definition.label}表示条件或负荷之间差异的方向与大小，应结合相关准确率、反应时和任务结构共同阅读。`
  }
  return `${definition.label}是本次任务的描述性观察值，不应单独解释为能力高低或常模位置。`
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
    description: participantMetricDescription(definition),
    category: definition.category,
    direction: definition.direction,
    unit: definition.unit,
    value: metrics[key],
    formatted: formatMetric(definition, metrics[key]),
  }
}

const visibleForProfile = (definition: MetricDefinition, profile: CognitiveProfile | null): boolean =>
  !profile || definition.availableProfiles.includes(profile)

const eligibleMetric = (
  key: string,
  definitions: Record<string, MetricDefinition>,
  profile: CognitiveProfile | null,
  quality: Pick<CognitiveScoreResult['quality'], 'flags'>,
): boolean => {
  const definition = definitions[key]
  return Boolean(
    definition
      && visibleForProfile(definition, profile)
      && !metricIsQualityGated(definition, quality),
  )
}

const projectKeys = (
  keys: string[],
  visibility: MetricDefinition['visibility'],
  definitions: Record<string, MetricDefinition>,
  profile: CognitiveProfile | null,
  quality: Pick<CognitiveScoreResult['quality'], 'flags'>,
): string[] => keys.filter((key) => {
  const definition = definitions[key]
  return Boolean(
    definition
      && definition.visibility === visibility
      && eligibleMetric(key, definitions, profile, quality),
  )
})

const participantMetricAllowed = (testType: string, key: string): boolean => {
  // Matrix `reachedDifficulty` only means that at least one item in a design
  // tier was answered correctly. It is useful as a raw research descriptor,
  // but a single lucky response can raise it, so it must not be presented as
  // a participant ability/difficulty level.
  if (testType === 'matrix' && key === 'reachedDifficulty') return false
  return true
}

const experienceHeadlineByTestType: Record<string, string> = {
  stroop: 'incongruentAccuracy',
  nback: 'dPrimeByN',
  sst: 'pRespondStop',
}

const resolveHeadlineKeys = (input: {
  testType: string
  profile: CognitiveProfile | null
  definition: ReportDefinition
  metricDefinitions: Record<string, MetricDefinition>
  quality: Pick<CognitiveScoreResult['quality'], 'flags'>
}): string[] => {
  const experienceHeadline = input.profile === 'experience'
    ? experienceHeadlineByTestType[input.testType]
    : undefined
  if (
    experienceHeadline
    && eligibleMetric(experienceHeadline, input.metricDefinitions, input.profile, input.quality)
    && participantMetricAllowed(input.testType, experienceHeadline)
  ) {
    return [experienceHeadline]
  }
  return projectKeys(
    input.definition.headlineMetrics,
    'headline',
    input.metricDefinitions,
    input.profile,
    input.quality,
  ).filter((key) => participantMetricAllowed(input.testType, key))
}

const conclusionFor = (state: QualityState, profile: CognitiveProfile | null): string => {
  if (state === 'invalid') return '本次数据未达到可解释条件，暂不提供表现结论。'
  if (state === 'limited') return '本次结果存在质量限制，请结合展开详情谨慎阅读。'
  if (profile === 'experience') {
    return '体验版使用短程协议；以下指标由正式评分器计算，适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。'
  }
  return '以下结果描述本次任务中的表现，不等同于诊断或正式人口常模。'
}

const participantPracticalTips = (testType: string, tips: string[]): string[] => {
  if (testType === 'memory' || testType === 'stroop') return []
  return tips
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
  const headlineKeys = resolveHeadlineKeys({
    testType: input.testType,
    profile: input.profile,
    definition: input.definition,
    metricDefinitions: input.metricDefinitions,
    quality: input.score.quality,
  })
  const headlineSet = new Set(headlineKeys)
  const userKeys = projectKeys(input.definition.userMetrics, 'user', input.metricDefinitions, input.profile, input.score.quality)
    .filter((key) => !headlineSet.has(key))
    .filter((key) => participantMetricAllowed(input.testType, key))
  const detailKeys = projectKeys(input.definition.detailMetrics, 'detail', input.metricDefinitions, input.profile, input.score.quality)
    .filter((key) => participantMetricAllowed(input.testType, key))
  const researchKeys = input.profile === 'research'
    ? Object.values(input.metricDefinitions)
        .filter((definition) => definition.visibility === 'research_only')
        .map((definition) => definition.key)
        .filter((key) => eligibleMetric(key, input.metricDefinitions, input.profile, input.score.quality))
        .filter((key) => participantMetricAllowed(input.testType, key))
    : []
  const caveats = input.profile
    ? input.definition.profileCaveats?.[input.profile] ?? []
    : []
  const invalid = input.score.quality.state === 'invalid'
  return {
    title: input.definition.title,
    qualityState: input.score.quality.state,
    conclusion: conclusionFor(input.score.quality.state, input.profile),
    headline: invalid
      ? []
      : headlineKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    user: invalid
      ? []
      : userKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    detail: invalid
      ? []
      : detailKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    research: invalid
      ? []
      : researchKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions)),
    caveats,
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
    practicalTips: participantPracticalTips(input.testType, input.definition.practicalTips),
  }
}
