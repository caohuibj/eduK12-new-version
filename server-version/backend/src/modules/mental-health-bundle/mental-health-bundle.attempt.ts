import { parseScaleResultV2 } from '../scale/scale-result'
import { safeDecrypt } from '../../utils/encryption'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import type { FrozenScaleSlotMeasurement } from '../cognitive-analysis/protocol-freeze'
import { extractBundleScaleEvidence } from './mental-health-bundle.engine'
import type { BundleEvidenceMappingDefinition, FrozenBundleScaleEvidence } from './mental-health-bundle.types'

export interface MentalHealthBundleAttemptInput {
  id: string
  compositeAssessmentId: string
  compositeAssessment: {
    items: Array<{
      id: string
      type: string
      position: number
      required: boolean
      scaleId?: string | null
      scale?: {
        id?: string | null
        code?: string | null
        instrumentVersion?: string | null
      } | null
    }>
  }
  scaleAssessments?: Array<{
    id: string
    compositeItemId?: string | null
    scaleId: string
    status: string
    result?: unknown
    attemptNo?: number
    completedAt?: Date | string | null
    startedAt?: Date | string | null
  }>
}

const compareStrings = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const dateValue = (value: Date | string | null | undefined): number => {
  if (!value) return 0
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const selectLatestScaleAssessment = (
  assessments: NonNullable<MentalHealthBundleAttemptInput['scaleAssessments']>,
  itemId: string,
  scaleId: string,
) => assessments
  .filter((assessment) => assessment.compositeItemId === itemId && assessment.scaleId === scaleId)
  .sort((left, right) => (
    (right.attemptNo ?? 0) - (left.attemptNo ?? 0)
    || dateValue(right.completedAt ?? right.startedAt) - dateValue(left.completedAt ?? left.startedAt)
    || compareStrings(left.id, right.id)
  ))[0] ?? null

const resultFor = (assessment: NonNullable<MentalHealthBundleAttemptInput['scaleAssessments']>[number], slotKey: string) => {
  const decoded = typeof assessment.result === 'string'
    ? safeDecrypt<Record<string, unknown>>(assessment.result)
    : assessment.result && typeof assessment.result === 'object' && !Array.isArray(assessment.result)
      ? assessment.result
      : null
  try {
    return parseScaleResultV2(decoded)
  } catch {
    throw new Error(`Bundle 槽位量表 ScaleResultV2 格式无效：${slotKey}`)
  }
}

const validateResultProvenance = (
  result: ReturnType<typeof parseScaleResultV2>,
  measurement: FrozenScaleSlotMeasurement,
  slotKey: string,
): void => {
  const mismatches = [
    result.instrument.scaleId !== measurement.scaleId ? 'instrument.scaleId' : null,
    result.instrument.code !== measurement.scaleCode ? 'instrument.code' : null,
    result.instrument.instrumentVersion !== measurement.instrumentVersion ? 'instrument.instrumentVersion' : null,
    result.method.scaleId !== measurement.scaleId ? 'method.scaleId' : null,
    result.method.instrumentVersion !== measurement.instrumentVersion ? 'method.instrumentVersion' : null,
    result.method.scoringVersion !== measurement.scoringVersion ? 'method.scoringVersion' : null,
    result.method.definitionHash !== measurement.scaleDefinitionHash ? 'method.definitionHash' : null,
  ].filter((field): field is string => field !== null)
  if (mismatches.length > 0) throw new Error(`Bundle 量表 provenance 不匹配：${slotKey}/${mismatches.join(',')}`)
}

/**
 * Build Bundle evidence from completed ScaleResultV2 rows. A Scale slot is
 * read once; every registered score mapping is extracted from the same
 * authoritative result, preserving the multi-score Scale invariant.
 */
export const buildMentalHealthBundleScaleResults = (
  attempt: MentalHealthBundleAttemptInput,
  packageSnapshot: FrozenReportPackageSnapshot,
): FrozenBundleScaleEvidence[] => {
  const bundle = packageSnapshot.bundleDefinitionSnapshot
  const measurements = packageSnapshot.analysisProtocolSnapshot.scaleMeasurements
  if (!bundle || !Array.isArray(measurements)) throw new Error('Bundle 冻结 Scale measurement 缺失')
  const measurementsBySlot = new Map(measurements.map((measurement) => [measurement.slotKey, measurement]))
  const itemsByPosition = new Map(attempt.compositeAssessment.items.map((item) => [item.position, item]))
  const assessments = attempt.scaleAssessments ?? []
  const evidence: FrozenBundleScaleEvidence[] = []
  for (const slot of [...bundle.scaleSlots].sort((left, right) => left.position - right.position)) {
    const measurement = measurementsBySlot.get(slot.key)
    if (!measurement) throw new Error(`Bundle 快照缺少量表 measurement：${slot.key}`)
    const item = itemsByPosition.get(slot.position)
    if (!item || item.type !== 'SCALE' || item.required !== true || item.scaleId !== measurement.scaleId) {
      throw new Error(`Bundle 槽位未绑定必需量表：${slot.key}`)
    }
    const assessment = selectLatestScaleAssessment(assessments, item.id, measurement.scaleId)
    if (!assessment || assessment.status !== 'COMPLETED') {
      // Let the deterministic engine produce INSUFFICIENT_QUALITY from the
      // missing mappings rather than inventing a score or classification.
      continue
    }
    const result = resultFor(assessment, slot.key)
    validateResultProvenance(result, measurement, slot.key)
    const mappings: BundleEvidenceMappingDefinition[] = measurement.evidenceMappings?.length
      ? measurement.evidenceMappings as BundleEvidenceMappingDefinition[]
      : slot.mappings
    const extracted = extractBundleScaleEvidence({
      slotKey: slot.key,
      sourceResultId: assessment.id,
      compositeItemId: item.id,
      scaleId: measurement.scaleId,
      result,
      profile: packageSnapshot.profile,
      mappings,
      respondentType: measurement.respondentType,
    })
    evidence.push(...extracted.map((entry) => ({
      ...entry,
      provenance: {
        ...entry.provenance,
        attemptId: attempt.id,
        assessmentId: attempt.compositeAssessmentId,
        compositeItemId: item.id,
      },
    })))
  }
  return evidence
}
