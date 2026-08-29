import crypto from 'node:crypto'

const MAX_IDEMPOTENCY_KEY_LENGTH = 200

/**
 * Serialize JSON-like request payloads deterministically.  Idempotency keys
 * are scoped to the exact logical payload, so object key order must not make
 * an otherwise identical retry look different.
 */
const stableSerialize = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'null'

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(object[key])}`
    )).join(',')}}`
  }

  return 'null'
}

/**
 * Parse and hash a client idempotency key before it reaches persistence.
 * Keys are stored as SHA-256 digests so a leaked database row cannot be used
 * as a replay credential. Undefined means the client did not opt into
 * explicit retry idempotency; invalid values are rejected by the controller.
 */
export const hashIdempotencyKey = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(trimmed)) {
    throw new Error('Idempotency-Key 无效')
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex')
}

/** Hash the canonical logical payload associated with an idempotency key. */
export const hashIdempotencyPayload = (payload: unknown): string => (
  crypto.createHash('sha256').update(stableSerialize(payload)).digest('hex')
)
