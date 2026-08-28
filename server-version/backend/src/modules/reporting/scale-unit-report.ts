import { safeDecrypt } from '../../utils/encryption'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'

/**
 * A scale report is a per-instrument projection. It deliberately does not
 * contain a collection average, an overall assessment, or a cross-instrument
 * conclusion.
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

/** Build the same v2 DTO for standalone, questionnaire and composite contexts. */
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
