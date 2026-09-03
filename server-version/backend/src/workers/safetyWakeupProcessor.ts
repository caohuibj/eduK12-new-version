/**
 * SafetyCase Bull wake-up processor.
 * Redis/Bull is wake-up only — DB SafetyCase remains authority.
 * Bull payload is ID-only: caseId + wakeupJobId + kind.
 * Single authority path: processWakeupAtomically (claim ledger → apply).
 * No email/SMS. No LLM.
 *
 * Wired when SAFETY_WAKEUP_QUEUE is registered in config/queue (additive).
 * ProductionTriggerEnabled must stay false for first production Bundles —
 * this worker remains intentionally dormant until explicit enablement.
 */
import type { Job } from 'bull'
import { processWakeupAtomically } from '../modules/assessment-safety'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyWakeupBullPayloadV1,
  SafetyWakeupLedgerEntryV1,
} from '../modules/assessment-safety'

/** ID-only Bull payload — never embed SafetyCaseRecord. */
export type SafetyWakeupJobPayloadV1 = SafetyWakeupBullPayloadV1

export interface SafetyWakeupProcessorDepsV1 {
  /**
   * Preferred: single atomic authority path (claim + apply + persist in one place).
   * When provided, processSafetyWakeupJob calls only this — no multi-load outside tx.
   */
  processWakeupAtomically?: (input: {
    payload: SafetyWakeupBullPayloadV1
    now?: string
  }) => Promise<{
    safetyCase: SafetyCaseRecordV1 | null
    duplicate: boolean
    tooEarly: boolean
    escalated: boolean
  }> | {
    safetyCase: SafetyCaseRecordV1 | null
    duplicate: boolean
    tooEarly: boolean
    escalated: boolean
  }
  /**
   * In-memory / test claim+apply adapters. Used only when processWakeupAtomically
   * deps method is absent — still goes through domain processWakeupAtomically.
   */
  loadCase?: (caseId: string) => Promise<SafetyCaseRecordV1 | null> | SafetyCaseRecordV1 | null
  claimLedger?: (args: {
    wakeupJobId: string
    caseId: string
    kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
    fireAt: string
    now: string
  }) => Promise<boolean> | boolean
  loadLedger?: (wakeupJobId: string) => Promise<SafetyWakeupLedgerEntryV1 | null> | SafetyWakeupLedgerEntryV1 | null
  loadPriorEscalation?: (wakeupJobId: string) => Promise<SafetyCaseEventV1 | null> | SafetyCaseEventV1 | null
  persist?: (applied: NonNullable<ReturnType<typeof processWakeupAtomically>['applied']>) => Promise<void> | void
}

export const processSafetyWakeupJob = async (
  job: Pick<Job<SafetyWakeupJobPayloadV1>, 'data' | 'id'>,
  deps: SafetyWakeupProcessorDepsV1,
): Promise<{
  caseId: string
  status: string
  escalated: boolean
  duplicate: boolean
  tooEarly: boolean
}> => {
  const payload = job.data
  const keys = Object.keys(payload as object).sort().join(',')
  if (keys !== 'caseId,kind,wakeupJobId') {
    throw new Error('Safety wakeup Bull payload must be ID-only: caseId + wakeupJobId + kind')
  }

  if (deps.processWakeupAtomically) {
    const result = await deps.processWakeupAtomically({ payload })
    return {
      caseId: payload.caseId,
      status: result.safetyCase?.status ?? 'MISSING',
      escalated: result.escalated,
      duplicate: result.duplicate,
      tooEarly: result.tooEarly,
    }
  }

  // Test / in-memory path — still single authority: domain processWakeupAtomically.
  if (!deps.loadCase || !deps.claimLedger) {
    throw new Error('Safety wakeup processor requires processWakeupAtomically or loadCase+claimLedger')
  }
  const safetyCase = await deps.loadCase(payload.caseId)
  const result = processWakeupAtomically({
    payload,
    loadCase: () => safetyCase,
    claimLedger: (args) => deps.claimLedger!(args) as boolean,
    loadLedger: deps.loadLedger
      ? (id) => deps.loadLedger!(id) as SafetyWakeupLedgerEntryV1 | null
      : undefined,
    loadPriorEscalation: deps.loadPriorEscalation
      ? (id) => deps.loadPriorEscalation!(id) as SafetyCaseEventV1 | null
      : undefined,
  })
  if (result.applied) {
    await deps.persist?.(result.applied)
  }
  return {
    caseId: payload.caseId,
    status: result.applied?.safetyCase.status ?? (result.reason === 'CASE_NOT_FOUND' ? 'MISSING' : 'OPEN'),
    escalated: result.applied?.event?.type === 'ESCALATED',
    duplicate: result.reason === 'CLAIM_LOST' || result.applied?.job.status === 'DUPLICATE_NOOP',
    tooEarly: result.reason === 'TOO_EARLY' || result.applied?.job.status === 'TOO_EARLY',
  }
}
