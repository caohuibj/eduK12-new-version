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
