import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), comparePassword: vi.fn(), generateToken: vi.fn(), setSessionCookie: vi.fn(),
  recordLoginFailure: vi.fn(), clearLoginFailures: vi.fn(), withLoginPasswordVerification: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }))
vi.mock('../../utils/password', () => ({
  comparePassword: mocks.comparePassword, hashPassword: vi.fn(), isValidPassword: vi.fn(), PASSWORD_MIN_LENGTH: 8, PASSWORD_MAX_LENGTH: 128,
}))
vi.mock('../../utils/jwt', () => ({ generateToken: mocks.generateToken }))
vi.mock('../../utils/authCookies', () => ({ setSessionCookie: mocks.setSessionCookie, clearSessionCookie: vi.fn() }))
vi.mock('../../middleware/loginRateLimit', () => ({
  recordLoginFailure: mocks.recordLoginFailure, clearLoginFailures: mocks.clearLoginFailures,
  withLoginPasswordVerification: mocks.withLoginPasswordVerification,
}))
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }))
import { authController } from '../../controllers/authController'

const user = { id: 'student', username: 'student', role: 'STUDENT', passwordHash: 'test-hash',
  isActive: true, isFrozen: false, expiresAt: null, tokenVersion: 1, mustChangePassword: false }
const request = (body = { username: 'student', password: 'secret-password-1' }) => ({ body }) as any
const response = () => {
  const res: any = { code: 200, setHeader: vi.fn() }
  res.status = vi.fn((code: number) => { res.code = code; return res })
  res.json = vi.fn(() => res)
  return res
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findUnique.mockResolvedValue(user)
  mocks.comparePassword.mockResolvedValue(true)
  mocks.withLoginPasswordVerification.mockImplementation((operation: () => unknown) => operation())
  mocks.recordLoginFailure.mockResolvedValue({ accountIpAllowed: true, accountGlobalAllowed: true, retryAfterSeconds: 1 })
  mocks.clearLoginFailures.mockResolvedValue(undefined)
  mocks.generateToken.mockReturnValue('test-only-session')
})

describe('bounded login execution and failure classification', () => {
  it('reads current account authority only after admission to password work', async () => {
    let admit!: () => void
    const admitted = new Promise<void>((resolve) => { admit = resolve })
    mocks.withLoginPasswordVerification.mockImplementation(async (operation: () => unknown) => { await admitted; return operation() })
    const res = response()
    const pending = authController.login(request(), res)
    await Promise.resolve()
    expect(mocks.findUnique).not.toHaveBeenCalled()
    mocks.findUnique.mockResolvedValue({ ...user, isFrozen: true })
    admit()
    await pending
    expect(res.code).toBe(401)
    expect(mocks.comparePassword).not.toHaveBeenCalled()
    expect(mocks.generateToken).not.toHaveBeenCalled()
  })

  it.each(['database', 'verification', 'redis'])('does not record a %s outage as a credential failure', async (phase) => {
    if (phase === 'database') mocks.findUnique.mockRejectedValue(new Error('database down'))
    if (phase === 'verification') mocks.comparePassword.mockRejectedValue(new Error('verification infrastructure error'))
    if (phase === 'redis') mocks.clearLoginFailures.mockRejectedValue(new Error('Redis down'))
    const res = response()
    await authController.login(request(), res)
    expect(res.code).toBe(503)
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
    expect(mocks.generateToken).not.toHaveBeenCalled()
  })

  it.each([null, { ...user, isActive: false }, { ...user, isFrozen: true }, { ...user, expiresAt: new Date(0) }])('uses the same credential error for missing or unusable authority', async (current) => {
    mocks.findUnique.mockResolvedValue(current)
    const res = response()
    await authController.login(request(), res)
    expect(res.code).toBe(401)
    expect(res.json).toHaveBeenCalledWith({ code: -1, message: '用户名或密码错误', data: null })
    expect(mocks.recordLoginFailure).toHaveBeenCalledOnce()
  })

  it('bounds retained password and username input before admission, lookup or hashing', async () => {
    for (const body of [
      { username: 'student', password: 'x'.repeat(129) },
      { username: 'x'.repeat(321), password: 'password-1' },
      { username: 'student', password: 'password-1', unusedLargeField: 'x'.repeat(10000) },
    ]) {
      const res = response()
      await authController.login(request(body), res)
      expect(res.code).toBe(401)
    }
    expect(mocks.withLoginPasswordVerification).not.toHaveBeenCalled()
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.comparePassword).not.toHaveBeenCalled()
  })

  it('preserves successful credentials, token version and cookie delivery', async () => {
    const req = request()
    const res = response()
    await authController.login(req, res)
    expect(mocks.comparePassword).toHaveBeenCalledWith('secret-password-1', 'test-hash')
    expect(mocks.generateToken).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, tokenVersion: 1 }))
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(req, res, 'test-only-session')
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
  })
})
