import type { compositeApi } from './api'
import { isTrainingBusy, runTrainingRetry, type TrainingRetryOptions } from '../../services/trainingBusyRetry'
import { normalizeApiError } from '../../utils/normalizeApiError'

type StartResponse = Awaited<ReturnType<typeof compositeApi.start>>
type AvailableResponse = Awaited<ReturnType<typeof compositeApi.listAvailable>>
type AttemptResponse = Awaited<ReturnType<typeof compositeApi.getAttempt>>

type StartDependencies = {
  assessmentId: string
  start: () => Promise<StartResponse>
  listAvailable: () => Promise<AvailableResponse>
  getAttempt: (attemptId: string) => Promise<AttemptResponse>
}

/** A lost authenticated START response is reconciled before another POST. */
export const startTrainingWithRecovery = (
  deps: StartDependencies,
  options: TrainingRetryOptions = {},
): Promise<StartResponse> => runTrainingRetry<StartResponse>(deps.start, async (error) => {
  const normalized = normalizeApiError(error)
  if (isTrainingBusy(error, ['INSTRUMENT_NOT_AVAILABLE', 'ASSESSMENT_START_BUSY'])) {
    return { kind: 'retry', retryAfterMs: normalized.retryAfterMs }
  }
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
  if (normalized.status !== null || !normalized.retryable || name !== 'AxiosError') return { kind: 'stop' }

  try {
    const available = await deps.listAvailable()
    if (available.code !== 0 || !available.data) return { kind: 'stop' }
    const item = available.data.list.find((entry) => entry.id === deps.assessmentId)
    if (!item) return { kind: 'stop' }
    const attempt = item.attempt
    if (attempt && typeof attempt === 'object' && 'status' in attempt && attempt.status === 'IN_PROGRESS'
        && 'id' in attempt && typeof attempt.id === 'string') {
      if (item.canContinue !== true) return { kind: 'stop' }
      const recovered = await deps.getAttempt(attempt.id)
      if (recovered.code !== 0 || !recovered.data || recovered.data.id !== attempt.id
          || recovered.data.status !== 'IN_PROGRESS') return { kind: 'stop' }
      return { kind: 'return', value: { code: 0, message: recovered.message, data: { attempt: recovered.data, recoveryToken: null } } }
    }
    // Do not replay if the available response cannot prove that starting a
    // new attempt is currently allowed. The server serializes same-user STARTs.
    return attempt === null && item.canStartNewAttempt === true ? { kind: 'retry' } : { kind: 'stop' }
  } catch {
    return { kind: 'stop' }
  }
}, options)
