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
const request = (body: Record<string, unknown> = { username: 'student', password: 'secret-password-1' }) => ({ body }) as any
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
    expect(mocks.comparePassword).toHaveBeenCalledOnce()
    expect(mocks.comparePassword.mock.calls[0][1]).toMatch(/^\$2a\$10\$/)
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

  it.each([null, { ...user, isActive: false }, { ...user, isFrozen: true }, { ...user, expiresAt: new Date(0) }, { ...user, role: 'TEACHER', teacherApproved: false }])('awaits bounded verification and never authenticates dummy success for unusable authority', async (current) => {
    mocks.findUnique.mockResolvedValue(current)
    let settle!: (matched: boolean) => void
    mocks.comparePassword.mockImplementation(() => new Promise<boolean>(resolve => { settle = resolve }))
    const res = response()
    const pending = authController.login(request(), res)
    await vi.waitFor(() => expect(mocks.comparePassword).toHaveBeenCalledOnce())
    expect(mocks.comparePassword.mock.calls[0][1]).toMatch(/^\$2a\$10\$/)
    expect(res.json).not.toHaveBeenCalled()
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
    settle(true)
    await pending
    expect(res.code).toBe(401)
    expect(res.json).toHaveBeenCalledWith({ code: -1, message: '用户名或密码错误', data: null })
    expect(mocks.recordLoginFailure).toHaveBeenCalledOnce()
    expect(mocks.generateToken).not.toHaveBeenCalled()
    expect(mocks.setSessionCookie).not.toHaveBeenCalled()
  })

  it('keeps wrong-password verification and dummy worker outages in their existing error classes', async () => {
    mocks.comparePassword.mockResolvedValue(false)
    const wrong = response()
    await authController.login(request(), wrong)
    expect(wrong.code).toBe(401)
    expect(mocks.comparePassword).toHaveBeenCalledWith('secret-password-1', user.passwordHash)
    mocks.recordLoginFailure.mockClear()
    mocks.findUnique.mockResolvedValue(null)
    mocks.comparePassword.mockRejectedValue(new Error('worker unavailable'))
    const unavailable = response()
    await authController.login(request(), unavailable)
    expect(unavailable.code).toBe(503)
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
  })

  it('uses a valid cost-10 dummy hash with the real password verifier and never issues a session', async () => {
    const { comparePassword } = await vi.importActual<typeof import('../../utils/password')>('../../utils/password')
    mocks.findUnique.mockResolvedValue(null)
    mocks.comparePassword.mockImplementation(comparePassword)
    const res = response()
    await authController.login(request(), res)
    expect(res.code).toBe(401)
    expect(mocks.comparePassword).toHaveBeenCalledOnce()
    expect(mocks.generateToken).not.toHaveBeenCalled()
    expect(mocks.setSessionCookie).not.toHaveBeenCalled()
  })

  it('rejects an account that expires during a queued password comparison', async () => {
    const now = Date.now()
    vi.useFakeTimers(); vi.setSystemTime(now)
    mocks.findUnique.mockResolvedValue({ ...user, expiresAt: new Date(now + 1000) })
    mocks.comparePassword.mockImplementation(async () => { vi.setSystemTime(now + 2000); return true })
    try {
      const res = response()
      await authController.login(request(), res)
      expect(res.code).toBe(401)
      expect(mocks.comparePassword).toHaveBeenCalledWith('secret-password-1', user.passwordHash)
      expect(mocks.generateToken).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
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

  it.each(['TEACHER', 'ADMIN', 'PARENT'])('does not issue a session for %s through the learner entrance', async (role) => {
    mocks.findUnique.mockResolvedValue({ ...user, role, teacherApproved: true })
    const res = response()
    await authController.login(request({ username: 'student', password: 'secret-password-1', expectedRole: 'STUDENT' }), res)
    expect(res.code).toBe(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '此账号不是学员账号，请使用对应身份的登录入口。' }))
    expect(mocks.generateToken).not.toHaveBeenCalled()
    expect(mocks.setSessionCookie).not.toHaveBeenCalled()
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
  })

  it('allows a learner through the learner entrance', async () => {
    const req = request({ username: 'student', password: 'secret-password-1', expectedRole: 'STUDENT' })
    const res = response()
    await authController.login(req, res)
    expect(res.code).toBe(200)
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(req, res, 'test-only-session')
  })

  it('keeps the general trainer login compatible', async () => {
    mocks.findUnique.mockResolvedValue({ ...user, role: 'TEACHER', teacherApproved: true })
    const req = request()
    const res = response()
    await authController.login(req, res)
    expect(res.code).toBe(200)
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(req, res, 'test-only-session')
  })

  it('does not disclose an entrance mismatch when the password is wrong', async () => {
    mocks.findUnique.mockResolvedValue({ ...user, role: 'TEACHER', teacherApproved: true })
    mocks.comparePassword.mockResolvedValue(false)
    const res = response()
    await authController.login(request({ username: 'student', password: 'wrong', expectedRole: 'STUDENT' }), res)
    expect(res.code).toBe(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '用户名或密码错误' }))
    expect(mocks.setSessionCookie).not.toHaveBeenCalled()
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
