import { canonicalHash } from '../../assessment-runtime/canonical'
import { qualificationAllowsScientificMaturity } from '../../assessment-governance/scientific-qualification'
import { projectSituationPackage, type SituationalInstrumentSourceV1 } from './schema'
import { evaluateScopedSituationalQualification } from './scientific-qualification'
import type { SituationalScientificDeclarationV1 } from './scientific-schema'

/** Covers evidence, claims, limitations and revision; excludes the receipt itself. */
export const scientificEvidenceDigest = (declaration: SituationalScientificDeclarationV1): string => {
  const { review: _review, ...claim } = declaration
  return canonicalHash(claim)
}
export function evaluateSituationalScientificGovernance(source: SituationalInstrumentSourceV1) {
  const declaration = source.scientific
  const qualification = evaluateScopedSituationalQualification(projectSituationPackage(source), declaration)
  const errors: string[] = []
  if (qualification.excludedEvidenceIds.length) errors.push('SCIENTIFIC_EVIDENCE_SCOPE_MISMATCH')
  if (!qualificationAllowsScientificMaturity(declaration.scientificMaturity, qualification)) errors.push('SCIENTIFIC_OVERCLAIM')
  const review = declaration.review
  if (declaration.scientificMaturity !== 'PILOT' && !review) errors.push('SCIENTIFIC_REVIEW_REQUIRED')
  if (review && (
    canonicalHash(review.executionRef) !== canonicalHash(qualification.executionRef)
    || review.evidenceDigest !== scientificEvidenceDigest(declaration)
    || review.targetMaturity !== declaration.scientificMaturity
    || review.governanceRevision !== declaration.governanceRevision
    || canonicalHash(review.scope) !== canonicalHash(declaration.claimScope)
  )) errors.push('SCIENTIFIC_REVIEW_STALE')
  return {
    ...qualification, valid: errors.length === 0, errors,
    evidenceDigest: scientificEvidenceDigest(declaration),
    blockersToNextTier: qualification.maxEligibleMaturity === 'PILOT' ? qualification.researchReady.blockers : qualification.maxEligibleMaturity === 'RESEARCH_READY' ? qualification.researchGrade.blockers : [],
    reviewValidity: review ? (errors.length ? 'INVALID' : 'BOUND_PENDING_AUTHORITY') : declaration.scientificMaturity === 'PILOT' ? 'NOT_REQUIRED' : 'MISSING',
  }
}

export function scientificRevisionIssues(previous: readonly SituationalInstrumentSourceV1[], next: readonly SituationalInstrumentSourceV1[]): string[] {
  const issues: string[] = []
  for (const old of previous) {
    const id = old.content.identity
    const current = next.find(s => s.content.identity.instrumentKey === id.instrumentKey && s.content.identity.instrumentVersion === id.instrumentVersion)
    if (!current) continue // released-identity deletion is checked by the publication gate
    const before = old.scientific, after = current.scientific
    if (canonicalHash(before) === canonicalHash(after)) continue
    if (after.governanceRevision <= before.governanceRevision) issues.push(`SCIENTIFIC_REVISION_NOT_INCREASED:${id.instrumentKey}`)
    if (!after.changeReason) issues.push(`SCIENTIFIC_CHANGE_REASON_REQUIRED:${id.instrumentKey}`)
  }
  return issues
}
