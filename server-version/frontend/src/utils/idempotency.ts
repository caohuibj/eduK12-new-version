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
