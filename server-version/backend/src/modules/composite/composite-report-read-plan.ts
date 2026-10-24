import { loadFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import { trainingVariantMarkerState } from './training-variant-markers'

export const OPTIONAL_REPORT_RELATIONS = ['cognitiveSessions', 'situationalAttempts', 'formAnswers', 'formSectionAttempts'] as const
export type OptionalReportRelation = typeof OPTIONAL_REPORT_RELATIONS[number]
export const OPTIONAL_REPORT_RELATION_COUNTS = {
  cognitiveSessions: true, situationalAttempts: true, formAnswers: true, formSectionAttempts: true,
} as const

/** Counts are read with the parent, not inferred from a mutable definition.
 * Invalid/unknown authority only disables the optimization; existing report
 * validation and legacy behavior still run with the complete relation graph. */
export async function emptyOptionalReportRelations(attempt: any): Promise<Set<OptionalReportRelation>> {
  const empty = new Set<OptionalReportRelation>()
  const definition = attempt.compositeAssessment
  if (attempt.status !== 'COMPLETED' || attempt.runtimeGeneration !== 'UNIFIED_V1'
    || attempt.deliveryMode !== 'FINAL_ONLY' || definition?.productKind !== 'QUESTIONNAIRE'
    || attempt.assignmentRef != null || definition.reportPackageKey != null || definition.analysisProtocolKey != null
    || trainingVariantMarkerState(attempt) !== 'LEGACY'
    || !Array.isArray(definition.items) || !Array.isArray(definition.formSections)
    || typeof attempt.frozenActiveSlotSetEncrypted !== 'string' || !attempt.frozenActiveSlotSetHash) return empty
  try {
    const slots = await loadFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted)
    if (slots.snapshotHash !== attempt.frozenActiveSlotSetHash || slots.attemptEpoch !== attempt.attemptEpoch
      || slots.runtimeGeneration !== attempt.runtimeGeneration) return empty
    const has = (type: string) => slots.slots.some(slot => slot.unitType === type)
      || definition.items.some((item: any) => item.type === type)
    if (!has('COGNITIVE') && attempt._count?.cognitiveSessions === 0) empty.add('cognitiveSessions')
    if (!has('SITUATIONAL') && attempt._count?.situationalAttempts === 0) empty.add('situationalAttempts')
    if (!has('FORM_SECTION') && !has('FORM') && definition.formSections.length === 0) {
      if (attempt._count?.formAnswers === 0) empty.add('formAnswers')
      if (attempt._count?.formSectionAttempts === 0) empty.add('formSectionAttempts')
    }
  } catch { /* Full reads retain the prior error/fallback behavior. */ }
  return empty
}
