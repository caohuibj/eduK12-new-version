import type { ScientificQualificationDecisionV1 } from '../../assessment-governance/scientific-qualification'
import { canonicalHash } from '../../assessment-runtime/canonical'
import type { ScalePackageV2 } from '../scale-package.registry'
import { evaluateScaleProductReadiness } from './product-readiness'
import { getScaleInstrumentSource } from '../onboarding/instrument-registry'
import { projectScalePackage } from '../onboarding/define-instrument'
import type { ScaleInstrumentSourceV1 } from '../onboarding/types'
import { evaluateResearchGradeReadiness } from './research-readiness'

/** Recompute after any change to the exact claim; never part of runtime identity. */
export const scaleScientificReviewScopeHash = (source: ScaleInstrumentSourceV1): string => {
  const review = source.scientificReview
  return canonicalHash({
    identity: source.identity, definition: source.executable?.definition ?? null,
    localization: source.localization ?? null, applicability: source.applicability ?? null, population: source.catalog.population,
    intendedUses: [...(review?.intendedUses ?? [])].sort(), territory: review?.territory ?? null,
    evidence: source.catalog.evidence.filter(row => review?.evidenceIds.includes(row.evidenceId)).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
  })
}

/** Single authority for CI, publish and admin preview. Scientific claims do not gate FINAL. */
export const evaluateScaleSourceScientificQualification = (source: ScaleInstrumentSourceV1): ScientificQualificationDecisionV1 => {
  const pkg = projectScalePackage(source)
  const pilotBlockers = pkg && evaluateScaleProductReadiness(pkg).ready ? [] : ['PRODUCT_NOT_READY']
  const review = source.scientificReview
  const readyBlockers = [...pilotBlockers]
  if (!review) readyBlockers.push('SCIENTIFIC_REVIEW_MISSING')
  else {
    if (!review.reviewer.trim() || !Number.isFinite(Date.parse(review.reviewedAt))) readyBlockers.push('SCIENTIFIC_REVIEW_INVALID')
    if (review.scopeHash !== scaleScientificReviewScopeHash(source)) readyBlockers.push('SCIENTIFIC_REVIEW_STALE')
    if (!review.intendedUses.length || new Set(review.intendedUses).size !== review.intendedUses.length
      || review.intendedUses.some(use => !source.catalog.intendedUse.intendedUses.some(row => row.use === use && row.evidenceStatus === 'SUPPORTED')))
      readyBlockers.push('SCIENTIFIC_CLAIM_USE_INVALID')
    const claimedUses = source.catalog.intendedUse.intendedUses.filter(row => row.evidenceStatus === 'SUPPORTED').map(row => row.use)
    if (claimedUses.some(use => !review.intendedUses.includes(use))) readyBlockers.push('SCIENTIFIC_SUPPORTED_USE_NOT_REVIEWED')
    const evidence = source.catalog.evidence.filter(row => review.evidenceIds.includes(row.evidenceId))
    if (!review.evidenceIds.length || new Set(review.evidenceIds).size !== review.evidenceIds.length || evidence.length !== new Set(review.evidenceIds).size
      || evidence.some(row => !row.citation.trim() || row.locale !== source.executable?.contentLocale || row.territory !== review.territory))
      readyBlockers.push('SCIENTIFIC_EVIDENCE_SCOPE_INVALID')
  }
  if (source.localization?.reviewStatus !== 'APPROVED') readyBlockers.push('LOCALIZATION_REVIEW_PENDING')
  const gradeBlockers = [...readyBlockers]
  if (review?.approvedMaturity !== 'RESEARCH_GRADE') gradeBlockers.push('RESEARCH_GRADE_REVIEW_MISSING')
  if (review) {
    const readiness = evaluateResearchGradeReadiness({
      intendedUses: review.intendedUses,
      evidence: source.catalog.evidence.filter(row => review.evidenceIds.includes(row.evidenceId)),
      deployment: { locale: source.executable?.contentLocale ?? '', territory: review.territory },
    })
    if (readiness.status !== 'READY') gradeBlockers.push(...readiness.gaps)
  }
  return {
    pilot: { eligible: !pilotBlockers.length, blockers: pilotBlockers },
    researchReady: { eligible: !readyBlockers.length, blockers: [...new Set(readyBlockers)] },
    researchGrade: { eligible: !gradeBlockers.length, blockers: [...new Set(gradeBlockers)] },
    maxEligibleMaturity: !gradeBlockers.length ? 'RESEARCH_GRADE' : !readyBlockers.length ? 'RESEARCH_READY' : !pilotBlockers.length ? 'PILOT' : null,
  }
}

export const evaluateScaleScientificQualification = (pkg: ScalePackageV2): ScientificQualificationDecisionV1 => {
  const source = getScaleInstrumentSource(pkg.key, pkg.instrumentVersion)
  if (!source) return { pilot: { eligible: false, blockers: ['SOURCE_MISSING'] }, researchReady: { eligible: false, blockers: ['SOURCE_MISSING'] }, researchGrade: { eligible: false, blockers: ['SOURCE_MISSING'] }, maxEligibleMaturity: null }
  return evaluateScaleSourceScientificQualification({ ...source, executable: { ...source.executable!, ...pkg } })
}
