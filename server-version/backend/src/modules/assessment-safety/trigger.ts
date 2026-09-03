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
    safetyFlag: true,
    notes: [
      ...(input.notes ?? []),
      policy.testOnlyAuthoritativeFixture ? 'test-only authoritative fixture' : 'production safety signal',
    ],
  }
}

export const buildSafetyIdempotencyKey = (input: {
  sourceKind: SafetyTriggerSourceKindV1
  sourceHash: string
  policyKey: string
  policyVersion: string
}): string => `${input.sourceKind}:${input.sourceHash}:${input.policyKey}@${input.policyVersion}`
