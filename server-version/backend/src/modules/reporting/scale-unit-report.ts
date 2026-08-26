import { safeDecrypt } from '../../utils/encryption'

/**
 * Scale reports are deliberately a per-scale contract.  In particular, this
 * type has no field for a collection average or an overall interpretation.
 */
export interface ScaleDimensionScore {
  dimensionId: string
  dimensionCode: string | null
  dimensionName: string
  rawScore: number | null
  normalizedScore: number | null
  level: string | null
  levelName?: string
  itemCount: number | null
  minScore: number | null
  maxScore: number | null
}

export interface ScaleDimensionFeedback {
  dimensionId: string
  dimensionCode: string | null
  dimensionName: string
  score: number | null
  minScore: number | null
  maxScore: number | null
  level: string | null
  levelName?: string
  interpretation: string
  suggestions: string[]
}

export interface ScaleFeedback {
  overall: string
  dimensions: ScaleDimensionFeedback[]
  feedbackLevel?: string
}

/**
 * These two fields are part of the per-scale report rather than a collection
 * summary.  Keeping them here means questionnaire and Composite consumers
 * render the same caveat/disclaimer for the same stored scale result.
 */
export const SCALE_REPORT_DISCLAIMER = '量表结果仅反映本次作答，不构成医学诊断或人口常模。'

export interface ScaleUnitReport {
  itemId?: string
  type: 'SCALE'
  kind: 'scale'
  scaleId: string
  scaleCode?: string | null
  label?: string | null
  scaleName: string
  dimensionScores: ScaleDimensionScore[]
  feedback: ScaleFeedback
  caveats: string[]
  disclaimer: string
  completedAt: Date | string | null
  totalTime: number | null
  method: {
    scaleId: string
    scaleCode: string | null
    reportDefinitionVersion: string
  }
  decryptError?: boolean
}

export const SCALE_REPORT_DEFINITION_VERSION = 'scale-unit-report-v1'

export type DecodedReportField<T extends object> = { ok: true; value: T | null } | { ok: false }

/**
 * Decode one report field without turning a failed decrypt into an empty
 * result.  A missing field is valid for old/incomplete records; a malformed
 * ciphertext is not.
 */
export const decodeReportField = <T extends object>(value: unknown): DecodedReportField<T> => {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: true, value: value as T }
  const decoded = safeDecrypt<T>(value)
  return decoded === null || decoded === undefined ? { ok: false } : { ok: true, value: decoded }
}

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
)

const asArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const nullableString = (value: unknown): string | null => (
  value === null || value === undefined ? null : String(value)
)

export interface ScaleDimensionMeta {
  id?: string | null
  code?: string | null
  name?: string | null
  minScore?: number | null
  maxScore?: number | null
}

const dimensionMetaFor = (dimensions: ScaleDimensionMeta[] | undefined, dimension: any): ScaleDimensionMeta | undefined => {
  if (!dimensions) return undefined
  return dimensions.find((candidate) => (
    (candidate.id && candidate.id === dimension?.dimensionId)
      || (candidate.code && candidate.code === dimension?.dimensionCode)
  ))
}

const normalizeScores = (value: unknown, dimensions?: ScaleDimensionMeta[]): ScaleDimensionScore[] => asArray(value).map((score: any) => {
  const meta = dimensionMetaFor(dimensions, score)
  return {
    dimensionId: String(score?.dimensionId ?? meta?.id ?? ''),
    dimensionCode: nullableString(score?.dimensionCode ?? meta?.code),
    dimensionName: String(score?.dimensionName ?? meta?.name ?? score?.dimensionCode ?? score?.dimensionId ?? '未命名维度'),
    rawScore: nullableNumber(score?.rawScore),
    normalizedScore: nullableNumber(score?.normalizedScore),
    level: nullableString(score?.level),
    ...(score?.levelName === undefined ? {} : { levelName: String(score.levelName) }),
    itemCount: nullableNumber(score?.itemCount),
    minScore: nullableNumber(score?.minScore ?? meta?.minScore),
    maxScore: nullableNumber(score?.maxScore ?? meta?.maxScore),
  }
})

const normalizeFeedback = (value: unknown, dimensions?: ScaleDimensionMeta[]): ScaleFeedback => {
  const feedback = asRecord(value)
  const feedbackDimensions = Array.isArray(feedback.dimensions) ? feedback.dimensions : []
  return {
    overall: String(feedback.overall ?? feedback.summary ?? ''),
    dimensions: feedbackDimensions.map((dimension: any) => {
      const meta = dimensionMetaFor(dimensions, dimension)
      return {
        dimensionId: String(dimension?.dimensionId ?? meta?.id ?? ''),
        dimensionCode: nullableString(dimension?.dimensionCode ?? meta?.code),
        dimensionName: String(dimension?.dimensionName ?? meta?.name ?? dimension?.dimensionCode ?? dimension?.dimensionId ?? '未命名维度'),
        score: nullableNumber(dimension?.score),
        minScore: nullableNumber(dimension?.minScore ?? meta?.minScore),
        maxScore: nullableNumber(dimension?.maxScore ?? meta?.maxScore),
        level: nullableString(dimension?.level),
        ...(dimension?.levelName === undefined ? {} : { levelName: String(dimension.levelName) }),
        interpretation: String(dimension?.interpretation ?? ''),
        suggestions: Array.isArray(dimension?.suggestions) ? dimension.suggestions.map(String) : [],
      }
    }),
    ...(feedback.feedbackLevel === undefined ? {} : { feedbackLevel: String(feedback.feedbackLevel) }),
  }
}

export interface BuildScaleUnitReportInput {
  itemId?: string
  scaleId: string
  scaleCode?: string | null
  scaleName: string
  scores: unknown
  feedback: unknown
  dimensions?: ScaleDimensionMeta[]
  caveats?: string[]
  disclaimer?: string | null
  completedAt?: Date | string | null
  totalTime?: number | null
}

/**
 * Build the same scale DTO for standalone, questionnaire and Composite
 * contexts.  This function only projects frozen score/feedback values; it
 * never recalculates a score or infers a collection-level conclusion.
 */
export const buildScaleUnitReport = (input: BuildScaleUnitReportInput): ScaleUnitReport => {
  const scores = decodeReportField<any[]>(input.scores)
  const feedback = decodeReportField<Record<string, unknown>>(input.feedback)
  const feedbackRecord = feedback.ok ? asRecord(feedback.value) : {}
  const caveats = Array.isArray(input.caveats)
    ? input.caveats.map(String)
    : Array.isArray(feedbackRecord.caveats)
      ? feedbackRecord.caveats.map(String)
      : []
  const disclaimer = input.disclaimer
    ?? (feedbackRecord.disclaimer == null ? null : String(feedbackRecord.disclaimer))
    ?? SCALE_REPORT_DISCLAIMER
  const base = {
    ...(input.itemId ? { itemId: input.itemId } : {}),
    type: 'SCALE' as const,
    kind: 'scale' as const,
    scaleId: input.scaleId,
    scaleCode: input.scaleCode ?? null,
    label: input.scaleName,
    scaleName: input.scaleName,
    completedAt: input.completedAt ?? null,
    totalTime: input.totalTime ?? null,
    method: {
      scaleId: input.scaleId,
      scaleCode: input.scaleCode ?? null,
      reportDefinitionVersion: SCALE_REPORT_DEFINITION_VERSION,
    },
    caveats,
    disclaimer: disclaimer || SCALE_REPORT_DISCLAIMER,
  }

  if (!scores.ok || !feedback.ok) {
    // Do not expose a partially trusted field.  Consumers branch on
    // decryptError before rendering the successful DTO fields.
    return { ...base, dimensionScores: [], decryptError: true } as unknown as ScaleUnitReport
  }

  return {
    ...base,
    dimensionScores: normalizeScores(scores.value, input.dimensions),
    feedback: normalizeFeedback(feedback.value, input.dimensions),
  }
}

export interface FormBackgroundReport {
  itemId: string
  type: 'FORM'
  kind: 'background'
  label: string | null
  value: string | null
}

export const buildFormBackgroundReport = (input: {
  itemId: string
  label?: string | null
  value?: string | null
}): FormBackgroundReport => ({
  itemId: input.itemId,
  type: 'FORM',
  kind: 'background',
  label: input.label ?? null,
  value: input.value ?? null,
})
