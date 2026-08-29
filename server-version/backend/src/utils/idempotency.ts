import crypto from 'node:crypto'

const MAX_IDEMPOTENCY_KEY_LENGTH = 200

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
