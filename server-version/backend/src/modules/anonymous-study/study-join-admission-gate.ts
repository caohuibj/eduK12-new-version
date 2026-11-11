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
    const maxQueue = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      120,
      true,
      120,
    )
    const maxWaitMs = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      5000,
      false,
      5000,
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
