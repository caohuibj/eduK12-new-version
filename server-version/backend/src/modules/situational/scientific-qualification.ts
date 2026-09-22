import type { SituationPackage } from './situation-package'
import { getSituationalScientificDeclaration } from './onboarding/scientific-registry'
import { evaluateScopedSituationalQualification } from './onboarding/scientific-qualification'
import { scientificSchema } from './onboarding/scientific-schema'

export const evaluateSituationalScientificQualification = (pkg: SituationPackage) => (
  evaluateScopedSituationalQualification(pkg, getSituationalScientificDeclaration(pkg.key, pkg.instrumentVersion)
    ?? scientificSchema.parse({ schemaVersion: 1, scientificMaturity: 'PILOT', governanceRevision: 1 }))
)
