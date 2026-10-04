import { safeDecrypt } from '../../utils/encryption'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'
import { resolveEffectiveScaleDisclosure } from '../scale/projection/context'
import {
  projectExternalEducationalFeedback,
  projectExternalInterpretations,
  projectExternalScaleMethod,
  projectExternalScaleQuality,
  projectExternalScaleReferences,
  projectExternalScaleScores,
} from '../scale/projection/serialization'
import type { ScaleProjectionContext } from '../scale/projection/types'

/**
 * A scale report is an internal per-instrument report input. It may contain a
 * complete authoritative result and therefore must not be serialized directly.
 */
export const SCALE_REPORT_DISCLAIMER = '量表结果仅反映本次作答，不构成医学诊断或人口常模。'
export const SCALE_REPORT_DEFINITION_VERSION = 'scale-unit-report-v2'

export interface ScaleUnitReport {
  itemId?: string
  type: 'SCALE'
  kind: 'scale'
  scaleId: string
  scaleCode?: string | null
  label?: string | null
  scaleName: string
  result: ScaleResultV2 | null
  quality: ScaleResultV2['quality'] | null
  scores: ScaleResultV2['scores']
  references: ScaleResultV2['references']
  interpretations: ScaleResultV2['interpretations']
  caveats: string[]
  disclaimer: string
  completedAt: Date | string | null
  totalTime: number | null
  method: ScaleResultV2['method'] | null
  decryptError?: boolean
}

export type DecodedReportField<T extends object> = { ok: true; value: T | null } | { ok: false }

/** Decode the frozen result without converting a failed decrypt into an empty result. */
export const decodeReportField = <T extends object>(value: unknown): DecodedReportField<T> => {
  if (value === null || value === undefined) return { ok: true, value: null }
  const decoded = typeof value === 'string' ? safeDecrypt<T>(value) : value as T
  return decoded === null || decoded === undefined ? { ok: false } : { ok: true, value: decoded }
}

export interface BuildScaleUnitReportInput {
  itemId?: string
  scaleId: string
  scaleCode?: string | null
  scaleName: string
  result?: unknown
  caveats?: string[]
  disclaimer?: string | null
  completedAt?: Date | string | null
  totalTime?: number | null
}

const baseFor = (input: BuildScaleUnitReportInput) => ({
  ...(input.itemId ? { itemId: input.itemId } : {}),
  type: 'SCALE' as const,
  kind: 'scale' as const,
  scaleId: input.scaleId,
  scaleCode: input.scaleCode ?? null,
  label: input.scaleName,
  scaleName: input.scaleName,
  completedAt: input.completedAt ?? null,
  totalTime: input.totalTime ?? null,
  method: null,
  caveats: input.caveats?.map(String) ?? [],
  disclaimer: input.disclaimer || SCALE_REPORT_DISCLAIMER,
})

const emptyResultProjection = (input: BuildScaleUnitReportInput): ScaleUnitReport => ({
  ...baseFor(input),
  result: null,
  quality: null,
  scores: [],
  references: [],
  interpretations: [],
})

/** Internal builder. External callers must pass its output through projectScaleUnitReport. */
export const buildScaleUnitReport = (input: BuildScaleUnitReportInput): ScaleUnitReport => {
  const decoded = decodeReportField<ScaleResultV2>(input.result)
  if (!decoded.ok) return { ...emptyResultProjection(input), decryptError: true }
  if (decoded.value === null) return emptyResultProjection(input)
  let result: ScaleResultV2
  try {
    result = parseScaleResultV2(decoded.value)
  } catch {
    return { ...emptyResultProjection(input), decryptError: true }
  }
  return {
    ...baseFor(input),
    result,
    quality: result.quality,
    scores: result.scores,
    references: result.references,
    interpretations: result.interpretations,
    method: result.method,
    caveats: input.caveats?.map(String) ?? result.caveats,
    disclaimer: input.disclaimer || result.disclaimer || SCALE_REPORT_DISCLAIMER,
  }
}

const externalBase = (report: ScaleUnitReport) => ({
  ...(report.itemId ? { itemId: report.itemId } : {}),
  type: 'SCALE' as const,
  kind: 'scale' as const,
  scaleId: report.scaleId,
  scaleCode: report.scaleCode ?? null,
  label: report.label ?? report.scaleName,
  scaleName: report.scaleName,
  completedAt: report.completedAt ?? null,
  totalTime: report.totalTime ?? null,
})

/** Strict audience-safe serializer for ScaleUnitReport, including stored aggregates. */
export const projectScaleUnitReport = (report: ScaleUnitReport, context: ScaleProjectionContext): any => {
  const base = externalBase(report)
  if (context.frozenPolicy.disposition === 'UNKNOWN') {
    return { ...base, reportKind: 'unavailable', reason: 'POLICY_UNAVAILABLE' }
  }
  if (report.decryptError) return { ...base, reportKind: 'unavailable', reason: 'RESULT_UNAVAILABLE', decryptError: true }
  const capabilities = resolveEffectiveScaleDisclosure(context)
  const rich = capabilities.references
    || capabilities.individualInterpretations
    || capabilities.scoreDerivedLabels
    || capabilities.resultQualityDetails
    || capabilities.itemScores
    || capabilities.methods
  const feedback = projectExternalEducationalFeedback(context.frozenPolicy.educationalFeedback)

  if (!capabilities.numericScores && !rich) {
    if (capabilities.educationalContent && feedback) {
      return {
        ...base,
        reportKind: 'educational',
        educationalFeedback: feedback,
      }
    }
    return { ...base, reportKind: 'completion' }
  }

  if (capabilities.numericScores && !rich) {
    return {
      ...base,
      reportKind: 'scores',
      scores: projectExternalScaleScores(report.scores),
      disclaimer: report.disclaimer,
    }
  }

  const quality = capabilities.resultQualityDetails ? projectExternalScaleQuality(report.quality) : null
  const method = capabilities.methods ? projectExternalScaleMethod(report.method) : null
  // Collection/Composite surfaces intentionally expose a stricter subset than
  // standalone full reports: item-level data stays on the standalone boundary.
  // Keep the historical rich unit shape while serializing every child by an
  // explicit allowlist, so future internal fields cannot cross automatically.
  return {
    ...base,
    ...(capabilities.numericScores ? { scores: projectExternalScaleScores(report.scores) } : {}),
    ...(capabilities.references ? { references: projectExternalScaleReferences(report.references, capabilities) } : {}),
    ...(capabilities.individualInterpretations ? {
      interpretations: projectExternalInterpretations(report.interpretations, capabilities),
    } : {}),
    ...(quality ? { quality, caveats: report.caveats.map(String) } : {}),
    ...(method ? { method } : {}),
    ...(capabilities.educationalContent && feedback ? { educationalFeedback: feedback } : {}),
    disclaimer: report.disclaimer,
  }
}

export interface FormBackgroundReport {
  itemId: string
  type: 'FORM'
  kind: 'background'
  label: string | null
  value: string | null
  displayValue?: string | null
}

export const buildFormBackgroundReport = (input: {
  itemId: string
  label?: string | null
  value?: string | null
  formType?: string | null
  options?: unknown
}): FormBackgroundReport => ({
  itemId: input.itemId,
  type: 'FORM',
  kind: 'background',
  label: input.label ?? null,
  value: input.value ?? null,
  ...(['single_choice', 'multiple_choice'].includes(input.formType ?? '') ? { displayValue: formatFormAnswerLabel(input.value ?? null, input.formType, input.options) } : {}),
})

/** Presentation only: canonical answers and scoring values are never changed. */
export const formatFormAnswerLabel = (value: string | null, formType?: string | null, options?: unknown): string | null => {
  if (value === null || !['single_choice', 'multiple_choice'].includes(formType ?? '') || !Array.isArray(options)) return value
  const label = (selected: unknown) => {
    const option = options.find(option => option && typeof option === 'object' && String(option.value) === String(selected))
    return option && typeof option.label === 'string' ? option.label : String(selected)
  }
  if (formType === 'single_choice') return label(value)
  try {
    const selected = JSON.parse(value)
    return Array.isArray(selected) ? selected.map(label).join('、') : value
  } catch { return value }
}
