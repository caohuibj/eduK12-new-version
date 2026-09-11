import { compileSituationRuntime } from '../assessment-runtime/compiler'
import {
  productNotReady,
  productReady,
  type ProductReadinessDecisionV1,
  type ProductReadinessIssueV1,
} from '../assessment-governance/product-readiness'
import { validateSituationPackage, type SituationPackage } from './situation-package.registry'

const isLegacyScientificOrProvenanceBlocker = (path: string): boolean => (
  path === 'source' || path === 'license' || path.startsWith('source.') || path.startsWith('license.')
)

/**
 * Exact-package executable audit. Scientific provenance is intentionally out
 * of scope. Legacy source/license errors emitted by validateSituationPackage
 * are filtered here while executable definition, presentation, scorer, golden
 * and report-integrity errors remain hard blockers.
 */
export const evaluateSituationalProductReadiness = (
  pkg: SituationPackage,
): ProductReadinessDecisionV1 => {
  const blockers: ProductReadinessIssueV1[] = []
  const validation = validateSituationPackage(pkg)
  validation.issues
    .filter((candidate) => candidate.severity === 'error' && !isLegacyScientificOrProvenanceBlocker(candidate.path))
    .forEach((candidate) => blockers.push({
      stage: candidate.path.startsWith('goldenCases') ? 'SCORING' : 'DEFINITION',
      code: 'SITUATIONAL_PACKAGE_INVALID',
      message: `${candidate.path}: ${candidate.message}`,
    }))

  if (blockers.length === 0) {
    try {
      const runtime = compileSituationRuntime({
        instrumentKey: pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        sourceDefinitionHash: validation.definitionHash,
      })
      if (!runtime.runtimeCapabilities.supported) {
        blockers.push({
          stage: 'RUNTIME_COMPILE',
          code: 'SITUATIONAL_RUNTIME_UNSUPPORTED',
          message: 'compiled Situational runtime does not declare supported=true',
        })
      }
    } catch (error) {
      blockers.push({
        stage: 'RUNTIME_COMPILE',
        code: 'SITUATIONAL_RUNTIME_COMPILE_FAILED',
        message: error instanceof Error ? error.message : 'Situational runtime compile failed',
      })
    }
  }

  return blockers.length === 0 ? productReady() : productNotReady(blockers)
}
