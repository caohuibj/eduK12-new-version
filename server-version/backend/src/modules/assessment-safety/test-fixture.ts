/**
 * Test-only authoritative safety fixture for closed-loop acceptance.
 * First production Bundles must NOT trigger safety.
 */
import { approveSafetyPolicy, createSafetyPolicyDraft } from './policy'
import type { SafetyPolicyTemplateV1, SafetyTriggerSignalV1 } from './types'

export const TEST_ONLY_SAFETY_POLICY_KEY = 'test_only_safety_policy_v1' as const
export const TEST_ONLY_SAFETY_POLICY_VERSION = '1.0.0' as const

export const buildTestOnlySafetyPolicy = (input?: {
  createdByUserId?: string
  approverUserId?: string
  now?: string
}): SafetyPolicyTemplateV1 => {
  const draft = createSafetyPolicyDraft({
    policyKey: TEST_ONLY_SAFETY_POLICY_KEY,
    policyVersion: TEST_ONLY_SAFETY_POLICY_VERSION,
    name: 'Test-only authoritative Safety fixture',
    acknowledgeWithinMs: 60_000,
    disposeWithinMs: 300_000,
    escalationChain: ['backup-owner', 'admin-oncall'],
    productionTriggerEnabled: false,
    testOnlyAuthoritativeFixture: true,
    createdByUserId: input?.createdByUserId ?? 'admin-test',
    now: input?.now,
  })
  return approveSafetyPolicy({
    policy: draft,
    actorUserId: input?.approverUserId ?? 'admin-test-2',
    now: input?.now,
  })
}

export const buildTestOnlyAuthoritativeTrigger = (input: {
  sourceHash: string
  bundleKey?: string
  bundleVersion?: string
  sourceRecordId?: string | null
}): SafetyTriggerSignalV1 => ({
  sourceKind: 'BUNDLE_REPORT_FACTS',
  sourceHash: input.sourceHash,
  bundleKey: input.bundleKey ?? 'test_only_safety_bundle_v1',
  bundleVersion: input.bundleVersion ?? '1.0.0',
  sourceRecordId: input.sourceRecordId ?? 'test-source-record-1',
  safetyFlag: true,
  notes: ['test-only authoritative fixture signal — not a production Bundle'],
})
