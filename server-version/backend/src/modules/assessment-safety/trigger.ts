import { safetyFail } from './errors'
import type {
  SafetyPolicyTemplateV1,
  SafetyTriggerSignalV1,
  SafetyTriggerSourceKindV1,
} from './types'
import { validateSafetyPolicyTemplate } from './policy'

const HEX = /^[0-9a-f]{64}$/

/**
 * Evaluate whether a SafetyCase should be opened.
 * First production Bundles keep productionTriggerEnabled=false → never trigger.
 * Ordinary low scores must not trigger. Only authoritative SAFETY signals /
 * test-only fixture flags may open a case.
 */
export const evaluateSafetyTrigger = (input: {
  policy: SafetyPolicyTemplateV1
  sourceKind: SafetyTriggerSourceKindV1
  sourceHash: string
  bundleKey?: string | null
  bundleVersion?: string | null
  /** Required for subject/analysis uniqueness — e.g. analysisSnapshotId / sourceRecordId. */
  sourceRecordId?: string | null
  /** From BundleReportFacts Evidence.role=SAFETY or engine SAFETY_ESCALATION — not raw. */
  authoritativeSafetySignal: boolean
  /** Explicit test-only fixture flag. */
  testFixtureForceTrigger?: boolean
  notes?: string[]
}): SafetyTriggerSignalV1 | null => {
  const policy = validateSafetyPolicyTemplate(input.policy)
  if (policy.status !== 'APPROVED') return null
  if (!HEX.test(input.sourceHash)) safetyFail('SAFETY_INPUT', 'sourceHash must be 64 hex')

  if (!policy.productionTriggerEnabled) {
    // Production Bundles: never trigger unless this is the test-only fixture path.
    if (!(policy.testOnlyAuthoritativeFixture && input.testFixtureForceTrigger === true)) {
      return null
    }
  } else if (!input.authoritativeSafetySignal && input.testFixtureForceTrigger !== true) {
    return null
  }

  if (!input.authoritativeSafetySignal && input.testFixtureForceTrigger !== true) {
    return null
  }

  return {
    sourceKind: input.sourceKind,
    sourceHash: input.sourceHash,
    bundleKey: input.bundleKey ?? null,
    bundleVersion: input.bundleVersion ?? null,
    sourceRecordId: input.sourceRecordId?.trim() || null,
    safetyFlag: true,
    notes: [
      ...(input.notes ?? []),
      policy.testOnlyAuthoritativeFixture ? 'test-only authoritative fixture' : 'production safety signal',
    ],
  }
}

/**
 * Idempotency must include subject + analysis-instance identity so that:
 * - same content hash across different subjects does not collide
 * - same hash reanalysis with a different analysisSnapshotId opens a NEW case
 */
export const buildSafetyIdempotencyKey = (input: {
  subjectUserId: string
  sourceKind: SafetyTriggerSourceKindV1
  sourceHash: string
  sourceRecordId: string | null | undefined
  policyKey: string
  policyVersion: string
}): string => {
  if (!input.subjectUserId.trim()) safetyFail('SAFETY_INPUT', 'subjectUserId required for idempotency')
  const recordId = input.sourceRecordId?.trim() || 'missing-source-record'
  return [
    `subject:${input.subjectUserId}`,
    input.sourceKind,
    input.sourceHash,
    `record:${recordId}`,
    `${input.policyKey}@${input.policyVersion}`,
  ].join('|')
}
