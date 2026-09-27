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
} from '../../middleware/loginRateLimit'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

const makeReq = (ip = '198.51.100.10', username = 'victim@example.com') => ({
  ip,
  socket: { remoteAddress: ip },
  body: { username },
}) as any

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
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
    vi.clearAllMocks()
    mockCacheService.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 299,
      retryAfterSeconds: 900,
    })
    mockCacheService.getRateLimitState.mockResolvedValue({ count: 0, retryAfterSeconds: 900 })
    mockCacheService.del.mockResolvedValue(undefined)
  })

  afterEach(() => {
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

  it('checks only the account+IP failure key before password verification', async () => {
    mockCacheService.getRateLimitState.mockResolvedValue({ count: 0, retryAfterSeconds: 900 })
    const req = makeReq()
    const context = getLoginRateLimitContext(req, req.body.username)
    const res = makeRes()
    res.setHeader = vi.fn()
    const next = vi.fn()

    await loginRateLimit(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCacheService.getRateLimitState).toHaveBeenCalledOnce()
    expect(mockCacheService.getRateLimitState).toHaveBeenCalledWith(context.failureKey)
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
    expect(result).toEqual({ accountIpAllowed: true, accountGlobalAllowed: true, retryAfterSeconds: 900 })
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
      retryAfterSeconds: 900,
    })
  })

})
