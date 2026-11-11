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
): number => {
  const explicitRaw = process.env[explicitName]
  if (explicitRaw !== undefined && explicitRaw.trim() !== '') {
    return configuredInteger(explicitName, defaultVal, allowZero)
  }
  const fallbackRaw = process.env[fallbackName]
  if (fallbackRaw !== undefined && fallbackRaw.trim() !== '') {
    return configuredInteger(fallbackName, defaultVal, allowZero)
  }
  return defaultVal
}

export const studyJoinAdmissionGate = (): BoundedAdmissionGate => {
  if (!studyJoinGateInstance) {
    const defaultConcurrent = defaultStartAdmissionBound(process.env.DATABASE_URL)
    const maxConcurrent = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_CONCURRENT',
      'TRAINING_START_MAX_CONCURRENT',
      defaultConcurrent,
      false,
    )
    const maxQueue = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      300,
      true,
    )
    const maxWaitMs = resolveBound(
      'STUDY_JOIN_ADMISSION_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      15000,
      false,
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
