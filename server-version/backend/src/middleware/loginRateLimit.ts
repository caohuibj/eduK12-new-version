import crypto from 'node:crypto'
import { Request, Response, NextFunction, type RequestHandler } from 'express'
import { performance } from 'node:perf_hooks'
import { cacheService } from '../services/cacheService'
import { BoundedAdmissionGate, configuredInteger } from '../services/boundedAdmissionGate'
import { recordBoundedAdmissionRejection, setBoundedAdmissionGateState } from '../services/runtimeObservability'

const WINDOW_SECONDS = 15 * 60
const ACCOUNT_FAILURE_LIMIT = 10
const ACCOUNT_GLOBAL_FAILURE_LIMIT = 50

// Ingress/NAT fuse, independent of credential failure budgets. This is an
// operator-configurable conservative starting point, not a measured capacity.
const ingressRequestLimit = configuredInteger('LOGIN_IP_REQUEST_LIMIT', 3000)
const maxTrackedAccounts = configuredInteger('LOGIN_MAX_ACTIVE_ACCOUNTS', 2048)
const accountFailureIntervalMs = 1000
const activeAccounts = new Map<string, symbol>()

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
  globalFailureLimited?: boolean
  credentialFailed?: boolean
}

export interface LoginFailureBudgetResult {
  accountIpAllowed: boolean
  accountGlobalAllowed: boolean
  retryAfterSeconds: number
}

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown'

export const getLoginRateLimitContext = (req: Request, username?: string): LoginRateLimitContext => {
  const normalizedUsername = (req.originalUrl.startsWith('/api/campus/') ? 'school:' : 'legacy:') + (username || '').trim().toLowerCase()
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
  const ipWindow = await cacheService.consumeRateLimit(context.ipKey, ingressRequestLimit, WINDOW_SECONDS)
  if (!ipWindow) {
    res.status(503).json({ code: -1, message: '登录服务暂时不可用，请稍后再试' })
    return
  }
  if (!ipWindow.allowed) {
    res.setHeader('Retry-After', String(ipWindow.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '请求过于频繁，请稍后再试' })
    return
  }

  // A single source may not brute-force one account indefinitely. This scope
  // cannot globally lock the account because another IP has an independent key.
  const [accountIpFailures, accountGlobalFailures] = await Promise.all([
    cacheService.getRateLimitState(context.failureKey),
    cacheService.getRateLimitState(context.globalFailureKey),
  ])
  if (!accountIpFailures || !accountGlobalFailures) {
    res.status(503).json({ code: -1, message: '登录服务暂时不可用，请稍后再试' })
    return
  }
  if (accountIpFailures.count >= ACCOUNT_FAILURE_LIMIT) {
    res.setHeader('Retry-After', String(accountIpFailures.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '用户名或密码错误' })
    return
  }

  // A distributed attack activates a short real verification throttle, not
  // a fifteen-minute account lockout. The wrapper owns its operation lifetime.
  context.globalFailureLimited = accountGlobalFailures.count >= ACCOUNT_GLOBAL_FAILURE_LIMIT
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
  context.credentialFailed = true
  context.globalFailureLimited ||= !accountGlobal.allowed
  request.loginRateLimitContext = context
  return {
    accountIpAllowed: accountIp.allowed,
    accountGlobalAllowed: accountGlobal.allowed,
    // Only a violated dimension imposes a wait. The global dimension is a
    // one-second soft throttle; an IP-specific denial retains its real TTL.
    retryAfterSeconds: !accountIp.allowed ? accountIp.retryAfterSeconds : 1,
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

/** At most one live login operation per account, without queueing same-account
 * callers. Distinct accounts behind one school NAT do not block each other.
 * After the shared failure budget is exhausted, failed operations retain only
 * this lightweight permit for at least one second, outside the bcrypt gate.
 * Correct credentials are not held for the failure window. All waits end in a
 * finally block; HTTP disconnect cannot open an extra verification slot.
 */
export const withLoginAccountFailureThrottle = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  const request = req as Request & { loginRateLimitContext?: LoginRateLimitContext }
  const context = request.loginRateLimitContext ?? getLoginRateLimitContext(req, typeof req.body?.username === 'string' ? req.body.username : undefined)
  request.loginRateLimitContext = context
  if (activeAccounts.has(context.accountKey) || activeAccounts.size >= maxTrackedAccounts) {
    recordBoundedAdmissionRejection('login_account_failure', 'queue_full')
    res.setHeader('Retry-After', '1')
    res.status(503).json({ code: -1, message: '登录服务繁忙，请稍后重试' })
    return
  }
  const owner = Symbol()
  const startedAt = performance.now()
  activeAccounts.set(context.accountKey, owner)
  setBoundedAdmissionGateState('login_account_failure', activeAccounts.size, 0)
  try {
    await handler(req, res, next)
  } catch (error) {
    next(error)
  } finally {
    if (context.globalFailureLimited && context.credentialFailed) {
      const remaining = accountFailureIntervalMs - (performance.now() - startedAt)
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining))
    }
    if (activeAccounts.get(context.accountKey) === owner) activeAccounts.delete(context.accountKey)
    setBoundedAdmissionGateState('login_account_failure', activeAccounts.size, 0)
  }
}
