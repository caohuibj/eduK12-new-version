import { normalizeApiError } from '../../utils/normalizeApiError'

const BUSY_CODES = new Set([
  'ASSESSMENT_SUBMIT_BUSY',
  'COMPLETION_BUSY',
  'ADMISSION_BUSY',
])

const BASE_DELAY_MS = 1_000
/** High safety cap — still honor larger Retry-After up to this bound. */
const SAFETY_CAP_MS = 30_000

/** Whitelist: 503/502/504, known busy codes, or network failures only. */
export const isFinalDraftCapacityRetryable = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  const code = String(normalized.code ?? '')
  if (BUSY_CODES.has(code)) return true
  if (normalized.status === 502 || normalized.status === 503 || normalized.status === 504) return true
  if (normalized.status === null && normalized.retryable) return true
  return false
}

/**
 * delay = max(Retry-AfterMs, exponentialBackoff(attempt)) + jitter
 * Floor-preserving jittered exponential backoff: Retry-After is a floor
 * (not a hard 1s concentrate). Safety-capped at 30s.
 */
export const finalDraftCapacityRetryDelayMs = (
  attempt: number,
  retryAfterMs: number | null = null,
  random: () => number = Math.random,
): number => {
  const safeAttempt = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1
  const retryFloor = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? Math.min(SAFETY_CAP_MS, Math.max(0, retryAfterMs))
    : 0
  const exponential = Math.min(SAFETY_CAP_MS, BASE_DELAY_MS * (2 ** (safeAttempt - 1)))
  const sampledRaw = random()
  const sampled = Number.isFinite(sampledRaw) ? Math.min(1, Math.max(0, sampledRaw)) : 0
  // Jitter added on top of the floored exponential backoff so Retry-After=1
  // does not pin every client to ~1s across attempts.
  const jitter = Math.floor(sampled * (exponential + 1))
  return Math.min(SAFETY_CAP_MS, Math.max(retryFloor, exponential) + jitter)
}

export type CapacityRetryOptions<T> = {
  maxAttempts?: number
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void | Promise<void>
  operation: (attempt: number) => Promise<T>
  random?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

/** Auto-retry capacity failures while callers keep the submit button disabled. */
export const runFinalDraftCapacityRetry = async <T>(
  options: CapacityRetryOptions<T>,
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 4
  let attempt = 1
  for (;;) {
    try {
      return await options.operation(attempt)
    } catch (error) {
      if (!isFinalDraftCapacityRetryable(error) || attempt >= maxAttempts) throw error
      const delayMs = finalDraftCapacityRetryDelayMs(
        attempt,
        normalizeApiError(error).retryAfterMs,
        options.random,
      )
      await options.onRetry?.({ attempt, delayMs, error })
      await (options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))))(delayMs)
      attempt += 1
    }
  }
}
