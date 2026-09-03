import { normalizeApiError } from '../../utils/normalizeApiError'

const BUSY_CODES = new Set([
  'ASSESSMENT_SUBMIT_BUSY',
  'COMPLETION_BUSY',
  'ADMISSION_BUSY',
])

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
 * Attempt-aware jitter capped at 5s. Prefer Retry-After when present.
 * Spread roughly 1–5s so concurrent clients do not align.
 */
export const finalDraftCapacityRetryDelayMs = (
  attempt: number,
  retryAfterMs: number | null = null,
  random: () => number = Math.random,
): number => {
  const safeAttempt = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1
  const retryFloor = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? Math.min(5_000, Math.max(0, retryAfterMs))
    : 0
  // Attempt-aware windows (~1-2 / 1.5-3 / 2.5-4.5 / 3-5s), never above 5s.
  const windows: Array<[number, number]> = [
    [1_000, 2_000],
    [1_500, 3_000],
    [2_500, 4_500],
    [3_000, 5_000],
  ]
  const [lo, hi] = windows[Math.min(safeAttempt - 1, windows.length - 1)]
  const sampledRaw = random()
  const sampled = Number.isFinite(sampledRaw) ? Math.min(1, Math.max(0, sampledRaw)) : 0
  const jittered = lo + Math.floor(sampled * (hi - lo + 1))
  return Math.min(5_000, Math.max(jittered, retryFloor))
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
