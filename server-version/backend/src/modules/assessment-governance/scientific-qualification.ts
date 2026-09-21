/**
 * Scientific maturity qualification is governance-only and intentionally
 * orthogonal to product release/runtime availability.
 *
 * The evaluator consumes evidence facts only. It performs no I/O, does not
 * inspect product readiness or release status, and must never become part of
 * save/scorer/FINAL request paths.
 */
import { SCIENTIFIC_MATURITY_LEVELS, type ScientificMaturity } from './scientific-maturity'

export interface ScientificQualificationFactsV1 {
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
  maxEligibleMaturity: ScientificMaturity
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
 * when the evidence evaluator reaches at least the same level. PILOT is the
 * default lowest evidence maturity and is always a valid scientific claim;
 * it says nothing about whether the product can be released or executed.
 */
export const qualificationAllowsScientificMaturity = (
  declared: ScientificMaturity,
  qualification: ScientificQualificationDecisionV1,
): boolean => (
  scientificMaturityRank(declared) <= scientificMaturityRank(qualification.maxEligibleMaturity)
)

export const evaluateScientificQualification = (
  facts: ScientificQualificationFactsV1,
): ScientificQualificationDecisionV1 => {
  // PILOT is the baseline scientific maturity, not a product-completeness gate.
  const pilot = decision([])

  const researchReadyBlockers = [
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

  const maxEligibleMaturity: ScientificMaturity = researchGrade.eligible
    ? 'RESEARCH_GRADE'
    : researchReady.eligible
      ? 'RESEARCH_READY'
      : 'PILOT'

  return { pilot, researchReady, researchGrade, maxEligibleMaturity }
}
