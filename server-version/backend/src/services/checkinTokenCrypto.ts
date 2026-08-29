import crypto from 'node:crypto'
import { decryptField, encryptField } from '../utils/encryption'

/** Deterministic lookup key for public check-in bearer tokens. */
export const hashToken = (token: string): string => crypto
  .createHash('sha256')
  .update(token, 'utf8')
  .digest('hex')

/** Recoverable protection used only for an authorized management reveal. */
export const encryptToken = (token: string): string => encryptField({ token })

export const decryptToken = (value: string): string | null => {
  try {
    const payload = decryptField<{ token?: unknown }>(value)
    return typeof payload.token === 'string' ? payload.token : null
  } catch {
    return null
  }
}
