import { getScientificEvidenceRecord } from '../../assessment-governance/scientific-evidence'
import { evaluateScientificQualification, type ScientificQualificationDecisionV1 } from '../../assessment-governance/scientific-qualification'
import type { TaskDefinition } from '../v2/types'
import { evaluateCognitiveProductReadiness } from './product-readiness'

export const evaluateCognitiveScientificQualification = (
  definition: TaskDefinition<unknown, unknown>,
): ScientificQualificationDecisionV1 => {
  const evidence = getScientificEvidenceRecord({
    family: 'COGNITIVE',
    key: definition.testType,
    version: definition.engineVersion,
    scoringVersion: definition.scoringVersion,
  })
  return evaluateScientificQualification({
    productReadiness: evaluateCognitiveProductReadiness(definition),
    hasResearchFoundation: (evidence?.researchFoundationRefs.length ?? 0) > 0,
    hasTraceableProvenance: (evidence?.provenanceRefs.length ?? 0) > 0,
    hasEmpiricalReference: (evidence?.empiricalReferenceRefs.length ?? 0) > 0,
    hasFormalResearchOutput: (evidence?.researchOutputRefs.length ?? 0) > 0,
  })
}
