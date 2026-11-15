import { normalizeApiError } from '../utils/normalizeApiError'

export const TRAINING_RETRY_TOTAL_WAIT_MS = 35_000
export const TRAINING_RETRY_REQUEST_TIMEOUT_MS = 25_000

export class TrainingRetryCancelledError extends Error {
  constructor() {
    super('请求已取消')
    this.name = 'TrainingRetryCancelledError'
  }
}

export class TrainingRetryTimeoutError extends Error {
  readonly retryable = true
  readonly timedOut = true
  readonly code = 'ECONNABORTED'

  constructor(message = '请求超时，请稍后重试') {
    super(message)
    this.name = 'TrainingRetryTimeoutError'
  }
}

export type RetryDecision<T> =
  | { kind: 'retry'; retryAfterMs?: number | null }
  | { kind: 'return'; value: T }
  | { kind: 'stop' }

export type TrainingRetryDecisionContext = {
  remainingWaitMs: number
}

export type TrainingRetryOptions = {
  signal?: AbortSignal
  isCurrent?: () => boolean
  random?: () => number
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (delayMs: number) => void
  maxAttempts?: number
  maxTotalWaitMs?: number
  requestTimeoutMs?: number
}

export const isTrainingBusy = (error: unknown, codes: readonly string[]): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.status === 503 && typeof normalized.code === 'string' && codes.includes(normalized.code)
}

/**
 * Treat request timeouts and statusless retryable transport errors as uncertain
 * outcomes so callers check server state before replaying a mutation.
 */
export const isTrainingUncertainRequestError = (error: unknown): boolean => {
  if (error instanceof TrainingRetryTimeoutError) return true
  const normalized = normalizeApiError(error)
  if (normalized.status !== null || !normalized.retryable) return false
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
  const timedOut = typeof error === 'object' && error !== null && 'timedOut' in error
    ? Boolean((error as { timedOut?: unknown }).timedOut)
    : false
  return timedOut || name === 'AxiosError'
}

/** Retry-After is a floor; positive jitter spreads clients after that floor. */
export const trainingRetryDelayMs = (retryAfterMs: number | null | undefined, random = Math.random): number => {
  const floor = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? Math.max(1_000, retryAfterMs) : 1_000
  const value = random()
  const sample = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return floor + Math.floor(sample * 4_000)
}

const sleepWithSignal = (milliseconds: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new TrainingRetryCancelledError())
  const cancel = () => {
    clearTimeout(timer)
    reject(new TrainingRetryCancelledError())
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', cancel)
    resolve()
  }, milliseconds)
  signal?.addEventListener('abort', cancel, { once: true })
})

/**
 * Race an async operation against an AbortSignal-wired timeout so a hung TCP
 * response cannot keep a caller waiting indefinitely past its budget.
 */
export const runWithTrainingTimeout = <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; signal?: AbortSignal; isCurrent?: () => boolean } = {},
): Promise<T> => {
  const { timeoutMs = TRAINING_RETRY_REQUEST_TIMEOUT_MS, signal, isCurrent } = options
  if (signal?.aborted || isCurrent?.() === false) {
    return Promise.reject(new TrainingRetryCancelledError())
  }
  if (timeoutMs <= 0) {
    return Promise.reject(new TrainingRetryTimeoutError())
  }

  return new Promise<T>((resolve, reject) => {
    const attemptController = new AbortController()
    let settled = false
    let timedOut = false
    let cancelled = false

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onExternalAbort)
    }

    const finishResolve = (value: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const finishReject = (err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const onExternalAbort = () => {
      cancelled = true
      attemptController.abort()
      finishReject(new TrainingRetryCancelledError())
    }

    const timer = setTimeout(() => {
      if (signal?.aborted || isCurrent?.() === false) {
        onExternalAbort()
        return
      }
      timedOut = true
      attemptController.abort()
      finishReject(new TrainingRetryTimeoutError())
    }, timeoutMs)

    signal?.addEventListener('abort', onExternalAbort, { once: true })

    let operationPromise: Promise<T>
    try {
      operationPromise = operation(attemptController.signal)
    } catch (syncError) {
      if (cancelled || signal?.aborted || isCurrent?.() === false) {
        finishReject(new TrainingRetryCancelledError())
      } else {
        finishReject(syncError)
      }
      return
    }

    operationPromise.then(
      (value) => {
        if (settled) return
        if (cancelled || signal?.aborted || isCurrent?.() === false) {
          finishReject(new TrainingRetryCancelledError())
          return
        }
        finishResolve(value)
      },
      (err) => {
        if (settled) return
        if (cancelled || signal?.aborted || isCurrent?.() === false) {
          finishReject(new TrainingRetryCancelledError())
        } else if (timedOut) {
          finishReject(new TrainingRetryTimeoutError())
        } else {
          finishReject(err)
        }
      },
    )
  })
}

/** Bounded retries only; callers decide which responses are safe to replay. */
export const runTrainingRetry = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  decide: (error: unknown, context: TrainingRetryDecisionContext) => Promise<RetryDecision<T>> | RetryDecision<T>,
  options: TrainingRetryOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 3
  const maxTotalWaitMs = options.maxTotalWaitMs ?? TRAINING_RETRY_TOTAL_WAIT_MS
  const requestTimeoutMs = options.requestTimeoutMs ?? TRAINING_RETRY_REQUEST_TIMEOUT_MS
  const now = options.now ?? Date.now
  const startedAt = now()
  let totalWaitMs = 0
  const checkCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false) throw new TrainingRetryCancelledError()
  }
  const elapsed = () => Math.max(totalWaitMs, Math.max(0, now() - startedAt))

  for (let attempt = 1; ; attempt += 1) {
    checkCurrent()
    const attemptTimeoutMs = Math.min(requestTimeoutMs, Math.max(1, maxTotalWaitMs - elapsed()))
    try {
      return await runWithTrainingTimeout(operation, {
        timeoutMs: attemptTimeoutMs,
        signal: options.signal,
        isCurrent: options.isCurrent,
      })
    } catch (error) {
      checkCurrent()
      const remainingWaitMs = Math.max(0, maxTotalWaitMs - elapsed())
      const decision = await decide(error, { remainingWaitMs })
      checkCurrent()
      if (decision.kind === 'return') return decision.value
      if (decision.kind === 'stop' || attempt >= maxAttempts) throw error
      const delayMs = trainingRetryDelayMs(decision.retryAfterMs, options.random)
      const elapsedMs = elapsed()
      if (elapsedMs + delayMs > maxTotalWaitMs) throw error
      totalWaitMs += delayMs
      options.onRetry?.(delayMs)
      await (options.sleep ?? sleepWithSignal)(delayMs, options.signal)
      checkCurrent()
      if (maxTotalWaitMs - elapsed() <= 0) throw error
    }
  }
}
