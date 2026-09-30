import type { RequestHandler } from 'express'
import { createRedisRateLimiter } from './redisRateLimit'
import { configuredInteger, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'
import { withLoginPasswordVerification } from './loginRateLimit'

// Both historical aliases share the same authenticated principal budget.
export const passwordChangeRateLimit = createRedisRateLimiter({
  name: 'password_change', limit: configuredInteger('PASSWORD_CHANGE_REQUEST_LIMIT', 10),
  windowSeconds: 15 * 60, key: req => req.user?.userId || 'unauthenticated',
})

/** Hold the existing bcrypt admission through compare AND successful hash.
 * A disconnected request retains its permit until the work actually finishes. */
export const withPasswordChangeAdmission = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try {
    await withLoginPasswordVerification(async () => {
      if (res.destroyed) return
      await handler(req, res, next)
    })
  } catch (error) {
    if (isBoundedAdmissionBusyError(error)) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds))
      res.status(503).json({ code: -1, message: '密码服务繁忙，请稍后重试' })
      return
    }
    next(error)
  }
}
