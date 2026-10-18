import type { Prisma } from '@prisma/client'

/** Select every marker together. Omission is not evidence of a legacy row. */
export const TRAINING_VARIANT_DEFINITION_MARKER_SELECT = {
  trainingFlowDraft: true, trainingFlowFrozen: true, trainingFlowDigest: true,
  trainingVariantDraft: true,
  trainingVariantFrozen: true,
  trainingVariantDigest: true,
} as const satisfies Prisma.CompositeAssessmentSelect

export const TRAINING_VARIANT_PARENT_MARKER_SELECT = {
  id: true,
  trainingFlowSnapshotEncrypted: true, trainingFlowSnapshotHash: true,
  trainingFlowPathEncrypted: true, trainingFlowPathHash: true,
  trainingVariantAllocationEncrypted: true,
  trainingVariantAllocationHash: true,
  compositeAssessment: { select: TRAINING_VARIANT_DEFINITION_MARKER_SELECT },
} as const satisfies Prisma.CompositeAssessmentAttemptSelect

export type TrainingVariantDefinitionMarkers = Prisma.CompositeAssessmentGetPayload<{
  select: typeof TRAINING_VARIANT_DEFINITION_MARKER_SELECT
}>
export type TrainingVariantParentMarkers = Prisma.CompositeAssessmentAttemptGetPayload<{
  select: typeof TRAINING_VARIANT_PARENT_MARKER_SELECT
}>
export type TrainingVariantMarkerState = 'UNKNOWN' | 'LEGACY' | 'VARIANT'

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const markerValue = (value: Record<string, unknown> | null, field: string): unknown =>
  value && Object.prototype.hasOwnProperty.call(value, field) ? value[field] : undefined

/** UNKNOWN includes any unselected/undefined field, even beside nonnull markers. */
export function trainingVariantMarkerState(attempt: unknown, composite?: unknown): TrainingVariantMarkerState {
  const parent = record(attempt)
  const definition = record(composite === undefined ? parent?.compositeAssessment : composite)
  const values = [
    markerValue(parent, 'trainingFlowSnapshotEncrypted'), markerValue(parent, 'trainingFlowSnapshotHash'),
    markerValue(parent, 'trainingFlowPathEncrypted'), markerValue(parent, 'trainingFlowPathHash'),
    markerValue(definition, 'trainingFlowDraft'), markerValue(definition, 'trainingFlowFrozen'), markerValue(definition, 'trainingFlowDigest'),
    markerValue(parent, 'trainingVariantAllocationEncrypted'),
    markerValue(parent, 'trainingVariantAllocationHash'),
    markerValue(definition, 'trainingVariantDraft'),
    markerValue(definition, 'trainingVariantFrozen'),
    markerValue(definition, 'trainingVariantDigest'),
  ]
  if (values.some(value => value === undefined)) return 'UNKNOWN'
  return values.every(value => value === null) ? 'LEGACY' : 'VARIANT'
}
