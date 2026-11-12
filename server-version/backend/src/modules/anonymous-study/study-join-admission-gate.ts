import { BoundedAdmissionGate, configuredInteger } from '../../services/boundedAdmissionGate'
import { defaultStartAdmissionBound } from '../../config/databasePool'

let studyJoinGateInstance: BoundedAdmissionGate | null = null

export const resetStudyJoinAdmissionGateForTests = (): void => {
  studyJoinGateInstance = null
}

const resolveBound = (
  explicitName: string,
  fallbackName: string,
  defaultVal: number,
  allowZero = false,
  fallbackCap?: number,
): number => {
  const explicitRaw = process.env[explicitName]
  if (explicitRaw !== undefined && explicitRaw.trim() !== '') {
    return configuredInteger(explicitName, defaultVal, allowZero)
  }
  const fallbackRaw = process.env[fallbackName]
  if (fallbackRaw !== undefined && fallbackRaw.trim() !== '') {
    const val = configuredInteger(fallbackName, defaultVal, allowZero)
    return fallbackCap !== undefined ? Math.min(val, fallbackCap) : val
  }
  return defaultVal
}

export const studyJoinAdmissionGate = (): BoundedAdmissionGate => {
  if (!studyJoinGateInstance) {
    const defaultConcurrent = Math.min(8, defaultStartAdmissionBound(process.env.DATABASE_URL))
    const maxConcurrent = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_CONCURRENT',
      'TRAINING_START_MAX_CONCURRENT',
      defaultConcurrent,
      false,
      8, // Cap fallback at 8 to respect scrypt gate capacity (4 concurrent + 8 queue = 12 total)
    )
    // Queue/wait defaults cover a full questionnaire burst: a single anonymous
    // questionnaire never exceeds 500 total responses, so 500 students from
    // one NAT must all queue in the gate (drain ≈ 500 joins at 8 concurrent
    // ≈ 6–10s, well within 30000ms) instead of 503ing and retrying. The
    // fallback caps match the defaults: TRAINING_START_* is for a different
    // gate, and a lower cap would re-cap the queue in any env that sets it
    // (e.g. captest TRAINING_START_MAX_QUEUE=300 inherits min(300, 500)=300).
    const maxQueue = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      500,
      true,
      500,
    )
    const maxWaitMs = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      30000,
      false,
      30000,
    )

    studyJoinGateInstance = new BoundedAdmissionGate({
      name: 'study_join_admission',
      maxConcurrent,
      maxQueue,
      maxWaitMs,
      retryAfterSeconds: 1,
      busyCode: 'STUDY_JOIN_BUSY',
      busyMessage: '匿名研究加入繁忙，请稍后重试',
    })
  }
  return studyJoinGateInstance
}
