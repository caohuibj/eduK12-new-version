import { randomUUID } from 'node:crypto'
import { safetyFail } from './errors'
import { bindSafetyCaseOwners, newSafetyId, validateSafetyPolicyTemplate } from './policy'
import { buildSafetyIdempotencyKey } from './trigger'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyCaseStatusV1,
  SafetyPolicyTemplateV1,
  SafetyTriggerSignalV1,
} from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

const appendEvent = (
  caseId: string,
  type: SafetyCaseEventV1['type'],
  actorUserId: string,
  note: string,
  at: string,
  wakeupJobId: string | null = null,
): SafetyCaseEventV1 => ({
  eventId: randomUUID(),
  caseId,
  type,
  actorUserId,
  at,
  note,
  wakeupJobId,
})

export const assertCanViewSafetyCase = (input: {
  safetyCase: SafetyCaseRecordV1
  viewerUserId: string
  viewerRole: string
  isAuthorizedAdmin: boolean
}): void => {
  const allowed = (
    input.isAuthorizedAdmin
    || input.viewerUserId === input.safetyCase.primaryOwnerUserId
    || input.safetyCase.backupOwnerUserIds.includes(input.viewerUserId)
  )
  if (!allowed) safetyFail('SAFETY_UNAUTHORIZED', 'safety case invisible to unauthorized viewer')
}

/**
 * Atomic case create. Duplicate complete (same idempotency key) returns existing case.
 */
export const createSafetyCaseAtomic = (input: {
  policy: SafetyPolicyTemplateV1
  trigger: SafetyTriggerSignalV1
  subjectUserId: string
  primaryOwnerUserId: string
  backupOwnerUserIds: string[]
  existingByIdempotencyKey?: SafetyCaseRecordV1 | null
  priorCaseId?: string | null
  actorUserId: string
  now?: string
}): { safetyCase: SafetyCaseRecordV1; event: SafetyCaseEventV1; created: boolean } => {
  const policy = validateSafetyPolicyTemplate(input.policy)
  if (policy.status !== 'APPROVED') safetyFail('SAFETY_STATE', 'policy must be APPROVED')
  if (!input.trigger.safetyFlag) safetyFail('SAFETY_TRIGGER', 'trigger.safetyFlag required')
  const owners = bindSafetyCaseOwners({
    primaryOwnerUserId: input.primaryOwnerUserId,
    backupOwnerUserIds: input.backupOwnerUserIds,
  })
  const now = input.now ?? new Date().toISOString()
  if (!ISO.test(now)) safetyFail('SAFETY_DATETIME', 'now must be UTC ISO')

  const idempotencyKey = buildSafetyIdempotencyKey({
    sourceKind: input.trigger.sourceKind,
    sourceHash: input.trigger.sourceHash,
    policyKey: policy.policyKey,
    policyVersion: policy.policyVersion,
  })

  if (input.existingByIdempotencyKey) {
    if (input.existingByIdempotencyKey.idempotencyKey !== idempotencyKey) {
      safetyFail('SAFETY_IDEMPOTENT', 'existing case idempotency mismatch')
    }
    return {
      safetyCase: input.existingByIdempotencyKey,
      event: appendEvent(
        input.existingByIdempotencyKey.caseId,
        'CREATED',
        input.actorUserId,
        'idempotent duplicate create — existing case returned',
        now,
      ),
      created: false,
    }
  }

  const safetyCase: SafetyCaseRecordV1 = {
    schemaVersion: 1,
    caseId: newSafetyId(),
    policyKey: policy.policyKey,
    policyVersion: policy.policyVersion,
    status: 'OPEN',
    subjectUserId: input.subjectUserId,
    primaryOwnerUserId: owners.primaryOwnerUserId,
    backupOwnerUserIds: owners.backupOwnerUserIds,
    trigger: { ...input.trigger, notes: [...input.trigger.notes] },
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    acknowledgedAt: null,
    disposedAt: null,
    priorCaseId: input.priorCaseId ?? null,
  }
  return {
    safetyCase,
    event: appendEvent(safetyCase.caseId, 'CREATED', input.actorUserId, 'case created', now),
    created: true,
  }
}

const assertOwnerOrAdmin = (input: {
  safetyCase: SafetyCaseRecordV1
  actorUserId: string
  isAuthorizedAdmin: boolean
}): void => {
  assertCanViewSafetyCase({
    safetyCase: input.safetyCase,
    viewerUserId: input.actorUserId,
    viewerRole: input.isAuthorizedAdmin ? 'ADMIN' : 'TEACHER',
    isAuthorizedAdmin: input.isAuthorizedAdmin,
  })
}

export const acknowledgeSafetyCase = (input: {
  safetyCase: SafetyCaseRecordV1
  actorUserId: string
  isAuthorizedAdmin?: boolean
  note?: string
  now?: string
}): { safetyCase: SafetyCaseRecordV1; event: SafetyCaseEventV1 } => {
  assertOwnerOrAdmin({
    safetyCase: input.safetyCase,
    actorUserId: input.actorUserId,
    isAuthorizedAdmin: input.isAuthorizedAdmin === true,
  })
  if (input.safetyCase.status !== 'OPEN' && input.safetyCase.status !== 'ESCALATED') {
    safetyFail('SAFETY_STATE', 'only OPEN/ESCALATED cases can be acknowledged')
  }
  const now = input.now ?? new Date().toISOString()
  const next: SafetyCaseRecordV1 = {
    ...input.safetyCase,
    status: 'ACKNOWLEDGED',
    acknowledgedAt: now,
    updatedAt: now,
  }
  return {
    safetyCase: next,
    event: appendEvent(next.caseId, 'ACKNOWLEDGED', input.actorUserId, input.note ?? 'acknowledged', now),
  }
}

export const disposeSafetyCase = (input: {
  safetyCase: SafetyCaseRecordV1
  actorUserId: string
  isAuthorizedAdmin?: boolean
  note: string
  now?: string
}): { safetyCase: SafetyCaseRecordV1; event: SafetyCaseEventV1 } => {
  assertOwnerOrAdmin({
    safetyCase: input.safetyCase,
    actorUserId: input.actorUserId,
    isAuthorizedAdmin: input.isAuthorizedAdmin === true,
  })
  if (input.safetyCase.status === 'DISPOSED' || input.safetyCase.status === 'REFERRED') {
    safetyFail('SAFETY_STATE', 'case already closed')
  }
  const now = input.now ?? new Date().toISOString()
  const next: SafetyCaseRecordV1 = {
    ...input.safetyCase,
    status: 'DISPOSED',
    disposedAt: now,
    updatedAt: now,
  }
  return {
    safetyCase: next,
    event: appendEvent(next.caseId, 'DISPOSED', input.actorUserId, input.note, now),
  }
}

export const escalateSafetyCase = (input: {
  safetyCase: SafetyCaseRecordV1
  actorUserId: string
  note: string
  now?: string
  wakeupJobId?: string | null
}): { safetyCase: SafetyCaseRecordV1; event: SafetyCaseEventV1 } => {
  if (input.safetyCase.status === 'DISPOSED' || input.safetyCase.status === 'REFERRED') {
    safetyFail('SAFETY_STATE', 'closed cases cannot escalate')
  }
  const now = input.now ?? new Date().toISOString()
  const next: SafetyCaseRecordV1 = {
    ...input.safetyCase,
    status: 'ESCALATED',
    updatedAt: now,
  }
  return {
    safetyCase: next,
    event: appendEvent(
      next.caseId,
      'ESCALATED',
      input.actorUserId,
      input.note,
      now,
      input.wakeupJobId ?? null,
    ),
  }
}

/**
 * Reanalysis must never auto-close an old case. Callers create a new case when
 * the new analysis triggers safety; priorCaseId is recorded for lineage only.
 */
export const assertReanalysisDoesNotAutoClose = (input: {
  priorCase: SafetyCaseRecordV1
  newAnalysisTriggered: boolean
}): SafetyCaseStatusV1 => {
  // Explicit no-op on prior status.
  void input.newAnalysisTriggered
  return input.priorCase.status
}
