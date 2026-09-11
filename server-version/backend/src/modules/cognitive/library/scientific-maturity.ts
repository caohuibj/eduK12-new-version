import { getCognitiveRegistryEntry } from '../cognitive.registry'
import { RESEARCH_GRADE_IDENTITIES } from './catalog'
import type { CognitiveScientificStatus } from './catalog-contract'

const identityKey = (testType: string, engineVersion: string, scoringVersion: string): string => (
  `${testType}/${engineVersion}/${scoringVersion}`
)

/**
 * Current-stage exact identities explicitly reviewed as RESEARCH_READY.
 * Empty by default: publication never implies research readiness.
 *
 * RESEARCH_GRADE_IDENTITIES remains the existing future-higher-bar allowlist;
 * this adapter preserves that source rather than creating a second grade truth.
 */
export const RESEARCH_READY_IDENTITIES = new Set<string>()

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
  const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  if (!entry || testType === 'fake') throw new Error(`Unknown cognitive catalog identity: ${identityKey(testType, engineVersion, scoringVersion)}`)
  const identity = identityKey(testType, engineVersion, scoringVersion)
  if (RESEARCH_GRADE_IDENTITIES.has(identity)) return 'RESEARCH_GRADE'
  if (RESEARCH_READY_IDENTITIES.has(identity)) return 'RESEARCH_READY'
  return 'PILOT'
}
