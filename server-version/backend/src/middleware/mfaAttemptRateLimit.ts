import { createHash } from 'node:crypto'
import type { RequestHandler, Response } from 'express'
import { prisma } from '../config/database'
import { cacheService } from '../services/cacheService'
import { getCookie } from '../utils/authCookies'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const WINDOW_SECONDS = 900
const ACCOUNT_LIMIT = 20
const SHARED_IP_LIMIT = 600

/** Shared NATs must not share one person's OTP budget. Account keys come only
 * from an authenticated principal or a live server-issued pending challenge.
 * Per-challenge failure/consumption locks and TOTP anti-replay stay in the MFA
 * services. SCHOOL and Teacher share the same underlying account budget.
 */
export const createMfaAttemptRateLimiter = (options: {
  realm: 'SCHOOL' | 'SURVEY'
  ipName: string
  pendingCookieName: string
}): RequestHandler => async (req, res, next) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return next()
  const consume = async (key: string, limit: number, response: Response) => {
    const result = await cacheService.consumeRateLimit(key, limit, WINDOW_SECONDS)
    if (!result) {
      response.status(503).json({ code: -1, message: '双因素认证暂不可用' })
      return false
    }
    response.setHeader('RateLimit-Limit', String(limit))
    response.setHeader('RateLimit-Remaining', String(result.remaining))
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds))
      response.status(429).json({ code: -1, message: '双因素认证请求过于频繁，请稍后再试' })
      return false
    }
    return true
  }
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!await consume(`ratelimit:${options.ipName}:${digest(ip)}`, SHARED_IP_LIMIT, res)) return
    let userId = req.user?.accountDomain === options.realm ? req.user.userId : undefined
    if (!userId) {
      const pending = getCookie(req, options.pendingCookieName)
      if (pending && /^[A-Za-z0-9_-]{43}$/.test(pending)) {
        const challengeHash = digest(pending)
        const challenge = options.realm === 'SCHOOL'
          ? await prisma.campusMfaChallenge.findFirst({
              where: { challengeHash, consumedAt: null, expiresAt: { gt: new Date() }, failedCount: { lt: 5 } },
              select: { userId: true },
            })
          : await prisma.surveyMfaChallenge.findFirst({
              where: { challengeHash, consumedAt: null, expiresAt: { gt: new Date() }, failedCount: { lt: 5 } },
              select: { userId: true },
            })
        userId = challenge?.userId
      }
    }
    if (userId && !await consume(
      `ratelimit:mfa-account:${options.realm.toLowerCase()}:${digest(userId)}`, ACCOUNT_LIMIT, res,
    )) return
    next()
  } catch {
    // Identity lookup or Redis failure must never turn into a limiter bypass.
    res.status(503).json({ code: -1, message: '双因素认证暂不可用' })
  }
}
