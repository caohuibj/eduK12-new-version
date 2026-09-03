/**
 * Redis/Bull wake-up only — DB SafetyCase remains authority.
 * Bull payload is ID-only (caseId + wakeupJobId + kind).
 * Worker: transaction → load SafetyCase from Postgres → check job already
 * processed → transition + append event → persist → commit.
 * Never trust embedded SafetyCaseRecord from job.
 * Duplicate Bull delivery no-ops after first ESCALATED event for that wakeupJobId.
 * Restart re-schedules from persisted ackDueAt/disposeDueAt without sliding SLA start.
 */
import { randomUUID } from 'node:crypto'
import { safetyFail } from './errors'
import { escalateSafetyCase } from './case'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyPolicyTemplateV1,
  SafetyWakeupBullPayloadV1,
  SafetyWakeupJobV1,
  SafetyWakeupLedgerEntryV1,
} from './types'
import { validateSafetyPolicyTemplate } from './policy'

/** Build ID-only Bull payloads from persisted deadlines (no embedded SafetyCase). */
export const buildSafetyWakeupBullPayloads = (input: {
  safetyCase: SafetyCaseRecordV1
}): SafetyWakeupBullPayloadV1[] => {
  const ackJobId = randomUUID()
  const disposeJobId = randomUUID()
  return [
    { caseId: input.safetyCase.caseId, wakeupJobId: ackJobId, kind: 'ACK_TIMEOUT' },
    { caseId: input.safetyCase.caseId, wakeupJobId: disposeJobId, kind: 'DISPOSE_TIMEOUT' },
  ]
}

/**
 * Schedule wakeups from persisted case deadlines.
 * Restart path: pass the same safetyCase.ackDueAt/disposeDueAt — fireAt does not slide.
 */
export const scheduleSafetyWakeups = (input: {
  safetyCase: SafetyCaseRecordV1
  policy: SafetyPolicyTemplateV1
  now?: string
}): { jobs: SafetyWakeupJobV1[]; payloads: SafetyWakeupBullPayloadV1[]; ledger: SafetyWakeupLedgerEntryV1[] } => {
  validateSafetyPolicyTemplate(input.policy)
  const nowIso = input.now ?? new Date().toISOString()
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(nowMs)) safetyFail('SAFETY_DATETIME', 'invalid now')

  // Always use persisted deadlines (createdAt + policy at create time). Never now+SLA.
  const ackFireAt = input.safetyCase.ackDueAt
  const disposeFireAt = input.safetyCase.disposeDueAt
  if (!ackFireAt || !disposeFireAt) {
    safetyFail('SAFETY_DATETIME', 'safety case missing persisted ackDueAt/disposeDueAt')
  }

  const payloads = buildSafetyWakeupBullPayloads({ safetyCase: input.safetyCase })
  const jobs: SafetyWakeupJobV1[] = [
    {
      jobId: payloads[0]!.wakeupJobId,
      caseId: input.safetyCase.caseId,
      kind: 'ACK_TIMEOUT',
      fireAt: ackFireAt,
      status: 'SCHEDULED',
    },
    {
      jobId: payloads[1]!.wakeupJobId,
      caseId: input.safetyCase.caseId,
      kind: 'DISPOSE_TIMEOUT',
      fireAt: disposeFireAt,
      status: 'SCHEDULED',
    },
  ]
  const ledger: SafetyWakeupLedgerEntryV1[] = jobs.map((job) => ({
    wakeupJobId: job.jobId,
    caseId: job.caseId,
    kind: job.kind,
    fireAt: job.fireAt,
    status: 'SCHEDULED',
    createdAt: nowIso,
    processedAt: null,
  }))
  return { jobs, payloads, ledger }
}

/**
 * Reschedule after process restart using ONLY persisted deadlines.
 * SLA start (createdAt) never slides.
 */
export const rescheduleSafetyWakeupsAfterRestart = (input: {
  safetyCase: SafetyCaseRecordV1
  policy: SafetyPolicyTemplateV1
  now?: string
}): ReturnType<typeof scheduleSafetyWakeups> => (
  scheduleSafetyWakeups(input)
)

/**
 * Apply a wake-up against DB-loaded SafetyCase + durable wakeup ledger.
 * Duplicate delivery (same wakeupJobId already processed) → no-op.
 */
export const applySafetyWakeup = (input: {
  /** Must be loaded from Postgres inside a transaction — never from Bull payload. */
  safetyCase: SafetyCaseRecordV1
  /** ID-only payload from Bull. */
  payload: SafetyWakeupBullPayloadV1
  /** Existing ledger entry if any (unique by wakeupJobId). */
  existingLedger?: SafetyWakeupLedgerEntryV1 | null
  /** Prior ESCALATED event for this wakeupJobId, if any. */
  priorEscalationForJob?: SafetyCaseEventV1 | null
  now?: string
}): {
  safetyCase: SafetyCaseRecordV1
  event: SafetyCaseEventV1 | null
  job: SafetyWakeupJobV1
  ledger: SafetyWakeupLedgerEntryV1
} => {
  if (input.payload.caseId !== input.safetyCase.caseId) {
    safetyFail('SAFETY_INPUT', 'wakeup job case mismatch')
  }

  const now = input.now ?? new Date().toISOString()
  const fireAt = input.payload.kind === 'ACK_TIMEOUT'
    ? input.safetyCase.ackDueAt
    : input.safetyCase.disposeDueAt

  // Duplicate Bull delivery: wakeupJobId already processed → durable no-op.
  if (
    input.existingLedger
    && (input.existingLedger.status === 'FIRED' || input.existingLedger.status === 'DUPLICATE_NOOP')
  ) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'DUPLICATE_NOOP',
      },
      ledger: {
        ...input.existingLedger,
        status: 'DUPLICATE_NOOP',
      },
    }
  }
  if (input.priorEscalationForJob) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'DUPLICATE_NOOP',
      },
      ledger: {
        wakeupJobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'DUPLICATE_NOOP',
        createdAt: input.existingLedger?.createdAt ?? now,
        processedAt: now,
      },
    }
  }

  if (input.safetyCase.status === 'DISPOSED' || input.safetyCase.status === 'REFERRED') {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'CANCELLED',
      },
      ledger: {
        wakeupJobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'CANCELLED',
        createdAt: input.existingLedger?.createdAt ?? now,
        processedAt: now,
      },
    }
  }
  if (input.payload.kind === 'ACK_TIMEOUT' && input.safetyCase.acknowledgedAt) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'FIRED',
      },
      ledger: {
        wakeupJobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'FIRED',
        createdAt: input.existingLedger?.createdAt ?? now,
        processedAt: now,
      },
    }
  }
  if (input.payload.kind === 'DISPOSE_TIMEOUT' && input.safetyCase.disposedAt) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'FIRED',
      },
      ledger: {
        wakeupJobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'FIRED',
        createdAt: input.existingLedger?.createdAt ?? now,
        processedAt: now,
      },
    }
  }

  const escalated = escalateSafetyCase({
    safetyCase: input.safetyCase,
    actorUserId: 'system:safety-wakeup',
    note: `wakeup ${input.payload.kind}`,
    now,
    wakeupJobId: input.payload.wakeupJobId,
  })
  return {
    safetyCase: escalated.safetyCase,
    event: escalated.event,
    job: {
      jobId: input.payload.wakeupJobId,
      caseId: input.payload.caseId,
      kind: input.payload.kind,
      fireAt,
      status: 'FIRED',
    },
    ledger: {
      wakeupJobId: input.payload.wakeupJobId,
      caseId: input.payload.caseId,
      kind: input.payload.kind,
      fireAt,
      status: 'FIRED',
      createdAt: input.existingLedger?.createdAt ?? now,
      processedAt: now,
    },
  }
}

/**
 * Pure in-memory worker transaction sketch used by tests.
 * Production worker must wrap the equivalent steps in a Postgres transaction.
 */
export const processSafetyWakeupDelivery = (input: {
  /** Load from DB by payload.caseId — never from job body. */
  loadCase: (caseId: string) => SafetyCaseRecordV1 | null
  loadLedger: (wakeupJobId: string) => SafetyWakeupLedgerEntryV1 | null
  loadPriorEscalation: (wakeupJobId: string) => SafetyCaseEventV1 | null
  payload: SafetyWakeupBullPayloadV1
  now?: string
}): {
  applied: ReturnType<typeof applySafetyWakeup> | null
  reason?: 'CASE_NOT_FOUND'
} => {
  // Reject payloads that try to smuggle a full SafetyCaseRecord.
  const keys = Object.keys(input.payload as object).sort()
  if (keys.join(',') !== 'caseId,kind,wakeupJobId') {
    safetyFail('SAFETY_INPUT', 'Bull payload must be ID-only: caseId + wakeupJobId + kind')
  }
  const safetyCase = input.loadCase(input.payload.caseId)
  if (!safetyCase) return { applied: null, reason: 'CASE_NOT_FOUND' }
  const applied = applySafetyWakeup({
    safetyCase,
    payload: input.payload,
    existingLedger: input.loadLedger(input.payload.wakeupJobId),
    priorEscalationForJob: input.loadPriorEscalation(input.payload.wakeupJobId),
    now: input.now,
  })
  return { applied }
}
