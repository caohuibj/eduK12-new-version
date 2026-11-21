import type { compositeApi, publicCompositeApi } from './api'
import {
  isTrainingBusy,
  isTrainingUncertainRequestError,
  runTrainingRetry,
  runWithTrainingTimeout,
  TrainingRetryCancelledError,
  type TrainingRetryOptions,
} from '../../services/trainingBusyRetry'
import { normalizeApiError } from '../../utils/normalizeApiError'

type StartResponse = Awaited<ReturnType<typeof compositeApi.start>>
type AvailableResponse = Awaited<ReturnType<typeof compositeApi.listAvailable>>
type AttemptResponse = Awaited<ReturnType<typeof compositeApi.getAttempt>>

export type StartTrainingRecoveryResult = {
  response: StartResponse
  source: 'start-response' | 'recovered-existing'
}

type StartDependencies = {
  assessmentId: string
  start: (signal?: AbortSignal) => Promise<StartResponse>
  listAvailable: (signal?: AbortSignal) => Promise<AvailableResponse>
  getAttempt: (attemptId: string, signal?: AbortSignal) => Promise<AttemptResponse>
}

/** A lost or timed-out authenticated START response is reconciled before another POST. */
export const startTrainingWithRecovery = (
  deps: StartDependencies,
  options: TrainingRetryOptions = {},
): Promise<StartTrainingRecoveryResult> => runTrainingRetry<StartTrainingRecoveryResult>(
  async (signal) => ({
    response: await deps.start(signal),
    source: 'start-response',
  }),
  async (error, context) => {
    const normalized = normalizeApiError(error)
    if (isTrainingBusy(error, ['INSTRUMENT_NOT_AVAILABLE', 'ASSESSMENT_START_BUSY'])) {
      return { kind: 'retry', retryAfterMs: normalized.retryAfterMs }
    }
    if (!isTrainingUncertainRequestError(error)) return { kind: 'stop' }
    const availableBudgetMs = context.getRemainingWaitMs()
    if (availableBudgetMs <= 0) return { kind: 'stop' }

    try {
      const available = await runWithTrainingTimeout(
        (signal) => deps.listAvailable(signal),
        { timeoutMs: Math.min(10_000, availableBudgetMs), signal: options.signal, isCurrent: options.isCurrent },
      )
      if (available.code !== 0 || !available.data) return { kind: 'stop' }
      const item = available.data.list.find((entry) => entry.id === deps.assessmentId)
      if (!item) return { kind: 'stop' }
      const attempt = item.attempt
      if (attempt && typeof attempt === 'object' && 'status' in attempt && attempt.status === 'IN_PROGRESS'
          && 'id' in attempt && typeof attempt.id === 'string') {
        if (item.canContinue !== true) return { kind: 'stop' }
        const attemptBudgetMs = context.getRemainingWaitMs()
        if (attemptBudgetMs <= 0) return { kind: 'stop' }
        const recovered = await runWithTrainingTimeout(
          (signal) => deps.getAttempt(attempt.id as string, signal),
          { timeoutMs: Math.min(10_000, attemptBudgetMs), signal: options.signal, isCurrent: options.isCurrent },
        )
        if (recovered.code !== 0 || !recovered.data || recovered.data.id !== attempt.id
            || recovered.data.status !== 'IN_PROGRESS') return { kind: 'stop' }
        return {
          kind: 'return',
          value: {
            response: {
              code: 0,
              message: recovered.message,
              data: { attempt: recovered.data, recoveryToken: null, freshlyCreated: false },
            },
            source: 'recovered-existing',
          },
        }
      }
      // Do not replay if the available response cannot prove that starting a
      // new attempt is currently allowed. The server serializes same-user STARTs.
      return attempt === null && item.canStartNewAttempt === true ? { kind: 'retry' } : { kind: 'stop' }
    } catch (readErr) {
      if (readErr instanceof TrainingRetryCancelledError) throw readErr
      return { kind: 'stop' }
    }
  },
  options,
)

/** Public credentials cannot look up an anonymous attempt whose first START response was lost.
 * Only this explicit pre-transaction rejection can be replayed automatically. */
export const startAnonymousTrainingWithBackoff = (
  start: (signal?: AbortSignal) => ReturnType<ReturnType<typeof publicCompositeApi>['start']>,
  options: TrainingRetryOptions = {},
) => runTrainingRetry(
  start,
  async error => isTrainingBusy(error, ['ANONYMOUS_START_DEFERRED'])
    ? { kind: 'retry', retryAfterMs: normalizeApiError(error).retryAfterMs }
    : { kind: 'stop' },
  options,
)
