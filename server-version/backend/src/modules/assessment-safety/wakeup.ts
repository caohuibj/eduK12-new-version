/**
 * Redis/Bull wake-up only — DB SafetyCase remains authority.
 * Bull payload is ID-only (caseId + wakeupJobId + kind).
 * Worker: processWakeupAtomically → claim ledger → apply → persist.
 * Never trust embedded SafetyCaseRecord from job.
 * Duplicate Bull delivery no-ops after first ESCALATED event for that wakeupJobId.
 * Restart re-schedules from persisted ackDueAt/disposeDueAt without sliding SLA start.
 * wakeupJobId is deterministic: sha256(caseId|kind|dueAt) — restart reuses same IDs.
 */
import { createHash } from 'node:crypto'
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

/** Deterministic wakeup job id — restart/reschedule must reuse the same logical ID. */
export const buildDeterministicWakeupJobId = (input: {
  caseId: string
  kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
  dueAt: string
}): string => (
  createHash('sha256')
    .update(`${input.caseId}|${input.kind}|${input.dueAt}`)
    .digest('hex')
)

/** Build ID-only Bull payloads from persisted deadlines (no embedded SafetyCase). */
export const buildSafetyWakeupBullPayloads = (input: {
  safetyCase: SafetyCaseRecordV1
}): SafetyWakeupBullPayloadV1[] => {
  const ackJobId = buildDeterministicWakeupJobId({
    caseId: input.safetyCase.caseId,
    kind: 'ACK_TIMEOUT',
    dueAt: input.safetyCase.ackDueAt,
  })
  const disposeJobId = buildDeterministicWakeupJobId({
    caseId: input.safetyCase.caseId,
    kind: 'DISPOSE_TIMEOUT',
    dueAt: input.safetyCase.disposeDueAt,
  })
  return [
    { caseId: input.safetyCase.caseId, wakeupJobId: ackJobId, kind: 'ACK_TIMEOUT' },
    { caseId: input.safetyCase.caseId, wakeupJobId: disposeJobId, kind: 'DISPOSE_TIMEOUT' },
  ]
}

/**
 * Schedule wakeups from persisted case deadlines.
 * Restart path: pass the same safetyCase.ackDueAt/disposeDueAt — fireAt does not slide.
 * Job IDs are deterministic from caseId|kind|dueAt.
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
 * SLA start (createdAt) never slides. Job IDs remain deterministic.
 */
export const rescheduleSafetyWakeupsAfterRestart = (input: {
  safetyCase: SafetyCaseRecordV1
  policy: SafetyPolicyTemplateV1
  now?: string
}): ReturnType<typeof scheduleSafetyWakeups> => (
  scheduleSafetyWakeups(input)
)

const fireAtFor = (
  safetyCase: SafetyCaseRecordV1,
  kind: SafetyWakeupBullPayloadV1['kind'],
): string => (kind === 'ACK_TIMEOUT' ? safetyCase.ackDueAt : safetyCase.disposeDueAt)

/**
 * Apply a wake-up against DB-loaded SafetyCase + durable wakeup ledger.
 * Duplicate delivery (same wakeupJobId already processed) → no-op.
 * now < fireAt → TOO_EARLY no-op (Bull delay is not deadline authority).
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
  const fireAt = fireAtFor(input.safetyCase, input.payload.kind)
  const nowMs = Date.parse(now)
  const fireMs = Date.parse(fireAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(fireMs)) {
    safetyFail('SAFETY_DATETIME', 'invalid now/fireAt')
  }

  // Bull delay is not deadline authority — refuse early fire.
  if (nowMs < fireMs) {
    return {
      safetyCase: input.safetyCase,
      event: null,
      job: {
        jobId: input.payload.wakeupJobId,
        caseId: input.payload.caseId,
        kind: input.payload.kind,
        fireAt,
        status: 'TOO_EARLY',
      },
      ledger: input.existingLedger
        ? { ...input.existingLedger }
        : {
            wakeupJobId: input.payload.wakeupJobId,
            caseId: input.payload.caseId,
            kind: input.payload.kind,
            fireAt,
            status: 'SCHEDULED',
            createdAt: now,
            processedAt: null,
          },
    }
  }

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

export type ProcessWakeupAtomicResult = {
  applied: ReturnType<typeof applySafetyWakeup> | null
  reason?: 'CASE_NOT_FOUND' | 'TOO_EARLY' | 'CLAIM_LOST'
  claimed: boolean
}

/**
 * Single authority path for Safety wakeup processing.
 * Claim ledger first; concurrent same wakeupJobId → one winner, one ESCALATED event.
 * Callers must not load/apply outside this path.
 */
export const processWakeupAtomically = (input: {
  payload: SafetyWakeupBullPayloadV1
  now?: string
  /** Load case by id — must be DB-backed in production. */
  loadCase: (caseId: string) => SafetyCaseRecordV1 | null
  /**
   * Claim exclusive processing for wakeupJobId.
   * Return true if this caller won; false if already claimed/processed.
   * Production: INSERT ... ON CONFLICT DO NOTHING / UPDATE WHERE status=SCHEDULED.
   */
  claimLedger: (args: {
    wakeupJobId: string
    caseId: string
    kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
    fireAt: string
    now: string
  }) => boolean
  /** Optional: ledger row after claim attempt (for apply duplicate path). */
  loadLedger?: (wakeupJobId: string) => SafetyWakeupLedgerEntryV1 | null
  loadPriorEscalation?: (wakeupJobId: string) => SafetyCaseEventV1 | null
}): ProcessWakeupAtomicResult => {
  const keys = Object.keys(input.payload as object).sort()
  if (keys.join(',') !== 'caseId,kind,wakeupJobId') {
    safetyFail('SAFETY_INPUT', 'Bull payload must be ID-only: caseId + wakeupJobId + kind')
  }

  const now = input.now ?? new Date().toISOString()
  const safetyCase = input.loadCase(input.payload.caseId)
  if (!safetyCase) return { applied: null, reason: 'CASE_NOT_FOUND', claimed: false }

  const fireAt = fireAtFor(safetyCase, input.payload.kind)
  const nowMs = Date.parse(now)
  const fireMs = Date.parse(fireAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(fireMs)) {
    safetyFail('SAFETY_DATETIME', 'invalid now/fireAt')
  }
  if (nowMs < fireMs) {
    return {
      applied: applySafetyWakeup({
        safetyCase,
        payload: input.payload,
        existingLedger: input.loadLedger?.(input.payload.wakeupJobId) ?? null,
        priorEscalationForJob: input.loadPriorEscalation?.(input.payload.wakeupJobId) ?? null,
        now,
      }),
      reason: 'TOO_EARLY',
      claimed: false,
    }
  }

  const claimed = input.claimLedger({
    wakeupJobId: input.payload.wakeupJobId,
    caseId: input.payload.caseId,
    kind: input.payload.kind,
    fireAt,
    now,
  })
  if (!claimed) {
    const existingLedger = input.loadLedger?.(input.payload.wakeupJobId) ?? {
      wakeupJobId: input.payload.wakeupJobId,
      caseId: input.payload.caseId,
      kind: input.payload.kind,
      fireAt,
      status: 'FIRED' as const,
      createdAt: now,
      processedAt: now,
    }
    return {
      applied: applySafetyWakeup({
        safetyCase,
        payload: input.payload,
        existingLedger,
        priorEscalationForJob: input.loadPriorEscalation?.(input.payload.wakeupJobId) ?? {
          eventId: 'claimed-elsewhere',
          caseId: input.payload.caseId,
          type: 'ESCALATED',
          actorUserId: 'system:safety-wakeup',
          at: now,
          note: 'claim lost',
          wakeupJobId: input.payload.wakeupJobId,
        },
        now,
      }),
      reason: 'CLAIM_LOST',
      claimed: false,
    }
  }

  const applied = applySafetyWakeup({
    safetyCase,
    payload: input.payload,
    existingLedger: input.loadLedger?.(input.payload.wakeupJobId) ?? null,
    priorEscalationForJob: input.loadPriorEscalation?.(input.payload.wakeupJobId) ?? null,
    now,
  })
  return { applied, claimed: true }
}

/**
 * @deprecated Prefer processWakeupAtomically — kept for pure unit tests of apply path.
 * Production worker must use processWakeupAtomically / repository.processWakeupAtomically.
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
  const claimed = new Set<string>()
  const result = processWakeupAtomically({
    payload: input.payload,
    now: input.now,
    loadCase: input.loadCase,
    claimLedger: ({ wakeupJobId }) => {
      if (claimed.has(wakeupJobId)) return false
      const existing = input.loadLedger(wakeupJobId)
      if (existing && (existing.status === 'FIRED' || existing.status === 'DUPLICATE_NOOP')) {
        return false
      }
      if (input.loadPriorEscalation(wakeupJobId)) return false
      claimed.add(wakeupJobId)
      return true
    },
    loadLedger: input.loadLedger,
    loadPriorEscalation: input.loadPriorEscalation,
  })
  if (!result.applied) return { applied: null, reason: 'CASE_NOT_FOUND' }
  return { applied: result.applied }
}
