/**
 * Manual operational hold for exact assessment identities.
 *
 * This is intentionally an in-memory governance registry: checking a hold is
 * O(1), performs no database access and is suitable for the outer NEW START
 * admission boundary. Existing/frozen attempts must not consult this registry
 * during save, scorer, FINAL, result, history or export.
 */

export type AssessmentFamily = 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'

export interface AssessmentOperationalIdentityV1 {
  family: AssessmentFamily
  key: string
  version: string
}

export interface OperationalHoldV1 extends AssessmentOperationalIdentityV1 {
  reasonCode: string
  note?: string
  effectiveAt: string
}

const identityKey = (identity: AssessmentOperationalIdentityV1): string => (
  `${identity.family}:${identity.key}@${identity.version}`
)

/** Empty by default. Changes are deliberate code-reviewed operational actions. */
export const ASSESSMENT_OPERATIONAL_HOLDS = new Map<string, OperationalHoldV1>()

export const operationalIdentityKey = identityKey

export const getAssessmentOperationalHold = (
  identity: AssessmentOperationalIdentityV1,
): OperationalHoldV1 | undefined => ASSESSMENT_OPERATIONAL_HOLDS.get(identityKey(identity))

export const isAssessmentOperationallyPaused = (
  identity: AssessmentOperationalIdentityV1,
): boolean => getAssessmentOperationalHold(identity) !== undefined
