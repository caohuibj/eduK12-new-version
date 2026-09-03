/**
 * SafetyCase Bull wake-up processor.
 * Redis/Bull is wake-up only — DB SafetyCase remains authority.
 * Bull payload is ID-only: caseId + wakeupJobId + kind.
 * Worker must load SafetyCase from Postgres; never trust embedded SafetyCaseRecord.
 * No email/SMS. No LLM.
 *
 * Wired when SAFETY_WAKEUP_QUEUE is registered in config/queue (additive).
 */
import type { Job } from 'bull'
import {
  applySafetyWakeup,
  processSafetyWakeupDelivery,
} from '../modules/assessment-safety'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyWakeupBullPayloadV1,
  SafetyWakeupLedgerEntryV1,
} from '../modules/assessment-safety'

/** ID-only Bull payload — never embed SafetyCaseRecord. */
export type SafetyWakeupJobPayloadV1 = SafetyWakeupBullPayloadV1

export interface SafetyWakeupProcessorDepsV1 {
  loadCase: (caseId: string) => Promise<SafetyCaseRecordV1 | null> | SafetyCaseRecordV1 | null
  loadLedger: (wakeupJobId: string) => Promise<SafetyWakeupLedgerEntryV1 | null> | SafetyWakeupLedgerEntryV1 | null
  loadPriorEscalation: (wakeupJobId: string) => Promise<SafetyCaseEventV1 | null> | SafetyCaseEventV1 | null
  persist?: (applied: ReturnType<typeof applySafetyWakeup>) => Promise<void> | void
}

export const processSafetyWakeupJob = async (
  job: Pick<Job<SafetyWakeupJobPayloadV1>, 'data' | 'id'>,
  deps: SafetyWakeupProcessorDepsV1,
): Promise<{ caseId: string; status: string; escalated: boolean; duplicate: boolean }> => {
  const payload = job.data
  const keys = Object.keys(payload as object).sort().join(',')
  if (keys !== 'caseId,kind,wakeupJobId') {
    throw new Error('Safety wakeup Bull payload must be ID-only: caseId + wakeupJobId + kind')
  }

  const safetyCase = await deps.loadCase(payload.caseId)
  const existingLedger = await deps.loadLedger(payload.wakeupJobId)
  const priorEscalation = await deps.loadPriorEscalation(payload.wakeupJobId)

  const delivery = processSafetyWakeupDelivery({
    loadCase: () => safetyCase,
    loadLedger: () => existingLedger,
    loadPriorEscalation: () => priorEscalation,
    payload,
  })
  if (!delivery.applied) {
    return {
      caseId: payload.caseId,
      status: 'MISSING',
      escalated: false,
      duplicate: false,
    }
  }
  await deps.persist?.(delivery.applied)
  return {
    caseId: delivery.applied.safetyCase.caseId,
    status: delivery.applied.safetyCase.status,
    escalated: delivery.applied.event?.type === 'ESCALATED',
    duplicate: delivery.applied.job.status === 'DUPLICATE_NOOP',
  }
}
