import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  consume: vi.fn(), school: vi.fn(), survey: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: {
  campusMfaChallenge: { findFirst: state.school }, surveyMfaChallenge: { findFirst: state.survey },
} }))
vi.mock('../../services/cacheService', () => ({ cacheService: { consumeRateLimit: state.consume } }))
import { createMfaAttemptRateLimiter } from '../../middleware/mfaAttemptRateLimit'
const original = process.env.NODE_ENV
const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.setHeader = vi.fn()
  res.status = vi.fn((code: number) => { res.statusCode = code; return res })
  res.json = vi.fn((body: unknown) => { res.body = body; return res })
  return res
}
const limiter = (realm: 'SCHOOL' | 'SURVEY' = 'SCHOOL', name = 'campus-mfa-challenge') =>
  createMfaAttemptRateLimiter({ realm, ipName: name, pendingCookieName: realm === 'SCHOOL' ? 'huischool_mfa_pending' : 'huisurvey_mfa_pending' })
const pendingReq = () => ({
  ip: '192.0.2.1', socket: {}, headers: { cookie: 'huischool_mfa_pending=' + 'a'.repeat(43) },
}) as any

describe('Account-scoped MFA budget behind shared NAT', () => {
  beforeEach(() => {
    vi.resetAllMocks(); process.env.NODE_ENV = 'production'
    state.consume.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 900 })
    state.school.mockResolvedValue({ userId: 'user-a' })
    state.survey.mockResolvedValue({ userId: 'user-a' })
  })
  afterEach(() => { process.env.NODE_ENV = original })
  it('admits 60 different accounts behind one IP without merging their account budgets', async () => {
    const counts = new Map<string, number>()
    state.consume.mockImplementation(async (key: string, limit: number) => {
      const n = (counts.get(key) ?? 0) + 1; counts.set(key, n)
      return { allowed: n <= limit, remaining: Math.max(0, limit - n), retryAfterSeconds: 900 }
    })
    const next = vi.fn()
    for (let i = 0; i < 60; i++) await limiter()({
      ip: '192.0.2.1', socket: {}, headers: {}, user: { userId: 'user-' + i, accountDomain: 'SCHOOL' },
    } as any, makeRes(), next)
    expect(next).toHaveBeenCalledTimes(60)
    expect(counts.size).toBe(61) // one IP fuse, 60 independent accounts
    expect(state.school).not.toHaveBeenCalled()
  })
  it('enforces a 20-attempt per-account budget despite rotating pending challenges', async () => {
    const counts = new Map<string, number>()
    state.consume.mockImplementation(async (key: string, limit: number) => {
      const n = (counts.get(key) ?? 0) + 1; counts.set(key, n)
      return { allowed: n <= limit, remaining: Math.max(0, limit - n), retryAfterSeconds: 900 }
    })
    const next = vi.fn(), responses: any[] = []
    for (let i = 0; i < 21; i++) {
      const req = pendingReq()
      req.headers.cookie = 'huischool_mfa_pending=' + String(i).padStart(43, 'b')
      const res = makeRes(); responses.push(res)
      await limiter()(req, res, next)
    }
    expect(next).toHaveBeenCalledTimes(20)
    expect(responses.at(-1).statusCode).toBe(429)
  })
  it('shares School and Teacher account counters without sharing their IP fuses', async () => {
    const req = pendingReq()
    await limiter('SCHOOL', 'campus-mfa-challenge')(req, makeRes(), vi.fn())
    await limiter('SCHOOL', 'huiteacher-mfa-challenge')(req, makeRes(), vi.fn())
    expect(state.consume.mock.calls[1][0]).toBe(state.consume.mock.calls[3][0])
    expect(state.consume.mock.calls[0][0]).not.toBe(state.consume.mock.calls[2][0])
  })
  it('keeps Survey account counters separate from School', async () => {
    await limiter()(pendingReq(), makeRes(), vi.fn())
    await limiter('SURVEY', 'survey-mfa-challenge')({
      ...pendingReq(), headers: { cookie: 'huisurvey_mfa_pending=' + 'a'.repeat(43) },
    } as any, makeRes(), vi.fn())
    expect(state.consume.mock.calls[1][0]).not.toBe(state.consume.mock.calls[3][0])
  })
  it('rejects a coarse IP flood before hitting the database', async () => {
    state.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 })
    const res = makeRes(), next = vi.fn()
    await limiter()(pendingReq(), res, next)
    expect(res.statusCode).toBe(429); expect(next).not.toHaveBeenCalled()
    expect(state.school).not.toHaveBeenCalled()
  })
  it('does not create arbitrary account counters from unknown client cookies', async () => {
    state.school.mockResolvedValue(null)
    await limiter()(pendingReq(), makeRes(), vi.fn())
    expect(state.consume).toHaveBeenCalledTimes(1)
  })
  it('does not look up malformed pending cookies', async () => {
    const req = pendingReq(); req.headers.cookie = 'huischool_mfa_pending=bad'
    await limiter()(req, makeRes(), vi.fn())
    expect(state.school).not.toHaveBeenCalled()
    expect(state.consume).toHaveBeenCalledTimes(1)
  })
  it('fails closed when Redis is unavailable', async () => {
    state.consume.mockResolvedValue(null)
    const res = makeRes(), next = vi.fn()
    await limiter()(pendingReq(), res, next)
    expect(res.statusCode).toBe(503); expect(next).not.toHaveBeenCalled()
  })
  it('fails closed when the pending-account lookup fails', async () => {
    state.school.mockRejectedValue(new Error('database unavailable'))
    const res = makeRes(), next = vi.fn()
    await limiter()(pendingReq(), res, next)
    expect(res.statusCode).toBe(503); expect(next).not.toHaveBeenCalled()
  })
  it('uses live, unconsumed challenge bounds and never accepts a caller username as authority', async () => {
    const req = pendingReq(); req.body = { username: 'caller-selected-other-user' }
    await limiter()(req, makeRes(), vi.fn())
    expect(state.school).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ consumedAt: null, failedCount: { lt: 5 }, expiresAt: { gt: expect.any(Date) } }),
      select: { userId: true },
    }))
  })
})
