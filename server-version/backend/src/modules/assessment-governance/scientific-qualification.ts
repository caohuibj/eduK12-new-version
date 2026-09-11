/**
 * Scientific maturity qualification is governance-only and intentionally
 * orthogonal to product release/runtime availability.
 *
 * The evaluator consumes already-resolved facts. It performs no I/O and must
 * never become part of save/scorer/FINAL request paths.
 */
import { SCIENTIFIC_MATURITY_LEVELS, type ScientificMaturity } from './scientific-maturity'
import type { ProductReadinessDecisionV1 } from './product-readiness'

export interface ScientificQualificationFactsV1 {
  productReadiness: ProductReadinessDecisionV1
  /** Literature, formal protocol, research design or preregistration. */
  hasResearchFoundation: boolean
  /** Provenance/ownership/license basis is explicitly traceable. */
  hasTraceableProvenance: boolean
  /** Version-bound empirical reference/norm evidence from observed data. */
  hasEmpiricalReference: boolean
  /** Paper/preprint/working paper/formal validation or research report. */
  hasFormalResearchOutput: boolean
}

export interface ScientificQualificationLevelDecisionV1 {
  eligible: boolean
  blockers: string[]
}

export interface ScientificQualificationDecisionV1 {
  pilot: ScientificQualificationLevelDecisionV1
  researchReady: ScientificQualificationLevelDecisionV1
  researchGrade: ScientificQualificationLevelDecisionV1
  maxEligibleMaturity: ScientificMaturity | null
}

const decision = (blockers: string[]): ScientificQualificationLevelDecisionV1 => ({
  eligible: blockers.length === 0,
  blockers,
})

const scientificMaturityRank = (maturity: ScientificMaturity): number => (
  SCIENTIFIC_MATURITY_LEVELS.indexOf(maturity)
)

/**
 * Governance/admin/CI helper only. A declared scientific claim is valid only
 * when the evidence evaluator reaches at least the same level. DRAFT content
 * with the compatibility-default PILOT label is intentionally handled by the
 * inventory caller rather than being treated as an earned maturity claim here.
 */
export const qualificationAllowsScientificMaturity = (
  declared: ScientificMaturity,
  qualification: ScientificQualificationDecisionV1,
): boolean => (
  qualification.maxEligibleMaturity !== null
  && scientificMaturityRank(declared) <= scientificMaturityRank(qualification.maxEligibleMaturity)
)

export const evaluateScientificQualification = (
  facts: ScientificQualificationFactsV1,
): ScientificQualificationDecisionV1 => {
  const pilotBlockers = facts.productReadiness.ready
    ? []
    : ['PRODUCT_NOT_READY']
  const pilot = decision(pilotBlockers)

  const researchReadyBlockers = [
    ...(!pilot.eligible ? ['PILOT_NOT_ELIGIBLE'] : []),
    ...(!facts.hasResearchFoundation ? ['RESEARCH_FOUNDATION_MISSING'] : []),
    ...(!facts.hasTraceableProvenance ? ['TRACEABLE_PROVENANCE_MISSING'] : []),
  ]
  const researchReady = decision(researchReadyBlockers)

  const researchGradeBlockers = [
    ...(!researchReady.eligible ? ['RESEARCH_READY_NOT_ELIGIBLE'] : []),
    ...(!facts.hasEmpiricalReference ? ['EMPIRICAL_REFERENCE_MISSING'] : []),
    ...(!facts.hasFormalResearchOutput ? ['FORMAL_RESEARCH_OUTPUT_MISSING'] : []),
  ]
  const researchGrade = decision(researchGradeBlockers)

  const maxEligibleMaturity: ScientificMaturity | null = researchGrade.eligible
    ? 'RESEARCH_GRADE'
    : researchReady.eligible
      ? 'RESEARCH_READY'
      : pilot.eligible
        ? 'PILOT'
        : null

  return { pilot, researchReady, researchGrade, maxEligibleMaturity }
}
