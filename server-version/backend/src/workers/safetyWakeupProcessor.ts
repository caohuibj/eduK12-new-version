/**
 * SafetyCase Bull wake-up processor.
 * Redis/Bull is wake-up only — DB SafetyCase remains authority.
 * No email/SMS. No LLM.
 *
 * Wired when SAFETY_WAKEUP_QUEUE is registered in config/queue (additive).
 */
import type { Job } from 'bull'
import { applySafetyWakeup } from '../modules/assessment-safety'
import type { SafetyCaseRecordV1, SafetyWakeupJobV1 } from '../modules/assessment-safety'

export interface SafetyWakeupJobPayloadV1 {
  wakeup: SafetyWakeupJobV1
  /** Caller loads authoritative case from DB before processing. */
  safetyCase: SafetyCaseRecordV1
}

export const processSafetyWakeupJob = async (
  job: Pick<Job<SafetyWakeupJobPayloadV1>, 'data' | 'id'>,
): Promise<{ caseId: string; status: string; escalated: boolean }> => {
  const result = applySafetyWakeup({
    safetyCase: job.data.safetyCase,
    job: job.data.wakeup,
  })
  return {
    caseId: result.safetyCase.caseId,
    status: result.safetyCase.status,
    escalated: result.event?.type === 'ESCALATED',
  }
}
