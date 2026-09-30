import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ consume: vi.fn() }))
vi.mock('../../services/cacheService', () => ({ cacheService: { consumeRateLimit: mock.consume } }))
import { registrationRateLimit } from '../../middleware/registrationAdmission'
const counters = new Map<string, number>()
const response = () => { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(); r.setHeader = vi.fn(); return r }
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production'); counters.clear(); vi.clearAllMocks()
  mock.consume.mockImplementation(async (key, limit) => { const n = (counters.get(key) ?? 0) + 1; counters.set(key, n); return { allowed: n <= limit, remaining: Math.max(0, limit - n), retryAfterSeconds: 900 } })
})
afterEach(() => vi.unstubAllEnvs())
it('admits 300 different students across several classes behind the same school NAT', async () => {
  for (let n = 0; n < 300; n++) {
    const next = vi.fn(); const res = response()
    await registrationRateLimit({ ip: 'school-nat', body: { username: `student-${n}`, courseCode: `class-${n % 5}` } } as any, res, next)
    expect(next).toHaveBeenCalledOnce(); expect(res.status).not.toHaveBeenCalled()
  }
})
it('limits one account across different IPs and returns retry semantics', async () => {
  let last: any
  for (let n = 0; n < 11; n++) { last = response(); await registrationRateLimit({ ip: `ip-${n}`, body: { username: 'same-account', courseCode: 'course' } } as any, last, vi.fn()) }
  expect(last.status).toHaveBeenCalledWith(429); expect(last.setHeader).toHaveBeenCalledWith('Retry-After', '900')
})
it('shares teacher-code budgets across registration/verification and fails closed on Redis outage', async () => {
  for (let n = 0; n < 120; n++) await registrationRateLimit({ ip: `ip-${n}`, body: { teacherCode: 'validcode' } } as any, response(), vi.fn())
  const limited = response(); await registrationRateLimit({ ip: 'other', body: { teacherCode: 'VALIDCODE' } } as any, limited, vi.fn())
  expect(limited.status).toHaveBeenCalledWith(429)
  mock.consume.mockResolvedValue(null)
  const outage = response(); await registrationRateLimit({ ip: 'other', body: {} } as any, outage, vi.fn())
  expect(outage.status).toHaveBeenCalledWith(503)
})

it('applies one global Redis fuse before all account and resource budgets', async () => {
  mock.consume.mockImplementation(async (key) => ({ allowed: !key.startsWith('ratelimit:registration:global:'), retryAfterSeconds: 900 }))
  const res = response(); const next = vi.fn()
  await registrationRateLimit({ ip: 'random-ip', body: { username: 'random-account' } } as any, res, next)
  expect(mock.consume).toHaveBeenCalledTimes(1)
  expect(mock.consume.mock.calls[0][1]).toBe(6000)
  expect(res.status).toHaveBeenCalledWith(429); expect(next).not.toHaveBeenCalled()
})
