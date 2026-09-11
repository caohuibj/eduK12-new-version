import { compileScaleRuntime } from '../../assessment-runtime/compiler'
import {
  productNotReady,
  productReady,
  type ProductReadinessDecisionV1,
  type ProductReadinessIssueV1,
} from '../../assessment-governance/product-readiness'
import { validateScalePackage, type ScalePackageV2 } from '../scale-package.registry'

/**
 * Pure exact-package readiness audit. It deliberately ignores catalog evidence,
 * authorizations, territory, localization research status and scientific
 * maturity. Those belong to scientific qualification or deployment availability.
 */
export const evaluateScaleProductReadiness = (
  pkg: ScalePackageV2,
): ProductReadinessDecisionV1 => {
  const blockers: ProductReadinessIssueV1[] = []
  const validation = validateScalePackage(pkg)
  validation.issues
    .filter((candidate) => candidate.severity === 'error')
    .forEach((candidate) => blockers.push({
      stage: candidate.path.startsWith('goldenCases') ? 'SCORING' : 'DEFINITION',
      code: 'SCALE_PACKAGE_INVALID',
      message: `${candidate.path}: ${candidate.message}`,
    }))

  if (blockers.length === 0) {
    try {
      const runtime = compileScaleRuntime({
        instrumentKey: pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        sourceDefinitionHash: validation.definitionHash,
      })
      if (!runtime.runtimeCapabilities.supported) {
        blockers.push({
          stage: 'RUNTIME_COMPILE',
          code: 'SCALE_RUNTIME_UNSUPPORTED',
          message: 'compiled Scale runtime does not declare supported=true',
        })
      }
    } catch (error) {
      blockers.push({
        stage: 'RUNTIME_COMPILE',
        code: 'SCALE_RUNTIME_COMPILE_FAILED',
        message: error instanceof Error ? error.message : 'Scale runtime compile failed',
      })
    }
  }

  return blockers.length === 0 ? productReady() : productNotReady(blockers)
}
