/**
 * Generate a per-submit key for retry-safe assignment/check-in requests.
 * Browser crypto is preferred; the fallback only supports older browsers and
 * still produces a sufficiently unique request-scoped value.
 */
export const createIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `submit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Canonicalize a JSON-like payload for the lifetime of a retryable submit.
 * This is intentionally deterministic rather than secret: the backend also
 * hashes and persists the payload, while the browser only needs to know when
 * a user edit makes the previously cached retry key unsafe to reuse.
 */
const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(',')}}`
  }
  return 'null'
}

export const fingerprintIdempotencyPayload = (payload: unknown): string => stableSerialize(payload)

/**
 * Decide whether a failed keyed submission is a definitive client-side
 * rejection.  A missing status means the request may have reached the server
 * (for example a network error or malformed response), so the same key must
 * be retained for a safe retry.  Request timeouts and rate limits are also
 * retryable because the server may have committed the write or may accept it
 * once the transient limit clears.
 */
export const shouldClearIdempotencyKey = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: unknown }).status
  if (typeof status !== 'number' || !Number.isInteger(status)) return false
  if (status === 408 || status === 425 || status === 429) return false
  return status >= 400 && status < 500
}
