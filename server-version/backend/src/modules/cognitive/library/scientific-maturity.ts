import { getCognitiveRegistryEntry } from '../cognitive.registry'
import type { CognitiveScientificStatus } from './catalog-contract'

export const cognitiveScientificMaturityIdentityKey = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): string => `${testType}/${engineVersion}/${scoringVersion}`

/**
 * The single authoritative Cognitive scientific-maturity source.
 *
 * Entries are exact identity scoped. Missing entries are deliberately PILOT;
 * a new engine/scoring identity never inherits an older identity's review.
 * This registry is governance metadata only and must not affect runtime,
 * product readiness, publication, scoring, FINAL, or report computation.
 */
export const COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY = new Map<string, CognitiveScientificStatus>()

/**
 * Governance-only resolver. New/unreviewed exact identities default to PILOT;
 * a substantive engine/scoring identity change therefore cannot inherit an
 * older identity's maturity.
 */
export const resolveCognitiveScientificMaturity = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveScientificStatus => {
  const identity = cognitiveScientificMaturityIdentityKey(testType, engineVersion, scoringVersion)
  const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  if (!entry || testType === 'fake') throw new Error(`Unknown cognitive catalog identity: ${identity}`)
  return COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.get(identity) ?? 'PILOT'
}
