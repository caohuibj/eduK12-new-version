import { legacySituationalScientificContext } from './onboarding/scientific-schema'
import { situationalExecutionRef } from './onboarding/scientific-qualification'
import { scientificEvidenceDigest } from './onboarding/scientific-governance'
import { DEFAULT_SCIENTIFIC_MATURITY, type ScientificMaturity } from '../assessment-governance/scientific-maturity'
import { getSituationPackage } from './situation-package.registry'
import { getSituationalScientificDeclaration } from './onboarding/scientific-registry'

/** Current catalog governance. Historical projections must use frozen context. */
export const resolveSituationalScientificMaturity = (
  instrumentKey: string,
  instrumentVersion: string,
): ScientificMaturity => {
  if (!getSituationPackage(instrumentKey, instrumentVersion)) {
    throw new Error(`Unknown situational scientific identity: ${instrumentKey}@${instrumentVersion}`)
  }
  // Explicit E2E fixtures have no production scientific declaration.
  return getSituationalScientificDeclaration(instrumentKey, instrumentVersion)?.scientificMaturity
    ?? DEFAULT_SCIENTIFIC_MATURITY
}

export const resolveSituationalScientificContext = (pkg: import('./situation-package').SituationPackage) => {
  const declaration = getSituationalScientificDeclaration(pkg.key, pkg.instrumentVersion)
  if (!declaration) return undefined // explicit fixtures; historical legacy is never backfilled
  return {
    schemaVersion: 1 as const,
    scientificMaturity: declaration.scientificMaturity,
    governanceRevision: declaration.governanceRevision,
    scope: declaration.claimScope,
    executionRef: situationalExecutionRef(pkg),
    evidenceDigest: scientificEvidenceDigest(declaration),
    ...(declaration.review ? { reviewUrl: declaration.review.reviewUrl } : {}),
  }
}

export const currentSituationalScientificProjection = (pkg: import('./situation-package').SituationPackage) => {
  const context = resolveSituationalScientificContext(pkg)
  return context ? { ...context, provenance: 'CURRENT' as const } : legacySituationalScientificContext()
}
