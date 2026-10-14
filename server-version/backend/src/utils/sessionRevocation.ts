import { createHash } from 'node:crypto'
import { cacheService } from '../services/cacheService'
import { verifyToken } from './jwt'

// No raw JWTs, usernames, or accounts are ever stored in the Redis marker.
export const sessionRevocationKey = (token: string): string =>
  'auth:logout:v1:' + createHash('sha256').update(token).digest('hex')

/** true=logged out; false=active; null=Redis unavailable (production fails closed). */
export const isSessionRevoked = (token: string): Promise<boolean | null> =>
  cacheService.readSessionRevocation(sessionRevocationKey(token))

/** One exact expiring browser token only; other devices and product sessions
 * retain their existing signed credentials. Password changes still increment
 * the shared tokenVersion and invalidate all sessions.
 */
export async function revokeCurrentSession(token: string | null): Promise<boolean> {
  if (!token) return false
  const exp = verifyToken(token)?.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false
  const ttlSeconds = Math.ceil(exp - Date.now() / 1000)
  if (ttlSeconds <= 0) return false
  return cacheService.recordSessionRevocation(sessionRevocationKey(token), ttlSeconds)
}
