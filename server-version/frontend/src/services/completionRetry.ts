import { normalizeApiError } from '../utils/normalizeApiError'

const MIN_JITTER_MS = 500
const MAX_JITTER_MS = 1_500
const DEFAULT_MAX_ATTEMPTS = 5

type CompletionRetryOptions = {
  maxAttempts?: number
  random?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds)
})

const jitterDelayMs = (random: () => number): number => {
  const sampledRandom = random()
  const boundedRandom = Number.isFinite(sampledRandom) ? Math.min(1, Math.max(0, sampledRandom)) : 0
  return Math.min(
    MAX_JITTER_MS,
    MIN_JITTER_MS + Math.floor(boundedRandom * (MAX_JITTER_MS - MIN_JITTER_MS + 1)),
  )
}

/** Only the server's explicit completion-capacity signal is retried here. */
export const isCompletionBusyError = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.status === 503 && normalized.code === 'COMPLETION_BUSY'
}

export const completionRetryDelayMs = (error: unknown, random: () => number = Math.random): number => {
  const normalized = normalizeApiError(error)
  return Math.max(jitterDelayMs(random), normalized.retryAfterMs ?? 0)
}

/** Retry an idempotent questionnaire completion or auto-completion request. */
export const runWithCompletionRetry = async <T>(
  operation: () => Promise<T>,
  options: CompletionRetryOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer')
  }

  let attempt = 1
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (!isCompletionBusyError(error) || attempt >= maxAttempts) throw error
      const delayMs = completionRetryDelayMs(error, options.random)
      await (options.sleep || sleep)(delayMs)
      attempt += 1
    }
  }
}
