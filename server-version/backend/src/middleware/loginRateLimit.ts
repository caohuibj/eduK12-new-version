import crypto from 'node:crypto'
import { Request, Response, NextFunction } from 'express'
import { cacheService } from '../services/cacheService'

const WINDOW_SECONDS = 15 * 60
const ACCOUNT_FAILURE_LIMIT = 10
const IP_REQUEST_LIMIT = 300

export interface LoginRateLimitContext {
  accountKey: string
  failureKey: string
  ipKey: string
}

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown'

export const getLoginRateLimitContext = (req: Request, username?: string): LoginRateLimitContext => {
  const normalizedUsername = (username || '').trim().toLowerCase()
  const accountKey = `auth:login:account:${digest(normalizedUsername || 'invalid')}`
  return {
    accountKey,
    failureKey: `${accountKey}:failures:${digest(clientIp(req))}`,
    ipKey: `auth:login:ip:${digest(clientIp(req))}`,
  }
}

export const loginRateLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Development/test may run without Redis. Production must share counters
  // through Redis; returning 503 is safer than silently bypassing the limit.
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    next()
    return
  }

  const context = getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  const ipWindow = await cacheService.consumeRateLimit(context.ipKey, IP_REQUEST_LIMIT, WINDOW_SECONDS)
  if (!ipWindow) {
    res.status(503).json({ code: -1, message: '登录服务暂时不可用，请稍后再试' })
    return
  }
  if (!ipWindow.allowed) {
    res.status(429).json({ code: -1, message: '请求过于频繁，请15分钟后再试' })
    return
  }

  const accountFailure = await cacheService.getRateLimitState(context.failureKey)
  if (!accountFailure) {
    res.status(503).json({ code: -1, message: '登录服务暂时不可用，请稍后再试' })
    return
  }
  if (accountFailure && accountFailure.count >= ACCOUNT_FAILURE_LIMIT) {
    res.status(429).json({ code: -1, message: '登录尝试次数过多，请15分钟后再试' })
    return
  }

  ;(req as Request & { loginRateLimitContext?: LoginRateLimitContext }).loginRateLimitContext = context
  next()
}

export const recordLoginFailure = async (req: Request): Promise<void> => {
  const request = req as Request & { loginRateLimitContext?: LoginRateLimitContext }
  const context = request.loginRateLimitContext || getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  await cacheService.consumeRateLimit(context.failureKey, ACCOUNT_FAILURE_LIMIT, WINDOW_SECONDS)
}

export const clearLoginFailures = async (req: Request): Promise<void> => {
  const request = req as Request & { loginRateLimitContext?: LoginRateLimitContext }
  const context = request.loginRateLimitContext || getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  await cacheService.del(context.failureKey)
}
