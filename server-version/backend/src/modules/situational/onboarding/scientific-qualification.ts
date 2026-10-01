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
  const scoped = declaration.evidence.filter(evidence => (
    canonicalHash(evidence.executionRef) === canonicalHash(executionRef)
    && (!evidence.modelEvidence || (evidence.modelEvidence.modelKey === (pkg.definition.scoring.model?.modelKey ?? 'PROVISIONAL_SCALAR') && evidence.modelEvidence.modelVersion === (pkg.definition.scoring.model?.modelVersion ?? '1') && evidence.modelEvidence.parameterSetHash === pkg.definition.scoring.model?.parameterSet?.hash && evidence.modelEvidence.metricKeys.every(k => pkg.definition.scoring.publishedMetrics.some(m => m.key === k))))
    && scopeHash !== undefined && canonicalHash(evidence.scope) === scopeHash
  ))
  // Metric-specific artifacts cannot expand whole-instrument eligibility by themselves.
  const applicable = scoped.filter(e => !e.modelEvidence || pkg.definition.scoring.publishedMetrics.every(m => e.modelEvidence!.metricKeys.includes(m.key)))
  const metricEvidenceIds = Object.fromEntries(pkg.definition.scoring.publishedMetrics.map(m => [m.key, scoped.filter(e => !e.modelEvidence || e.modelEvidence.metricKeys.includes(m.key)).map(e => e.id)]))
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
    metricEvidenceIds,
    excludedEvidenceIds: declaration.evidence.filter(e => !applicable.includes(e)).map(e => e.id),
  }
}
