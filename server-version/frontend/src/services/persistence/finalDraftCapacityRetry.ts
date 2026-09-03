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
): number => {
  const safeAttempt = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1
  const retryFloor = retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? Math.min(5_000, Math.max(0, retryAfterMs))
    : 0
  const base = Math.max(1_000, retryFloor || 1_000)
  const jitter = Math.random() * 4_000 // up to +4s
  const attemptBoost = Math.min(safeAttempt - 1, 3) * 250
  return Math.min(5_000, base + jitter + attemptBoost)
}

export type CapacityRetryOptions<T> = {
  maxAttempts?: number
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void | Promise<void>
  operation: (attempt: number) => Promise<T>
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
      const delayMs = finalDraftCapacityRetryDelayMs(attempt, normalizeApiError(error).retryAfterMs)
      await options.onRetry?.({ attempt, delayMs, error })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      attempt += 1
    }
  }
}
