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

  it('blocks distributed failures after the account-wide budget', async () => {
    mockCacheService.getRateLimitState
      .mockResolvedValueOnce({ count: 0, retryAfterSeconds: 900 })
      .mockResolvedValueOnce({ count: 50, retryAfterSeconds: 900 })
    const res = makeRes()
    const next = vi.fn()

    await loginRateLimit(makeReq(), res, next)

    expect(res.statusCode).toBe(429)
    expect(res.body.message).toContain('登录尝试次数过多')
    expect(next).not.toHaveBeenCalled()
  })

  it('records and clears both account failure dimensions', async () => {
    const req = makeReq()
    const context = getLoginRateLimitContext(req, req.body.username)

    await recordLoginFailure(req)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledTimes(2)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(context.failureKey, 10, 900)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(context.globalFailureKey, 50, 900)

    await clearLoginFailures(req)
    expect(mockCacheService.del).toHaveBeenCalledTimes(2)
    expect(mockCacheService.del).toHaveBeenCalledWith(context.failureKey)
    expect(mockCacheService.del).toHaveBeenCalledWith(context.globalFailureKey)
  })
})
