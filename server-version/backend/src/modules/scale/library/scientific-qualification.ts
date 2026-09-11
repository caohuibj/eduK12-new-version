import { getScientificEvidenceRecord } from '../../assessment-governance/scientific-evidence'
import { evaluateScientificQualification, type ScientificQualificationDecisionV1 } from '../../assessment-governance/scientific-qualification'
import type { ScalePackageV2 } from '../scale-package.registry'
import { evaluateScaleProductReadiness } from './product-readiness'

export const evaluateScaleScientificQualification = (
  pkg: ScalePackageV2,
): ScientificQualificationDecisionV1 => {
  const evidence = getScientificEvidenceRecord({
    family: 'SCALE',
    key: pkg.key,
    version: pkg.instrumentVersion,
    scoringVersion: pkg.definition.scoring.scoringVersion,
  })
  return evaluateScientificQualification({
    productReadiness: evaluateScaleProductReadiness(pkg),
    hasResearchFoundation: (evidence?.researchFoundationRefs.length ?? 0) > 0,
    hasTraceableProvenance: (evidence?.provenanceRefs.length ?? 0) > 0,
    hasEmpiricalReference: (evidence?.empiricalReferenceRefs.length ?? 0) > 0,
    hasFormalResearchOutput: (evidence?.researchOutputRefs.length ?? 0) > 0,
  })
}
