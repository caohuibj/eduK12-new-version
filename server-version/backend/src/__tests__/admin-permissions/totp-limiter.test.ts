import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { lookup, budget } = vi.hoisted(() => ({ lookup: vi.fn(), budget: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { adminSecurityChallenge: { findFirst: lookup } } }))
vi.mock('../../services/cacheService', () => ({ cacheService: { consumeRateLimit: budget } }))
import { adminTotpAttemptLimiter } from '../../modules/admin-permissions/totp'
function context() {
  const req = { headers: { cookie: 'eduk12_admin_challenge=' + randomBytes(32).toString('base64url') }, ip: '127.0.0.1', socket: {} } as any
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() } as any
  return { req, res, next: vi.fn() }
}
beforeEach(() => { vi.clearAllMocks(); lookup.mockResolvedValue({ userId: 'server-owned-account' }); budget.mockResolvedValue({ allowed: true, retryAfterSeconds: 900 }) })
describe('administrator OTP budgets fail closed', () => {
  it('uses the server challenge account and both IP/account budgets', async () => {
    const c = context(); await adminTotpAttemptLimiter(c.req, c.res, c.next)
    expect(budget.mock.calls).toHaveLength(2)
    expect(budget.mock.calls[1][0]).toMatch(/^ratelimit:admin-totp:account:[a-f0-9]{64}$/)
    expect(c.next).toHaveBeenCalledOnce()
  })
  it('denies on unavailable Redis and never proceeds to verify a code', async () => {
    budget.mockResolvedValueOnce(null)
    const c = context(); await adminTotpAttemptLimiter(c.req, c.res, c.next)
    expect(c.res.status).toHaveBeenCalledWith(503); expect(c.next).not.toHaveBeenCalled()
  })
  it('denies on identity lookup failure', async () => {
    lookup.mockRejectedValueOnce(new Error('synthetic DB outage'))
    const c = context(); await adminTotpAttemptLimiter(c.req, c.res, c.next)
    expect(c.res.status).toHaveBeenCalledWith(503); expect(c.next).not.toHaveBeenCalled()
  })
  it('returns a bounded Retry-After when the shared account budget is exhausted', async () => {
    budget.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 123 })
    const c = context(); await adminTotpAttemptLimiter(c.req, c.res, c.next)
    expect(c.res.status).toHaveBeenCalledWith(429); expect(c.res.setHeader).toHaveBeenCalledWith('Retry-After', '123'); expect(c.next).not.toHaveBeenCalled()
  })
})
