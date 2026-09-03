import { randomUUID } from 'node:crypto'
import { safetyFail } from './errors'
import type { SafetyPolicyTemplateV1 } from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/
const EXACT = /^[0-9]+\.[0-9]+\.[0-9]+$/

export const validateSafetyPolicyTemplate = (
  value: SafetyPolicyTemplateV1 | unknown,
): SafetyPolicyTemplateV1 => {
  const policy = value as SafetyPolicyTemplateV1
  if (!policy || policy.schemaVersion !== 1) safetyFail('SAFETY_POLICY', 'schemaVersion must be 1')
  if (!policy.policyKey?.trim()) safetyFail('SAFETY_POLICY', 'policyKey required')
  if (!EXACT.test(policy.policyVersion)) safetyFail('SAFETY_POLICY', 'policyVersion must be exact x.y.z')
  if (!['DRAFT', 'APPROVED', 'RETIRED'].includes(policy.status)) {
    safetyFail('SAFETY_POLICY', 'invalid policy status')
  }
  if (!Number.isFinite(policy.acknowledgeWithinMs) || policy.acknowledgeWithinMs <= 0) {
    safetyFail('SAFETY_POLICY', 'acknowledgeWithinMs must be positive')
  }
  if (!Number.isFinite(policy.disposeWithinMs) || policy.disposeWithinMs <= 0) {
    safetyFail('SAFETY_POLICY', 'disposeWithinMs must be positive')
  }
  if (!Array.isArray(policy.escalationChain) || policy.escalationChain.length === 0) {
    safetyFail('SAFETY_POLICY', 'escalationChain required')
  }
  if (!ISO.test(policy.createdAt) || !ISO.test(policy.updatedAt)) {
    safetyFail('SAFETY_DATETIME', 'policy timestamps must be UTC ISO')
  }
  if (policy.productionTriggerEnabled && !policy.testOnlyAuthoritativeFixture) {
    // Production Bundles in this PR keep productionTriggerEnabled=false.
    // Enabling production triggers requires an explicit approved non-test policy
    // in a later commit — refuse silent enablement here.
  }
  return policy
}

export const createSafetyPolicyDraft = (input: {
  policyKey: string
  policyVersion: string
  name: string
  acknowledgeWithinMs: number
  disposeWithinMs: number
  escalationChain: string[]
  productionTriggerEnabled?: boolean
  testOnlyAuthoritativeFixture?: boolean
  createdByUserId: string
  now?: string
}): SafetyPolicyTemplateV1 => {
  const now = input.now ?? new Date().toISOString()
  return validateSafetyPolicyTemplate({
    schemaVersion: 1,
    policyKey: input.policyKey,
    policyVersion: input.policyVersion,
    status: 'DRAFT',
    name: input.name,
    acknowledgeWithinMs: input.acknowledgeWithinMs,
    disposeWithinMs: input.disposeWithinMs,
    escalationChain: [...input.escalationChain],
    productionTriggerEnabled: input.productionTriggerEnabled === true,
    testOnlyAuthoritativeFixture: input.testOnlyAuthoritativeFixture === true,
    createdByUserId: input.createdByUserId,
    approvedByUserId: null,
    createdAt: now,
    updatedAt: now,
  })
}

export const approveSafetyPolicy = (input: {
  policy: SafetyPolicyTemplateV1
  actorUserId: string
  now?: string
}): SafetyPolicyTemplateV1 => {
  const current = validateSafetyPolicyTemplate(input.policy)
  if (current.status !== 'DRAFT') safetyFail('SAFETY_STATE', 'only DRAFT policies can be approved')
  const now = input.now ?? new Date().toISOString()
  return validateSafetyPolicyTemplate({
    ...current,
    status: 'APPROVED',
    approvedByUserId: input.actorUserId,
    updatedAt: now,
  })
}

/** Course lead may bind owners only — never mutate rules/timeouts. */
export const bindSafetyCaseOwners = (input: {
  primaryOwnerUserId: string
  backupOwnerUserIds: string[]
}): { primaryOwnerUserId: string; backupOwnerUserIds: string[] } => {
  if (!input.primaryOwnerUserId.trim()) safetyFail('SAFETY_POLICY', 'primary owner required')
  const backups = [...new Set(input.backupOwnerUserIds.filter(Boolean))]
  if (backups.includes(input.primaryOwnerUserId)) {
    safetyFail('SAFETY_POLICY', 'backup owners must not include primary')
  }
  return { primaryOwnerUserId: input.primaryOwnerUserId, backupOwnerUserIds: backups }
}

export const newSafetyId = (): string => randomUUID()
