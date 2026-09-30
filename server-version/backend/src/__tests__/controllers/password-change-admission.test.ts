import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({ consume: vi.fn() }))
vi.mock('../../services/cacheService', () => ({ cacheService: { consumeRateLimit: mocked.consume } }))
import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../../middleware/passwordChangeAdmission'
import { loginPasswordVerificationAdmission } from '../../middleware/loginRateLimit'
const response = () => { const res: any = { destroyed: false }; res.setHeader = vi.fn(); res.status = vi.fn(() => res); res.json = vi.fn(() => res); return res }
describe('password change abuse boundary', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', 'production'); mocked.consume.mockReset() })
  it('shares account budget across both URLs and IPs', async () => {
    mocked.consume.mockResolvedValue({ allowed: true, remaining: 9 })
    for (const path of ['/auth/change-password', '/users/change-password']) await passwordChangeRateLimit({ user: { userId: 'same' }, path, ip: path } as any, response(), vi.fn())
    expect(mocked.consume.mock.calls[0][0]).toBe(mocked.consume.mock.calls[1][0])
  })
  it('rejects exhaustion before password work with retry semantics', async () => {
    mocked.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 42 })
    const next = vi.fn(); const res = response()
    await passwordChangeRateLimit({ user: { userId: 'same' } } as any, res, next)
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(429); expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42')
  })
  it('holds the shared bcrypt permit through the successful hash, even after disconnect', async () => {
    let release!: () => void; let entered!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve }); const started = new Promise<void>(resolve => { entered = resolve })
    const res = response()
    const running = withPasswordChangeAdmission(async () => { entered(); await barrier })( {} as any, res, vi.fn())
    await started; res.destroyed = true
    expect(loginPasswordVerificationAdmission.getStats().active).toBe(1)
    release(); await running; expect(loginPasswordVerificationAdmission.getStats().active).toBe(0)
  })
})
