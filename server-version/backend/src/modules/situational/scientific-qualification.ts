import { getScientificEvidenceRecord } from '../assessment-governance/scientific-evidence'
import { evaluateScientificQualification, type ScientificQualificationDecisionV1 } from '../assessment-governance/scientific-qualification'
import type { SituationPackage } from './situation-package.registry'
import { evaluateSituationalProductReadiness } from './product-readiness'

export const evaluateSituationalScientificQualification = (
  pkg: SituationPackage,
): ScientificQualificationDecisionV1 => {
  const evidence = getScientificEvidenceRecord({
    family: 'SITUATIONAL',
    key: pkg.key,
    version: pkg.instrumentVersion,
    scoringVersion: pkg.definition.scoring.scoringVersion,
  })
  return evaluateScientificQualification({
    productReadiness: evaluateSituationalProductReadiness(pkg),
    hasResearchFoundation: (evidence?.researchFoundationRefs.length ?? 0) > 0,
    hasTraceableProvenance: (evidence?.provenanceRefs.length ?? 0) > 0,
    hasEmpiricalReference: (evidence?.empiricalReferenceRefs.length ?? 0) > 0,
    hasFormalResearchOutput: (evidence?.researchOutputRefs.length ?? 0) > 0,
  })
}
