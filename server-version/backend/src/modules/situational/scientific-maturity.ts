import {
  DEFAULT_SCIENTIFIC_MATURITY,
  type ScientificMaturity,
} from '../assessment-governance/scientific-maturity'
import { getSituationPackage } from './situation-package.registry'

const identityKey = (instrumentKey: string, instrumentVersion: string): string => (
  `${instrumentKey}@${instrumentVersion}`
)

/**
 * Governance-only maturity overrides for exact Situational identities.
 * Executable packages retain their legacy PILOT marker for compatibility with
 * older Composite code; this registry is the authoritative maturity label.
 *
 * Current production content has no overrides. Promotion to RESEARCH_READY is
 * therefore a metadata change and cannot alter runner/scorer/FINAL behavior.
 */
export const SITUATIONAL_SCIENTIFIC_MATURITY_BY_IDENTITY = new Map<string, Exclude<ScientificMaturity, 'PILOT'>>()

export const resolveSituationalScientificMaturity = (
  instrumentKey: string,
  instrumentVersion: string,
): ScientificMaturity => {
  if (!getSituationPackage(instrumentKey, instrumentVersion)) {
    throw new Error(`Unknown situational scientific identity: ${identityKey(instrumentKey, instrumentVersion)}`)
  }
  return SITUATIONAL_SCIENTIFIC_MATURITY_BY_IDENTITY.get(identityKey(instrumentKey, instrumentVersion))
    ?? DEFAULT_SCIENTIFIC_MATURITY
}
