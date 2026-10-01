import { canonicalHash } from '../../assessment-runtime/canonical'
import { hashScaleDefinition } from '../scale-definition'
import type { ScaleInstrumentSourceV1 } from '../onboarding/types'
/** Recompute after any change to the exact claim; never part of runtime identity. */
export const scaleScientificReviewScopeHash = (source: ScaleInstrumentSourceV1): string => {
  const review = source.scientificReview
  return canonicalHash({
    identity: source.identity, definition: source.executable?.definition.versionAxes ? hashScaleDefinition(source.executable.definition) : source.executable?.definition ?? null,
    localization: source.localization ?? null, applicability: source.applicability ?? null, population: source.catalog.population,
    intendedUses: [...(review?.intendedUses ?? [])].sort(), territory: review?.territory ?? null,
    evidence: source.catalog.evidence.filter(row => review?.evidenceIds.includes(row.evidenceId)).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
  })
}

