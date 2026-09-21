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

interface CognitiveMaturityIdentityView {
  add(identity: string): CognitiveMaturityIdentityView
  delete(identity: string): boolean
  has(identity: string): boolean
}

const maturityIdentityView = (
  maturity: Exclude<CognitiveScientificStatus, 'PILOT'>,
): CognitiveMaturityIdentityView => ({
  add(identity: string) {
    COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.set(identity, maturity)
    return this
  },
  delete(identity: string) {
    if (COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.get(identity) !== maturity) return false
    return COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.delete(identity)
  },
  has(identity: string) {
    return COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.get(identity) === maturity
  },
})

/**
 * @deprecated Compatibility mutation view for older governance tests/callers.
 * It owns no state; every operation reads/writes the authoritative Map above.
 */
export const RESEARCH_READY_IDENTITIES = maturityIdentityView('RESEARCH_READY')

/**
 * @deprecated Compatibility mutation view for catalog-era callers.
 * It owns no state; every operation reads/writes the authoritative Map above.
 */
export const RESEARCH_GRADE_IDENTITIES = maturityIdentityView('RESEARCH_GRADE')

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
