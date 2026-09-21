import { getScientificEvidenceRecord } from '../assessment-governance/scientific-evidence'
import { evaluateScientificQualification, type ScientificQualificationDecisionV1 } from '../assessment-governance/scientific-qualification'
import type { SituationPackage } from './situation-package.registry'

const hasText = (value: string | undefined): boolean => Boolean(value?.trim())

export const evaluateSituationalScientificQualification = (
  pkg: SituationPackage,
): ScientificQualificationDecisionV1 => {
  const evidence = getScientificEvidenceRecord({
    family: 'SITUATIONAL',
    key: pkg.key,
    version: pkg.instrumentVersion,
    scoringVersion: pkg.definition.scoring.scoringVersion,
  })
  const definitionProvenance = (
    (hasText(pkg.definition.source.title) || hasText(pkg.definition.source.citation))
    && pkg.definition.license.status !== 'unknown'
  )
  return evaluateScientificQualification({
    // Self-authored/provenanced content is not automatically research-based.
    // Situational Research Ready still requires an explicit literature,
    // research-design, protocol or preregistration evidence pointer.
    hasResearchFoundation: (evidence?.researchFoundationRefs.length ?? 0) > 0,
    hasTraceableProvenance: definitionProvenance
      || (evidence?.provenanceRefs.length ?? 0) > 0,
    hasEmpiricalReference: (evidence?.empiricalReferenceRefs.length ?? 0) > 0,
    hasFormalResearchOutput: (evidence?.researchOutputRefs.length ?? 0) > 0,
  })
}
