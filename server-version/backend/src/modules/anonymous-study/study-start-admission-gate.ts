import { BoundedAdmissionGate, configuredInteger } from '../../services/boundedAdmissionGate'
import { defaultStartAdmissionBound } from '../../config/databasePool'
import { ASSESSMENT_START_BUSY } from '../composite/start-transient'

let anonymousStartGateInstance: BoundedAdmissionGate | null = null

export const resetAnonymousStartAdmissionGateForTests = (): void => {
  anonymousStartGateInstance = null
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

/** Bounded admission for the anonymous (public-token / study-wave) START
 * transaction. Mirrors the authenticated Training gate
 * (trainingStartGate in composite.service.ts) and the Survey gate
 * (survey-admission-gate.ts): ANONYMOUS_START_* env vars fall back to
 * TRAINING_START_*, so one deployment tunes both entries together unless the
 * anonymous entry is tuned separately. No fallback cap: the anonymous START
 * transaction costs the same as a Training START (unlike the join gate,
 * whose fallback is capped at 8 for scrypt capacity).
 *
 * The busy signal reuses ASSESSMENT_START_BUSY on purpose: the anonymous
 * START transaction is the same composite START machinery (same
 * classifyStartTransaction, same AssessmentStartBusyError, same 503 +
 * Retry-After mapping in composite.controller handleError and the
 * anonymous-study routes wrap()). A distinct code would need a second error
 * class and two more mapping branches for no client-visible difference —
 * clients retry on the 503 status, and server-side diagnosability already
 * comes from the gate name (anonymous_start_admission) in observability
 * labels plus the route. */
export const anonymousStartAdmissionGate = (): BoundedAdmissionGate => {
  if (!anonymousStartGateInstance) {
    const defaultConcurrent = defaultStartAdmissionBound(process.env.DATABASE_URL)
    const maxConcurrent = resolveBound(
      'ANONYMOUS_START_MAX_CONCURRENT',
      'TRAINING_START_MAX_CONCURRENT',
      defaultConcurrent,
      false,
    )
    const maxQueue = resolveBound(
      'ANONYMOUS_START_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      300,
      true,
    )
    const maxWaitMs = resolveBound(
      'ANONYMOUS_START_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      15000,
      false,
    )

    anonymousStartGateInstance = new BoundedAdmissionGate({
      name: 'anonymous_start_admission',
      maxConcurrent,
      maxQueue,
      maxWaitMs,
      retryAfterSeconds: 1,
      busyCode: ASSESSMENT_START_BUSY,
      busyMessage: '综合测评开始请求繁忙，请稍后重试',
    })
  }
  return anonymousStartGateInstance
}
