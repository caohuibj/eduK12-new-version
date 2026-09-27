import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCacheService } = vi.hoisted(() => ({
  mockCacheService: {
    consumeRateLimit: vi.fn(),
    getRateLimitState: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('../../services/cacheService', () => ({ cacheService: mockCacheService }))

import {
  clearLoginFailures,
  getLoginRateLimitContext,
  loginRateLimit,
  recordLoginFailure,
  withLoginAccountFailureThrottle,
} from '../../middleware/loginRateLimit'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

const makeReq = (ip = '198.51.100.10', username = 'victim@example.com') => ({
  ip,
  socket: { remoteAddress: ip },
  body: { username },
}) as any

const makeRes = () => {
  const res: any = { statusCode: 0, body: null, setHeader: vi.fn() }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

describe('login Redis rate limits', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    vi.resetAllMocks()
    mockCacheService.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 299,
      retryAfterSeconds: 900,
    })
    mockCacheService.getRateLimitState.mockResolvedValue({ count: 0, retryAfterSeconds: 900 })
    mockCacheService.del.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV
  })

  it('uses one account-wide key in addition to the account+IP key', () => {
    const first = getLoginRateLimitContext(makeReq('198.51.100.10'), 'Victim@Example.com')
    const second = getLoginRateLimitContext(makeReq('198.51.100.11'), 'victim@example.com')

    expect(first.globalFailureKey).toBe(second.globalFailureKey)
    expect(first.failureKey).not.toBe(second.failureKey)
    expect(first.ipKey).not.toBe(second.ipKey)
  })

  it('reads both failure dimensions without hard-locking a globally attacked account', async () => {
    mockCacheService.getRateLimitState.mockResolvedValue({ count: 0, retryAfterSeconds: 900 })
    const req = makeReq()
    const context = getLoginRateLimitContext(req, req.body.username)
    const res = makeRes()
    res.setHeader = vi.fn()
    const next = vi.fn()

    await loginRateLimit(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCacheService.getRateLimitState).toHaveBeenCalledTimes(2)
    expect(mockCacheService.getRateLimitState).toHaveBeenCalledWith(context.failureKey)
    expect(mockCacheService.getRateLimitState).toHaveBeenCalledWith(context.globalFailureKey)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(context.ipKey, 3000, 900)
  })

  it('blocks repeated bad credentials only for the same account+IP source', async () => {
    mockCacheService.getRateLimitState.mockResolvedValue({ count: 10, retryAfterSeconds: 240 })
    const req = makeReq()
    const res = makeRes()
    res.setHeader = vi.fn()
    const next = vi.fn()

    await loginRateLimit(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(res.body.message).toBe('用户名或密码错误')
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '240')
  })

  it('records and clears both account failure dimensions', async () => {
    const req = makeReq()
    const context = getLoginRateLimitContext(req, req.body.username)

    const result = await recordLoginFailure(req)
    expect(result).toEqual({ accountIpAllowed: true, accountGlobalAllowed: true, retryAfterSeconds: 1 })
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledTimes(2)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(context.failureKey, 10, 900)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(context.globalFailureKey, 50, 900)

    await clearLoginFailures(req)
    expect(mockCacheService.del).toHaveBeenCalledTimes(2)
    expect(mockCacheService.del).toHaveBeenCalledWith(context.failureKey)
    expect(mockCacheService.del).toHaveBeenCalledWith(context.globalFailureKey)
  })

  it('reports post-failure throttling without turning it into a pre-auth account lock', async () => {
    mockCacheService.consumeRateLimit
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 300 })
      .mockResolvedValueOnce({ allowed: true, remaining: 49, retryAfterSeconds: 900 })
    const result = await recordLoginFailure(makeReq())
    expect(result).toEqual({
      accountIpAllowed: false,
      accountGlobalAllowed: true,
      retryAfterSeconds: 300,
    })
  })

  it('marks a distributed failure budget for real verification throttling, not a 15-minute lock', async () => {
    const req = makeReq()
    mockCacheService.getRateLimitState.mockImplementation(async (key: string) => ({
      count: key.endsWith(':global') ? 50 : 0, retryAfterSeconds: 900,
    }))
    const next = vi.fn()
    await loginRateLimit(req, makeRes(), next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.loginRateLimitContext.globalFailureLimited).toBe(true)
  })

  it('fails closed when either Redis failure dimension is unavailable', async () => {
    mockCacheService.getRateLimitState.mockImplementation(async (key: string) => key.endsWith(':global') ? null : { count: 0, retryAfterSeconds: 900 })
    const next = vi.fn()
    const res = makeRes()
    await loginRateLimit(makeReq(), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(503)
  })

  it('serializes the actual same-account operation across IPs, not different accounts behind one NAT', async () => {
    let finish!: () => void
    const inside = vi.fn(async () => new Promise<void>((resolve) => { finish = resolve }))
    const handler = withLoginAccountFailureThrottle(inside)
    const pending = handler(makeReq(), makeRes(), vi.fn())
    await Promise.resolve()
    const competing = makeRes()
    await handler(makeReq('198.51.100.11'), competing, vi.fn())
    expect(competing.statusCode).toBe(503)
    expect(inside).toHaveBeenCalledOnce()
    const other = vi.fn(async () => undefined)
    await withLoginAccountFailureThrottle(other)(makeReq('198.51.100.10', 'another-student'), makeRes(), vi.fn())
    expect(other).toHaveBeenCalledOnce()
    finish()
    await pending
    await withLoginAccountFailureThrottle(other)(makeReq(), makeRes(), vi.fn())
    expect(other).toHaveBeenCalledTimes(2)
  })

  it('retains only the account permit after a bad credential exhausts the shared failure budget', async () => {
    vi.useFakeTimers()
    mockCacheService.consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 })
    const req = makeReq('198.51.100.10', 'distributed-target')
    const handler = vi.fn(async (request: any) => { await recordLoginFailure(request) })
    const wrapped = withLoginAccountFailureThrottle(handler)
    const pending = wrapped(req, makeRes(), vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(handler).toHaveBeenCalledOnce()
    const busy = makeRes()
    await wrapped(makeReq('198.51.100.11', 'distributed-target'), busy, vi.fn())
    expect(busy.statusCode).toBe(503)
    expect(handler).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1001)
    await pending
    // Valid credentials can proceed as soon as the one-second interval ends;
    // no account-global fifteen-minute lock was installed.
    const correct = vi.fn(async () => undefined)
    await withLoginAccountFailureThrottle(correct)(makeReq('198.51.100.12', 'distributed-target'), makeRes(), vi.fn())
    expect(correct).toHaveBeenCalledOnce()
  })

  it('does not turn infrastructure errors into credential failures or leak a permit', async () => {
    const req = makeReq('198.51.100.10', 'infra-account')
    req.loginRateLimitContext = { ...getLoginRateLimitContext(req, req.body.username), globalFailureLimited: true }
    const next = vi.fn()
    const failure = new Error('database unavailable')
    await withLoginAccountFailureThrottle(async () => { throw failure })(req, makeRes(), next)
    expect(next).toHaveBeenCalledWith(failure)
    expect(mockCacheService.consumeRateLimit).not.toHaveBeenCalled()
    const success = vi.fn(async () => undefined)
    await withLoginAccountFailureThrottle(success)(req, makeRes(), next)
    expect(success).toHaveBeenCalledOnce()
  })

})
