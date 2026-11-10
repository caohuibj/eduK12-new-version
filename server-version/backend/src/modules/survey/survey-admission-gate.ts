import { BoundedAdmissionGate, configuredInteger } from '../../services/boundedAdmissionGate'
import { defaultStartAdmissionBound } from '../../config/databasePool'

let surveyGateInstance: BoundedAdmissionGate | null = null

export const resetSurveyAdmissionGateForTests = (): void => {
  surveyGateInstance = null
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

export const surveyAdmissionGate = (): BoundedAdmissionGate => {
  if (!surveyGateInstance) {
    const defaultConcurrent = defaultStartAdmissionBound(process.env.DATABASE_URL)
    const maxConcurrent = resolveBound(
      'SURVEY_ADMISSION_MAX_CONCURRENT',
      'TRAINING_START_MAX_CONCURRENT',
      defaultConcurrent,
      false,
    )
    const maxQueue = resolveBound(
      'SURVEY_ADMISSION_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      300,
      true,
    )
    const maxWaitMs = resolveBound(
      'SURVEY_ADMISSION_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      15000,
      false,
    )

    surveyGateInstance = new BoundedAdmissionGate({
      name: 'survey_admission',
      maxConcurrent,
      maxQueue,
      maxWaitMs,
      retryAfterSeconds: 1,
      busyCode: 'SURVEY_ADMISSION_BUSY',
      busyMessage: '研究参与请求繁忙，请稍后重试',
    })
  }
  return surveyGateInstance
}
