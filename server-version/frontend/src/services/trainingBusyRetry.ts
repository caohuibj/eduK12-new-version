import { normalizeApiError } from '../utils/normalizeApiError'

export class TrainingRetryCancelledError extends Error {
  constructor() {
    super('请求已取消')
    this.name = 'TrainingRetryCancelledError'
  }
}

export type RetryDecision<T> =
  | { kind: 'retry'; retryAfterMs?: number | null }
  | { kind: 'return'; value: T }
  | { kind: 'stop' }

export type TrainingRetryOptions = {
  signal?: AbortSignal
  isCurrent?: () => boolean
  random?: () => number
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (delayMs: number) => void
  maxAttempts?: number
  maxTotalWaitMs?: number
}

export const isTrainingBusy = (error: unknown, codes: readonly string[]): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.status === 503 && typeof normalized.code === 'string' && codes.includes(normalized.code)
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

/** Bounded retries only; callers decide which responses are safe to replay. */
export const runTrainingRetry = async <T>(
  operation: () => Promise<T>,
  decide: (error: unknown) => Promise<RetryDecision<T>> | RetryDecision<T>,
  options: TrainingRetryOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 3
  const maxTotalWaitMs = options.maxTotalWaitMs ?? 35_000
  const now = options.now ?? Date.now
  const startedAt = now()
  let totalWaitMs = 0
  const checkCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false) throw new TrainingRetryCancelledError()
  }
  for (let attempt = 1; ; attempt += 1) {
    checkCurrent()
    try {
      return await operation()
    } catch (error) {
      checkCurrent()
      const decision = await decide(error)
      checkCurrent()
      if (decision.kind === 'return') return decision.value
      if (decision.kind === 'stop' || attempt >= maxAttempts) throw error
      const delayMs = trainingRetryDelayMs(decision.retryAfterMs, options.random)
      const elapsedMs = Math.max(totalWaitMs, Math.max(0, now() - startedAt))
      if (elapsedMs + delayMs > maxTotalWaitMs) throw error
      totalWaitMs += delayMs
      options.onRetry?.(delayMs)
      await (options.sleep ?? sleepWithSignal)(delayMs, options.signal)
    }
  }
}
