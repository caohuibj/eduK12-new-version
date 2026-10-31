import { describe, expect, it } from 'vitest'
import {
  TRAINING_VARIANT_DEFINITION_MARKER_SELECT,
  TRAINING_VARIANT_PARENT_MARKER_SELECT,
  trainingVariantMarkerState,
  type TrainingVariantParentMarkers,
} from '../../modules/composite/training-variant-markers'

const legacy = (): TrainingVariantParentMarkers => ({
  id: 'attempt',
  trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null,
  trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
  trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
  compositeAssessment: { trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null },
})
const fields = [
  ['parent', 'trainingFlowSnapshotEncrypted'], ['parent', 'trainingFlowSnapshotHash'],
  ['parent', 'trainingFlowPathEncrypted'], ['parent', 'trainingFlowPathHash'],
  ['definition', 'trainingFlowDraft'], ['definition', 'trainingFlowFrozen'], ['definition', 'trainingFlowDigest'],
  ['parent', 'trainingVariantAllocationEncrypted'], ['parent', 'trainingVariantAllocationHash'],
  ['definition', 'trainingVariantDraft'], ['definition', 'trainingVariantFrozen'], ['definition', 'trainingVariantDigest'],
] as const

describe('Training variant marker projection contract', () => {
  it('requires all twelve explicit nulls for LEGACY', () => {
    expect(trainingVariantMarkerState(legacy())).toBe('LEGACY')
    expect(trainingVariantMarkerState(null)).toBe('UNKNOWN')
    expect(trainingVariantMarkerState({})).toBe('UNKNOWN')
    expect(trainingVariantMarkerState({ compositeAssessment: {} })).toBe('UNKNOWN')
  })
  it.each(fields)('treats missing %s.%s as UNKNOWN', (owner, field) => {
    const row: any = legacy()
    delete (owner === 'parent' ? row : row.compositeAssessment)[field]
    expect(trainingVariantMarkerState(row)).toBe('UNKNOWN')
  })
  it.each(fields)('treats undefined %s.%s as UNKNOWN', (owner, field) => {
    const row: any = legacy()
    ;(owner === 'parent' ? row : row.compositeAssessment)[field] = undefined
    expect(trainingVariantMarkerState(row)).toBe('UNKNOWN')
  })
  it.each(fields)('treats nonnull %s.%s as VARIANT once the projection is complete', (owner, field) => {
    const row: any = legacy()
    ;(owner === 'parent' ? row : row.compositeAssessment)[field] = 'marker'
    expect(trainingVariantMarkerState(row)).toBe('VARIANT')
  })
  it('does not let a nonnull allocation mask missing definition metadata', () => {
    const row: any = legacy()
    row.trainingVariantAllocationEncrypted = 'encrypted'
    delete row.compositeAssessment.trainingVariantDigest
    expect(trainingVariantMarkerState(row)).toBe('UNKNOWN')
  })
  it('accepts the separately loaded definition and requires its own fields', () => {
    const row = legacy(), definition = row.compositeAssessment
    const { compositeAssessment: _, ...attempt } = row
    expect(trainingVariantMarkerState(attempt, definition)).toBe('LEGACY')
    expect(trainingVariantMarkerState(attempt, Object.create(definition))).toBe('UNKNOWN')
  })
  it('keeps both generated Prisma selectors on the complete marker shape', () => {
    // creationKey identifies the source definition; it is not a variant marker.
    expect(TRAINING_VARIANT_DEFINITION_MARKER_SELECT).toEqual({ creationKey: true,
      ...Object.fromEntries(fields.filter(([owner]) => owner === 'definition').map(([, field]) => [field, true])) })
    expect(TRAINING_VARIANT_PARENT_MARKER_SELECT).toEqual({ id: true,
      trainingContentBindingHash: true, trainingReferenceBindingHash: true,
      trainingFlowSnapshotEncrypted: true, trainingFlowSnapshotHash: true,
      trainingFlowPathEncrypted: true, trainingFlowPathHash: true, trainingVariantAllocationEncrypted: true,
      trainingVariantAllocationHash: true, compositeAssessment: { select: TRAINING_VARIANT_DEFINITION_MARKER_SELECT } })
  })
})
