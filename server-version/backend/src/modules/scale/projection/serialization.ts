import type { ResolvedScaleReference } from '../../assessment-reference/reference'
import type { DeviceInputProvenanceV1 } from '../device-input-provenance'
import type { EducationalFeedbackDefinitionV1, DisclosureCapabilitiesV1 } from '../policy/types'
import type { ScaleResultV2 } from '../scale-result'
import type { ScaleAnswer, ScaleScoreValue } from '../scale-scoring'

export interface ExternalScaleScoreV1 {
  key: string
  label: string
  value: number | null
  type?: ScaleScoreValue['type']
  description?: string
  direction?: ScaleScoreValue['direction']
  canonical?: boolean
  displayPrecision?: number
  range?: ScaleScoreValue['range']
  expectedItems?: string[]
  answeredItems?: string[]
  status?: ScaleScoreValue['status']
  prorated?: boolean
}

export interface ExternalScaleQualityV1 {
  status: 'interpretable' | 'limited' | 'invalid'
  flags: string[]
}

export interface ExternalScaleMethodV1 {
  scaleId?: string
  instrumentVersion?: string
  scoringVersion?: string
  reportVersion?: string
  definitionHash?: string
  referenceVersions?: string[]
  assessmentContext?: { schemaVersion: 1; snapshotHash: string } | null
}

export interface ExternalScaleItemScoreV1 {
  itemCode: string
  baseScore: number
  score: number
  responseValue?: string | number
  responseTimeMs?: number
  answeredAt?: string
  changeCount?: number
}

const record = (value: unknown): Record<string, any> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
)

const finiteOrNull = (value: unknown): number | null | undefined => (
  value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : undefined
)

const stringArray = (value: unknown): string[] | undefined => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : undefined
)

const scoreTypes = new Set(['total', 'dimension'])
const scoreDirections = new Set(['higher_is_better', 'higher_is_worse', 'higher_is_more', 'lower_is_better', 'bipolar', 'descriptive'])
const scoreStatuses = new Set(['calculated', 'limited', 'not_calculable'])

export const projectExternalScaleScore = (value: unknown): ExternalScaleScoreV1 | null => {
  const input = record(value)
  const numericValue = finiteOrNull(input?.value)
  if (!input || typeof input.key !== 'string' || typeof input.label !== 'string' || numericValue === undefined) return null
  const range = record(input.range)
  const min = finiteOrNull(range?.min)
  const max = finiteOrNull(range?.max)
  return {
    key: input.key,
    label: input.label,
    value: numericValue,
    ...(scoreTypes.has(input.type) ? { type: input.type as ScaleScoreValue['type'] } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(scoreDirections.has(input.direction) ? { direction: input.direction as ScaleScoreValue['direction'] } : {}),
    ...(typeof input.canonical === 'boolean' ? { canonical: input.canonical } : {}),
    ...(Number.isInteger(input.displayPrecision) && input.displayPrecision >= 0 && input.displayPrecision <= 6
      ? { displayPrecision: input.displayPrecision }
      : {}),
    ...(input.range === null ? { range: null } : min !== undefined && min !== null && max !== undefined && max !== null
      ? { range: { min, max } }
      : {}),
    ...(stringArray(input.expectedItems) ? { expectedItems: stringArray(input.expectedItems)! } : {}),
    ...(stringArray(input.answeredItems) ? { answeredItems: stringArray(input.answeredItems)! } : {}),
    ...(scoreStatuses.has(input.status) ? { status: input.status as ScaleScoreValue['status'] } : {}),
    ...(typeof input.prorated === 'boolean' ? { prorated: input.prorated } : {}),
  }
}

export const projectExternalScaleScores = (value: unknown): ExternalScaleScoreV1[] => (
  Array.isArray(value) ? value.map(projectExternalScaleScore).filter((entry): entry is ExternalScaleScoreV1 => entry !== null) : []
)

export const projectExternalScaleQuality = (value: unknown): ExternalScaleQualityV1 | null => {
  const input = record(value)
  if (!input || !['interpretable', 'limited', 'invalid'].includes(input.status)) return null
  return {
    status: input.status as ExternalScaleQualityV1['status'],
    flags: Array.isArray(input.flags) ? input.flags.filter((flag): flag is string => typeof flag === 'string') : [],
  }
}

export const projectExternalScaleMethod = (value: unknown): ExternalScaleMethodV1 | null => {
  const input = record(value)
  if (!input) return null
  const assessmentContext = record(input.assessmentContext)
  const output: ExternalScaleMethodV1 = {
    ...(typeof input.scaleId === 'string' ? { scaleId: input.scaleId } : {}),
    ...(typeof input.instrumentVersion === 'string' ? { instrumentVersion: input.instrumentVersion } : {}),
    ...(typeof input.scoringVersion === 'string' ? { scoringVersion: input.scoringVersion } : {}),
    ...(typeof input.reportVersion === 'string' ? { reportVersion: input.reportVersion } : {}),
    ...(typeof input.definitionHash === 'string' ? { definitionHash: input.definitionHash } : {}),
    ...(stringArray(input.referenceVersions) ? { referenceVersions: stringArray(input.referenceVersions)! } : {}),
    ...(input.assessmentContext === null
      ? { assessmentContext: null }
      : assessmentContext?.schemaVersion === 1 && typeof assessmentContext.snapshotHash === 'string'
        ? { assessmentContext: { schemaVersion: 1, snapshotHash: assessmentContext.snapshotHash } }
        : {}),
  }
  return Object.keys(output).length > 0 ? output : null
}

const projectSource = (value: unknown) => {
  const input = record(value)
  if (!input || typeof input.citation !== 'string') return null
  return {
    citation: input.citation,
    ...(typeof input.doi === 'string' ? { doi: input.doi } : {}),
    ...(typeof input.url === 'string' ? { url: input.url } : {}),
    ...(Number.isInteger(input.publicationYear) ? { publicationYear: input.publicationYear } : {}),
    ...(Number.isInteger(input.sampleSize) ? { sampleSize: input.sampleSize } : {}),
  }
}

const projectPopulation = (value: unknown) => {
  const input = record(value)
  if (!input) return null
  const match = record(input.match)
  const projectedMatch = match ? {
    ...(Number.isInteger(match.minAgeMonthsInclusive) ? { minAgeMonthsInclusive: match.minAgeMonthsInclusive } : {}),
    ...(Number.isInteger(match.maxAgeMonthsExclusive) ? { maxAgeMonthsExclusive: match.maxAgeMonthsExclusive } : {}),
    ...(Array.isArray(match.sexAtBirth) ? { sexAtBirth: match.sexAtBirth.filter((entry: unknown) => ['female', 'male', 'intersex'].includes(String(entry))) } : {}),
    ...(stringArray(match.gradeLevels) ? { gradeLevels: stringArray(match.gradeLevels)! } : {}),
    ...(stringArray(match.primaryLanguages) ? { primaryLanguages: stringArray(match.primaryLanguages)! } : {}),
    ...(stringArray(match.countriesOrRegions) ? { countriesOrRegions: stringArray(match.countriesOrRegions)! } : {}),
  } : undefined
  return {
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(projectedMatch && Object.keys(projectedMatch).length > 0 ? { match: projectedMatch } : {}),
    ...(typeof input.ageBand === 'string' || input.ageBand === null ? { ageBand: input.ageBand } : {}),
    ...(typeof input.sexScope === 'string' || input.sexScope === null ? { sexScope: input.sexScope } : {}),
    ...(typeof input.language === 'string' || input.language === null ? { language: input.language } : {}),
    ...(typeof input.countryOrRegion === 'string' || input.countryOrRegion === null ? { countryOrRegion: input.countryOrRegion } : {}),
  }
}

export const projectExternalScaleReference = (
  value: unknown,
  capabilities: Pick<DisclosureCapabilitiesV1, 'numericScores' | 'scoreDerivedLabels'>,
): ResolvedScaleReference | null => {
  const input = record(value)
  if (
    !input
    || typeof input.scoreKey !== 'string'
    || typeof input.referenceVersion !== 'string'
    || !['normative_distribution', 'criterion_threshold', 'descriptive_sample', 'theoretical_range'].includes(input.referenceKind)
    || !['available', 'unavailable'].includes(input.status)
    || typeof input.label !== 'string'
    || typeof input.disclaimer !== 'string'
  ) return null
  const source = projectSource(input.source)
  const population = projectPopulation(input.population)
  const criterion = record(input.criterionBand)
  const percentile = record(input.percentile)
  const numeric = capabilities.numericScores
  const derivedLabels = capabilities.scoreDerivedLabels
  return {
    scoreKey: input.scoreKey,
    referenceVersion: input.referenceVersion,
    referenceKind: input.referenceKind,
    evidenceLevel: ['theoretical', 'literature_beta', 'local_pilot', 'local_norm', 'validated_norm'].includes(input.evidenceLevel) ? input.evidenceLevel : null,
    status: input.status,
    ...(typeof input.unavailableReason === 'string' ? { unavailableReason: input.unavailableReason } : {}),
    label: input.label,
    value: numeric ? finiteOrNull(input.value) ?? null : null,
    mean: finiteOrNull(input.mean) ?? null,
    sd: finiteOrNull(input.sd) ?? null,
    z: numeric ? finiteOrNull(input.z) ?? null : null,
    t: numeric ? finiteOrNull(input.t) ?? null : null,
    percentile: numeric && percentile && typeof percentile.value === 'number' && Number.isFinite(percentile.value)
      ? { value: percentile.value, estimated: percentile.estimated === true }
      : null,
    criterionBand: derivedLabels && criterion && typeof criterion.key === 'string' && typeof criterion.label === 'string'
      ? {
          key: criterion.key,
          label: criterion.label,
          minInclusive: finiteOrNull(criterion.minInclusive) ?? null,
          maxInclusive: finiteOrNull(criterion.maxInclusive) ?? null,
        }
      : null,
    meanDifference: numeric ? finiteOrNull(input.meanDifference) ?? null : null,
    source,
    population,
    instrumentVersion: typeof input.instrumentVersion === 'string' || input.instrumentVersion === null ? input.instrumentVersion : null,
    scoringVersion: typeof input.scoringVersion === 'string' || input.scoringVersion === null ? input.scoringVersion : null,
    limitations: Array.isArray(input.limitations) ? input.limitations.filter((entry: unknown): entry is string => typeof entry === 'string') : [],
    disclaimer: input.disclaimer,
  } as ResolvedScaleReference
}

export const projectExternalScaleReferences = (
  value: unknown,
  capabilities: Pick<DisclosureCapabilitiesV1, 'numericScores' | 'scoreDerivedLabels'>,
): ResolvedScaleReference[] => (
  Array.isArray(value)
    ? value.map((entry) => projectExternalScaleReference(entry, capabilities)).filter((entry): entry is ResolvedScaleReference => entry !== null)
    : []
)

export const projectExternalScaleItemScore = (value: unknown, includeRawAnswers: boolean): ExternalScaleItemScoreV1 | null => {
  const input = record(value)
  if (!input || typeof input.itemCode !== 'string' || !Number.isFinite(input.baseScore) || !Number.isFinite(input.score)) return null
  return {
    itemCode: input.itemCode,
    baseScore: input.baseScore,
    score: input.score,
    ...(includeRawAnswers && (typeof input.responseValue === 'string' || typeof input.responseValue === 'number') ? { responseValue: input.responseValue } : {}),
    ...(includeRawAnswers && typeof input.responseTimeMs === 'number' && Number.isFinite(input.responseTimeMs) ? { responseTimeMs: input.responseTimeMs } : {}),
    ...(includeRawAnswers && typeof input.answeredAt === 'string' ? { answeredAt: input.answeredAt } : {}),
    ...(includeRawAnswers && Number.isInteger(input.changeCount) && input.changeCount >= 0 ? { changeCount: input.changeCount } : {}),
  }
}

export const projectExternalScaleItemScores = (value: unknown, includeRawAnswers: boolean): ExternalScaleItemScoreV1[] => (
  Array.isArray(value)
    ? value.map((entry) => projectExternalScaleItemScore(entry, includeRawAnswers)).filter((entry): entry is ExternalScaleItemScoreV1 => entry !== null)
    : []
)

export const projectExternalEducationalFeedback = (feedback: EducationalFeedbackDefinitionV1 | undefined) => feedback ? ({
  contentVersion: feedback.contentVersion,
  blocks: feedback.blocks.map((block) => ({
    id: block.id,
    ...(block.title ? { title: block.title } : {}),
    body: block.body,
  })),
  ...(feedback.choices ? { choices: feedback.choices.map((choice) => ({ id: choice.id, label: choice.label, body: choice.body })) } : {}),
  ...(feedback.disclaimer ? { disclaimer: feedback.disclaimer } : {}),
}) : undefined

export const projectExternalScaleAnswer = (answer: ScaleAnswer) => ({
  itemCode: answer.itemCode,
  responseValue: answer.responseValue,
  ...(typeof answer.responseTimeMs === 'number' ? { responseTimeMs: answer.responseTimeMs } : {}),
  ...(typeof answer.answeredAt === 'string' ? { answeredAt: answer.answeredAt } : {}),
  ...(typeof answer.changeCount === 'number' ? { changeCount: answer.changeCount } : {}),
  ...(typeof answer.revision === 'number' ? { revision: answer.revision } : {}),
})

export const projectExternalDeviceProvenance = (value: DeviceInputProvenanceV1) => ({
  schemaVersion: 1 as const,
  deviceClass: value.deviceClass,
  ...(value.osFamily ? { osFamily: value.osFamily } : {}),
  ...(value.browserFamily ? { browserFamily: value.browserFamily } : {}),
  ...(typeof value.viewportWidth === 'number' ? { viewportWidth: value.viewportWidth } : {}),
  ...(typeof value.viewportHeight === 'number' ? { viewportHeight: value.viewportHeight } : {}),
  ...(typeof value.screenWidth === 'number' ? { screenWidth: value.screenWidth } : {}),
  ...(typeof value.screenHeight === 'number' ? { screenHeight: value.screenHeight } : {}),
  ...(typeof value.devicePixelRatio === 'number' ? { devicePixelRatio: value.devicePixelRatio } : {}),
  ...(typeof value.maxTouchPoints === 'number' ? { maxTouchPoints: value.maxTouchPoints } : {}),
  primaryPointer: value.primaryPointer,
  capturedAt: value.capturedAt,
})

export const projectExternalInterpretations = (
  value: ScaleResultV2['interpretations'],
  capabilities: Pick<DisclosureCapabilitiesV1, 'scoreDerivedLabels'>,
) => value.map((entry) => ({
  scoreKey: entry.scoreKey,
  headline: capabilities.scoreDerivedLabels ? entry.headline : '结果说明',
  label: capabilities.scoreDerivedLabels ? entry.label : null,
  interpretation: entry.interpretation,
  guidance: entry.guidance.map((guidance) => ({ category: guidance.category, text: guidance.text })),
  limitations: [...entry.limitations],
  referenceVersion: entry.referenceVersion,
}))
