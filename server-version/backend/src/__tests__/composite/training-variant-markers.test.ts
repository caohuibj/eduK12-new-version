import { describe, expect, it } from 'vitest'
import {
  TRAINING_VARIANT_DEFINITION_MARKER_SELECT,
  TRAINING_VARIANT_PARENT_MARKER_SELECT,
  trainingVariantMarkerState,
  type TrainingVariantParentMarkers,
} from '../../modules/composite/training-variant-markers'

const legacy = (): TrainingVariantParentMarkers => ({
  id: 'attempt', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
  compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null },
})
const fields = [
  ['parent', 'trainingVariantAllocationEncrypted'], ['parent', 'trainingVariantAllocationHash'],
  ['definition', 'trainingVariantDraft'], ['definition', 'trainingVariantFrozen'], ['definition', 'trainingVariantDigest'],
] as const

describe('Training variant marker projection contract', () => {
  it('requires all five explicit nulls for LEGACY', () => {
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
    expect(Object.keys(TRAINING_VARIANT_DEFINITION_MARKER_SELECT)).toEqual(fields.filter(([owner]) => owner === 'definition').map(([, field]) => field))
    expect(TRAINING_VARIANT_PARENT_MARKER_SELECT).toEqual({ id: true, trainingVariantAllocationEncrypted: true,
      trainingVariantAllocationHash: true, compositeAssessment: { select: TRAINING_VARIANT_DEFINITION_MARKER_SELECT } })
  })
})
