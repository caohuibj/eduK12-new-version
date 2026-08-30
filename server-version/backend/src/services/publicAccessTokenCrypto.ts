import crypto from 'node:crypto'
import { decryptField, encryptField } from '../utils/encryption'

/**
 * Public bearer values are recoverable only for an authorized management
 * response.  Database lookups use the deterministic hash so a database dump
 * does not contain usable public links.
 */
export const hashPublicAccessToken = (token: string): string => crypto
  .createHash('sha256')
  .update(token, 'utf8')
  .digest('hex')

export const encryptPublicAccessToken = (token: string): string => encryptField({ token })

export const decryptPublicAccessToken = (value: string): string | null => {
  try {
    const payload = decryptField<{ token?: unknown }>(value)
    return typeof payload.token === 'string' ? payload.token : null
  } catch {
    return null
  }
}
