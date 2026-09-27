import crypto from 'node:crypto'
import { Request, Response, NextFunction } from 'express'
import { cacheService } from '../services/cacheService'
import { BoundedAdmissionGate, configuredInteger } from '../services/boundedAdmissionGate'

const WINDOW_SECONDS = 15 * 60
const ACCOUNT_FAILURE_LIMIT = 10
const ACCOUNT_GLOBAL_FAILURE_LIMIT = 50

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

// This is an ingress/NAT safety fuse, not the credential-abuse budget. Keep it
// comfortably above a normal classroom burst and tune the production value on
// the real 4C4G host.
const ipRequestLimit = () => positiveInt(process.env.LOGIN_IP_REQUEST_LIMIT, 3000)

export const loginPasswordVerificationAdmission = new BoundedAdmissionGate({
  name: 'login_password_verify',
  maxConcurrent: configuredInteger('LOGIN_PASSWORD_MAX_CONCURRENT', 4),
  maxQueue: configuredInteger('LOGIN_PASSWORD_MAX_QUEUE', 512, true),
  maxWaitMs: configuredInteger('LOGIN_PASSWORD_MAX_WAIT_MS', 30_000),
  retryAfterSeconds: 1,
  busyCode: 'LOGIN_VERIFY_BUSY',
  busyMessage: '登录服务繁忙，请稍后重试',
})

export const withLoginPasswordVerification = <T>(operation: () => Promise<T>): Promise<T> =>
  loginPasswordVerificationAdmission.run(operation)

export interface LoginRateLimitContext {
  accountKey: string
  failureKey: string
  globalFailureKey: string
  ipKey: string
}

export interface LoginFailureBudgetResult {
  accountIpAllowed: boolean
  accountGlobalAllowed: boolean
  retryAfterSeconds: number
}

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown'

export const getLoginRateLimitContext = (req: Request, username?: string): LoginRateLimitContext => {
  const normalizedUsername = (username || '').trim().toLowerCase()
  const accountKey = `auth:login:account:${digest(normalizedUsername || 'invalid')}`
  return {
    accountKey,
    failureKey: `${accountKey}:failures:${digest(clientIp(req))}`,
    globalFailureKey: `${accountKey}:failures:global`,
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
  const ipWindow = await cacheService.consumeRateLimit(context.ipKey, ipRequestLimit(), WINDOW_SECONDS)
  if (!ipWindow) {
    res.status(503).json({ code: -1, message: '登录服务暂时不可用，请稍后再试' })
    return
  }
  if (!ipWindow.allowed) {
    res.setHeader('Retry-After', String(ipWindow.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '请求过于频繁，请稍后再试' })
    return
  }

  // Failure budgets are evaluated only after a failed credential check. A
  // correct password is never account-locked by somebody else's failures.
  ;(req as Request & { loginRateLimitContext?: LoginRateLimitContext }).loginRateLimitContext = context
  next()
}

export const recordLoginFailure = async (req: Request): Promise<LoginFailureBudgetResult | null> => {
  const request = req as Request & { loginRateLimitContext?: LoginRateLimitContext }
  const context = request.loginRateLimitContext || getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  const [accountIp, accountGlobal] = await Promise.all([
    cacheService.consumeRateLimit(context.failureKey, ACCOUNT_FAILURE_LIMIT, WINDOW_SECONDS),
    cacheService.consumeRateLimit(context.globalFailureKey, ACCOUNT_GLOBAL_FAILURE_LIMIT, WINDOW_SECONDS),
  ])
  if (!accountIp || !accountGlobal) return null
  return {
    accountIpAllowed: accountIp.allowed,
    accountGlobalAllowed: accountGlobal.allowed,
    retryAfterSeconds: Math.max(accountIp.retryAfterSeconds, accountGlobal.retryAfterSeconds),
  }
}

export const clearLoginFailures = async (req: Request): Promise<void> => {
  const request = req as Request & { loginRateLimitContext?: LoginRateLimitContext }
  const context = request.loginRateLimitContext || getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  await Promise.all([
    cacheService.del(context.failureKey),
    cacheService.del(context.globalFailureKey),
  ])
}
