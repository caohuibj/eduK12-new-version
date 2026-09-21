import { canonicalHash } from '../../assessment-runtime/canonical'
import { evaluateScientificQualification } from '../../assessment-governance/scientific-qualification'
import { hashSituationRuntimeDefinition } from '../situation-runtime-definition'
import type { SituationPackage } from '../situation-package'
import { scientificSchema, type SituationalScientificDeclarationV1, type SituationalExecutionRefV1 } from './scientific-schema'

export const situationalExecutionRef = (pkg: SituationPackage): SituationalExecutionRefV1 => ({
  instrumentKey: pkg.key,
  instrumentVersion: pkg.instrumentVersion,
  scorerKey: 'situational.default',
  scoringVersion: pkg.definition.scoring.scoringVersion,
  definitionHash: hashSituationRuntimeDefinition(pkg.definition),
})

/** Evidence eligibility only: no publication decision or automatic declaration. */
export function evaluateScopedSituationalQualification(pkg: SituationPackage, value: SituationalScientificDeclarationV1) {
  const declaration = scientificSchema.parse(value)
  const executionRef = situationalExecutionRef(pkg)
  const scopeHash = declaration.claimScope ? canonicalHash(declaration.claimScope) : undefined
  const applicable = declaration.evidence.filter(evidence => (
    canonicalHash(evidence.executionRef) === canonicalHash(executionRef)
    && scopeHash !== undefined && canonicalHash(evidence.scope) === scopeHash
  ))
  const has = (kind: SituationalScientificDeclarationV1['evidence'][number]['kind']) => applicable.some(e => e.kind === kind)
  const definitionProvenance = Boolean(
    (pkg.definition.source.title?.trim() || pkg.definition.source.citation?.trim())
    && pkg.definition.license.status !== 'unknown'
  )
  const qualification = evaluateScientificQualification({
    hasResearchFoundation: has('RESEARCH_FOUNDATION'),
    hasTraceableProvenance: definitionProvenance || has('PROVENANCE'),
    hasEmpiricalReference: has('EMPIRICAL_REFERENCE'),
    hasFormalResearchOutput: has('FORMAL_OUTPUT'),
  })
  return {
    ...qualification,
    declaredMaturity: declaration.scientificMaturity,
    governanceRevision: declaration.governanceRevision,
    scope: declaration.claimScope,
    executionRef,
    applicableEvidenceIds: applicable.map(e => e.id),
    excludedEvidenceIds: declaration.evidence.filter(e => !applicable.includes(e)).map(e => e.id),
  }
}
