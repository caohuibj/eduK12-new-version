import type {
  CognitiveProfile,
  CognitiveScoreResult,
  MetricDefinition,
  QualityDefinition,
  ReportDefinition,
  QualityState,
} from './types'
import { metricIsQualityGated } from './quality'
import { resolveLegacyCognitiveProtocolPresentation } from '../legacy-protocol-presentation'
import { legacyExperienceHeadline, legacyMetricAllowed, legacySuppressTips } from '../legacy-report-policy'
import type { CognitiveParticipantPresentationV1 } from '../participant-presentation.types'
import { buildReadingVisual, finiteMetric, readingMetricAllowed, type ReportReading } from './report-reading'

export interface ReportMetricView {
  presentationVersion?: string
  participantLabel?: string
  explanation?: string
  key: string
  label: string
  category: string
  direction: MetricDefinition['direction']
  unit: MetricDefinition['unit']
  value: unknown
  formatted: string
}

export interface ThreeLayerReport {
  schemaVersion?: 2
  reading?: ReportReading
  title: string
  profileLabel: string | null
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

/** New report gates also apply to reference comparisons at the persisted boundary. */
export const referencesForReportReading = <T extends { metricKey?: unknown; scoreKey?: unknown }>(report: ThreeLayerReport, references: T[]): T[] => {
  if (!report.reading) return references
  const withheld = new Set(report.reading.interpretation.withheldMetricKeys)
  return references.filter(reference => {
    const key = reference.metricKey ?? reference.scoreKey
    return typeof key === 'string' && !withheld.has(key)
  })
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

const metricView = (
  key: string,
  metrics: Record<string, unknown>,
  definitions: Record<string, MetricDefinition>,
  presentation?: CognitiveParticipantPresentationV1,
): ReportMetricView => {
  const definition = definitions[key]
  if (!definition) throw new Error(`Report references unknown metric: ${key}`)
  return {
    key,
    ...(presentation ? { presentationVersion: presentation.presentationVersion, participantLabel: presentation.metrics[key]?.label ?? definition.label, explanation: presentation.metrics[key]?.explanation } : {}),
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

const participantMetricAllowed = (testType: string, key: string, presentation?: CognitiveParticipantPresentationV1): boolean =>
  presentation ? !presentation.hiddenMetrics.includes(key) : legacyMetricAllowed(testType, key)

const resolveHeadlineKeys = (input: {
  testType: string
  participantPresentation?: CognitiveParticipantPresentationV1
  profile: CognitiveProfile | null
  definition: ReportDefinition
  metricDefinitions: Record<string, MetricDefinition>
  quality: Pick<CognitiveScoreResult['quality'], 'flags'>
}): string[] => {
  const experienceHeadline = input.profile === 'experience'
    ? (input.participantPresentation ? input.participantPresentation.experienceHeadline : legacyExperienceHeadline(input.testType))
    : undefined
  if (
    experienceHeadline
    && eligibleMetric(experienceHeadline, input.metricDefinitions, input.profile, input.quality)
    && participantMetricAllowed(input.testType, experienceHeadline, input.participantPresentation)
  ) {
    return [experienceHeadline]
  }
  return projectKeys(
    input.definition.headlineMetrics,
    'headline',
    input.metricDefinitions,
    input.profile,
    input.quality,
  ).filter((key) => participantMetricAllowed(input.testType, key, input.participantPresentation))
}

const conclusionFor = (
  state: QualityState,
  profile: CognitiveProfile | null,
  reviewedConclusion?: string,
): string => {
  if (state === 'invalid') return '本次数据未达到可解释条件，暂不提供表现结论。'
  if (state === 'limited') return '本次结果存在质量限制，请结合展开详情谨慎阅读。'
  if (reviewedConclusion) return reviewedConclusion
  if (profile === 'experience') {
    return '体验版使用短程协议；以下指标由正式评分器计算，适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。'
  }
  return '以下结果描述本次任务中的表现，不等同于诊断或正式人口常模。'
}

const legacyProfileLabel = (profile: CognitiveProfile | null): string | null => {
  if (profile === 'experience') return '体验版'
  if (profile === 'standard') return '正式版'
  if (profile === 'research') return '科研版'
  return null
}

export const projectThreeLayerReport = (input: {
  participantPresentation?: CognitiveParticipantPresentationV1
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
  /** Display-only inputs from the same frozen scoring context. */
  reportCaveats?: string[]
  trials?: unknown[]
  config?: Record<string, unknown>
}): ThreeLayerReport => {
  const qualityEntries = Object.entries(input.score.quality.flags).map(([key, active]) => ({
    key,
    label: input.qualityDefinitions[key]?.label ?? key,
    active,
    effect: input.qualityDefinitions[key]?.effect ?? 'limited',
  }))
  const headlineKeys = resolveHeadlineKeys({
    participantPresentation: input.participantPresentation,
    testType: input.testType,
    profile: input.profile,
    definition: input.definition,
    metricDefinitions: input.metricDefinitions,
    quality: input.score.quality,
  })
  const headlineSet = new Set(headlineKeys)
  const userKeys = projectKeys(input.definition.userMetrics, 'user', input.metricDefinitions, input.profile, input.score.quality)
    .filter((key) => !headlineSet.has(key))
    .filter((key) => participantMetricAllowed(input.testType, key, input.participantPresentation))
  const detailKeys = projectKeys(input.definition.detailMetrics, 'detail', input.metricDefinitions, input.profile, input.score.quality)
    .filter((key) => participantMetricAllowed(input.testType, key, input.participantPresentation))
  const protocolPresentation = input.participantPresentation
    ? (input.profile ? input.participantPresentation.protocols[input.profile] ?? null : null)
    : resolveLegacyCognitiveProtocolPresentation({
    testType: input.testType,
    engineVersion: input.engineVersion,
    scoringVersion: input.scoringVersion,
    profile: input.profile,
  })
  const report: ThreeLayerReport = {
    title: input.participantPresentation?.title ?? input.definition.title,
    profileLabel: protocolPresentation?.profileLabel ?? legacyProfileLabel(input.profile),
    qualityState: input.score.quality.state,
    conclusion: conclusionFor(
      input.score.quality.state,
      input.profile,
      protocolPresentation?.participantConclusion,
    ),
    headline: input.score.quality.state === 'invalid'
      ? []
      : headlineKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions, input.participantPresentation)),
    user: input.score.quality.state === 'invalid'
      ? []
      : userKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions, input.participantPresentation)),
    detail: input.score.quality.state === 'invalid'
      ? []
      : detailKeys.map((key) => metricView(key, input.metrics, input.metricDefinitions, input.participantPresentation)),
    quality: qualityEntries,
    method: {
      testType: input.testType,
      engineVersion: input.engineVersion,
      scoringVersion: input.scoringVersion,
      configVersion: input.configVersion,
      protocolSignature: input.protocolSignature,
      profile: input.profile,
    },
    disclaimer: input.participantPresentation?.disclaimer ?? input.definition.disclaimer,
    practicalTips: (input.participantPresentation ? input.participantPresentation.suppressTips : legacySuppressTips(input.testType)) ? [] : input.participantPresentation?.practicalTips ?? input.definition.practicalTips,
  }
  const policy = input.participantPresentation?.reportReading
  if (!policy) return report // Historical frozen presentations retain their original projection.
  const globalWithheld = input.score.quality.state === 'invalid'
    || policy.withholdFlags.some(flag => input.score.quality.flags[flag]
      && (flag !== 'legacyUninterpretable' || !Object.entries(input.score.quality.flags).some(([key, active]) => active && key !== 'legacyUninterpretable' && key !== 'interrupted')))
  const processKeys = new Set(policy.processMetricKeys)
  const allowed = new Set(Object.keys(input.metricDefinitions).filter(key => {
    const definition = input.metricDefinitions[key]
    return input.score.quality.state !== 'invalid'
      && (definition.role !== 'research_only' && definition.visibility !== 'hidden')
      && eligibleMetric(key, input.metricDefinitions, input.profile, input.score.quality)
      && participantMetricAllowed(input.testType, key, input.participantPresentation)
      && readingMetricAllowed({ key, policy, profile: input.profile, score: input.score })
      && (!globalWithheld || processKeys.has(key))
      && (definition.valueType === 'array' ? Array.isArray(input.metrics[key])
        : definition.valueType === 'object' ? input.metrics[key] !== null && typeof input.metrics[key] === 'object' && !Array.isArray(input.metrics[key])
          : finiteMetric(input.metrics[key]))
  }))
  const withheldMetricKeys = Object.keys(input.metricDefinitions).filter(key => !allowed.has(key))
  const readingView = (key: string): ReportMetricView => {
    const view = metricView(key, input.metrics, input.metricDefinitions, input.participantPresentation)
    const presentation = input.participantPresentation?.metrics[key]
    const definition = input.metricDefinitions[key]
    if (definition.valueType === 'object' || definition.valueType === 'array') {
      const valueText = (value: unknown) => !finiteMetric(value) ? '—'
        : presentation?.valueUnit === 'ratio' ? `${Math.round(value * 100)}%`
          : presentation?.valueUnit === 'ms' ? `${Math.round(value)} 毫秒`
            : `${Math.round(value * 100) / 100}${presentation?.valueUnit === 'count' ? ' 次' : ''}`
      const entries = definition.valueType === 'array'
        ? (view.value as unknown[]).map((value, index) => [`第 ${index + 1} 轮`, value] as const)
        : Object.entries(view.value as Record<string, unknown>).map(([level, value]) => [presentation?.valueLabels?.[level] ?? (input.testType === 'nback' ? `${level}-back` : level), value] as const)
      return { ...view, formatted: entries.length ? entries.map(([name, value]) => `${name}：${valueText(value)}`).join('；') : '—' }
    }
    const suffix = presentation?.displayUnit
    return { ...view, formatted: suffix ? `${view.formatted} ${suffix}` : view.formatted.replace(/ ms$/, ' 毫秒') }
  }
  const summaryPolicy = (input.profile ? policy.summaryByProfile?.[input.profile] : null) ?? policy.summary
  const summaryAvailable = summaryPolicy.metricKeys.every(key => allowed.has(key))
  const state = globalWithheld || !summaryAvailable ? 'withheld' : input.score.quality.state === 'limited' ? 'qualified' : 'available'
  const activeQuality = qualityEntries.filter(item => item.active)
  const reasons = activeQuality.filter(item => item.key !== 'legacyUninterpretable' || activeQuality.length === 1)
    .map(item => policy.qualityLabels?.[item.key] ?? item.label)
  const summary = summaryAvailable
    ? summaryPolicy.template.replace(/\{(\w+)\}/g, (_, key: string) => readingView(key).formatted)
    : '部分关键指标暂不解释。先保留本次完成记录，再核查任务理解与作答条件。'
  const studentKeys = policy.studentMetricKeys.filter(key => allowed.has(key))
  const visibleStudentKeys = globalWithheld
    ? studentKeys.filter(key => processKeys.has(key))
    : studentKeys
  report.headline = visibleStudentKeys.slice(0, 1).map(readingView)
  report.user = visibleStudentKeys.slice(1, 3).map(readingView)
  if (globalWithheld) {
    report.user = policy.processMetricKeys.filter(key => allowed.has(key) && !visibleStudentKeys.slice(0, 1).includes(key)).slice(0, 2)
      .map(readingView)
  }
  report.detail = [...new Set([...headlineKeys, ...userKeys, ...detailKeys, ...policy.processMetricKeys])].filter(key => allowed.has(key))
    .map(readingView)
  report.conclusion = summary
  report.profileLabel = input.profile === 'experience' ? '短程协议' : input.profile === 'standard' ? '标准协议' : input.profile === 'research' ? '科研协议' : '认知任务'
  const methodCaveats = [...new Set([...(input.reportCaveats ?? protocolPresentation?.reportCaveats ?? []),
    ...(input.profile === 'experience' ? ['短程协议仅描述本次体验，不提供人口百分位、年龄等级或稳定能力等级。'] : [])])]
  if (input.testType === 'memory' && finiteMetric(input.config?.maxLength) && input.metrics.maxSpan === input.config.maxLength) {
    methodCaveats.push('已达到本协议设置的序列长度上限，不能据此认定个人记忆上限。')
  }
  const caveats = methodCaveats.map(caveat => Object.entries(policy.caveatTerms ?? {}).reduce((text, [term, replacement]) => text.split(term).join(replacement), caveat))
  report.disclaimer = Object.entries(policy.caveatTerms ?? {}).reduce((text, [term, replacement]) => text.split(term).join(replacement), report.disclaimer)
  report.schemaVersion = 2
  report.reading = {
    schemaVersion: 2, reportVersion: policy.version, presentationVersion: input.participantPresentation!.presentationVersion,
    title: policy.title, introduction: policy.introduction, illustration: policy.illustration,
    interpretation: { state, reasons, withheldMetricKeys },
    feedback: { summary, evidenceMetricKeys: summaryAvailable ? [...summaryPolicy.metricKeys] : [],
      nextStep: state === 'withheld' ? '先确认看清信号、理解操作和作答条件；如需重测，遵循教师指导，不必反复刷分。' : policy.nextStep },
    caveats, methodCaveats,
    visuals: buildReadingVisual({ policy, metrics: input.metrics, allowedKeys: allowed, trials: input.trials, config: input.config,
      labels: Object.fromEntries(Object.keys(input.metricDefinitions).map(key => [key, input.participantPresentation?.metrics[key]?.label ?? input.metricDefinitions[key].label])),
      units: Object.fromEntries(Object.entries(input.metricDefinitions).map(([key, value]) => [key, value.unit])) }),
  }
  return report
}
