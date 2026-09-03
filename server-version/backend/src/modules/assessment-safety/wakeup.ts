/**
 * Redis/Bull wake-up only — DB SafetyCase remains authority.
 * Duplicate deliveries and restarts must reconcile from DB state.
 */
import { randomUUID } from 'node:crypto'
import { safetyFail } from './errors'
import { escalateSafetyCase } from './case'
import type { SafetyCaseEventV1, SafetyCaseRecordV1, SafetyPolicyTemplateV1, SafetyWakeupJobV1 } from './types'
import { validateSafetyPolicyTemplate } from './policy'

export const scheduleSafetyWakeups = (input: {
  safetyCase: SafetyCaseRecordV1
  policy: SafetyPolicyTemplateV1
  now?: string
}): SafetyWakeupJobV1[] => {
  const policy = validateSafetyPolicyTemplate(input.policy)
  const nowMs = Date.parse(input.now ?? new Date().toISOString())
  if (!Number.isFinite(nowMs)) safetyFail('SAFETY_DATETIME', 'invalid now')
  return [
    {
      jobId: randomUUID(),
      caseId: input.safetyCase.caseId,
      kind: 'ACK_TIMEOUT',
      fireAt: new Date(nowMs + policy.acknowledgeWithinMs).toISOString(),
      status: 'SCHEDULED',
    },
    {
      jobId: randomUUID(),
      caseId: input.safetyCase.caseId,
      kind: 'DISPOSE_TIMEOUT',
      fireAt: new Date(nowMs + policy.disposeWithinMs).toISOString(),
      status: 'SCHEDULED',
    },
  ]
}

/**
 * Fire a wake-up against DB authority. If case already acknowledged/disposed,
 * wake-up is a no-op (idempotent).
 */
export const applySafetyWakeup = (input: {
  safetyCase: SafetyCaseRecordV1
  job: SafetyWakeupJobV1
  now?: string
}): { safetyCase: SafetyCaseRecordV1; event: SafetyCaseEventV1 | null; job: SafetyWakeupJobV1 } => {
  if (input.job.caseId !== input.safetyCase.caseId) {
    safetyFail('SAFETY_INPUT', 'wakeup job case mismatch')
  }
  const now = input.now ?? new Date().toISOString()
  if (input.safetyCase.status === 'DISPOSED' || input.safetyCase.status === 'REFERRED') {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: { ...input.job, status: 'CANCELLED' },
    }
  }
  if (input.job.kind === 'ACK_TIMEOUT' && input.safetyCase.acknowledgedAt) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: { ...input.job, status: 'FIRED' },
    }
  }
  if (input.job.kind === 'DISPOSE_TIMEOUT' && input.safetyCase.disposedAt) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: { ...input.job, status: 'FIRED' },
    }
  }
  const escalated = escalateSafetyCase({
    safetyCase: input.safetyCase,
    actorUserId: 'system:safety-wakeup',
    note: `wakeup ${input.job.kind}`,
    now,
    wakeupJobId: input.job.jobId,
  })
  return {
    safetyCase: escalated.safetyCase,
    event: escalated.event,
    job: { ...input.job, status: 'FIRED' },
  }
}
