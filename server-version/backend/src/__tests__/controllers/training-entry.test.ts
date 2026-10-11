import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ user: vi.fn(), course: vi.fn(), teacher: vi.fn(), compare: vi.fn(), token: vi.fn(), cookie: vi.fn(), failure: vi.fn(), clear: vi.fn(), rate: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { user: { findUnique: m.user }, course: { findUnique: m.course }, teacherCode: { findUnique: m.teacher } } }))
vi.mock('../../utils/password', () => ({ comparePassword: m.compare, hashPassword: vi.fn(), isValidPassword: vi.fn(), PASSWORD_MIN_LENGTH: 8, PASSWORD_MAX_LENGTH: 128 }))
vi.mock('../../utils/jwt', () => ({ generateToken: m.token }))
vi.mock('../../utils/authCookies', () => ({ setSessionCookie: m.cookie, clearSessionCookie: vi.fn() }))
vi.mock('../../middleware/loginRateLimit', () => ({ recordLoginFailure: m.failure, clearLoginFailures: m.clear, withLoginPasswordVerification: (fn: () => unknown) => fn() }))
vi.mock('../../middleware/registrationAdmission', () => ({ registrationRateLimit: m.rate }))
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }))
import { trainingLogin, resolveTrainingCode, trainingCodeRateLimit } from '../../modules/training/auth'
const account = { id: 'u', username: 'u', role: 'STUDENT', accountDomain: 'TRAINING', isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true, passwordHash: 'hash', tokenVersion: 3 }
const response = () => {
  const res: any = { locals: {}, statusCode: 200, setHeader: vi.fn() }
  res.status = vi.fn((status: number) => { res.statusCode = status; return res })
  res.json = vi.fn((body: unknown) => { res.body = body; return res })
  return res
}
beforeEach(() => {
  vi.resetAllMocks(); m.user.mockResolvedValue(account); m.compare.mockResolvedValue(true)
  m.failure.mockResolvedValue({ accountIpAllowed: true, accountGlobalAllowed: true, retryAfterSeconds: 1 })
  m.token.mockReturnValue('session'); m.course.mockResolvedValue(null); m.teacher.mockResolvedValue(null)
})
describe('training session admission', () => {
  it.each(['STUDENT', 'TEACHER'])('allows approved active %s without expectedRole', async role => {
    m.user.mockResolvedValue({ ...account, role })
    const res = response()
    await trainingLogin({ body: { username: 'u', password: 'Local12345' } } as any, res, vi.fn())
    expect(res.statusCode).toBe(200); expect(m.cookie).toHaveBeenCalledOnce()
    expect(m.token).toHaveBeenCalledWith(expect.objectContaining({ role, tokenVersion: 3 }))
  })
  it.each([
    { role: 'ADMIN' }, { role: 'PARENT' }, { accountDomain: 'SCHOOL' }, { accountDomain: 'UNKNOWN' },
    { role: 'TEACHER', teacherApproved: false }, { expiresAt: new Date(0) }, { isFrozen: true }, { isActive: false },
  ])('rejects unsuitable authority before token or cookie creation: %j', async change => {
    m.user.mockResolvedValue({ ...account, ...change })
    const res = response()
    await trainingLogin({ body: { username: 'u', password: 'Local12345' } } as any, res, vi.fn())
    expect(res.statusCode).toBe(401); expect(m.token).not.toHaveBeenCalled(); expect(m.cookie).not.toHaveBeenCalled()
  })
  it('preserves existing LEGACY training accounts', async () => {
    m.user.mockResolvedValue({ ...account, accountDomain: 'LEGACY' })
    const res = response(); await trainingLogin({ body: { username: 'u', password: 'Local12345' } } as any, res, vi.fn())
    expect(res.statusCode).toBe(200)
  })
})
describe('read-only registration code discovery', () => {
  const course = { id: 'c', title: '合成课程', status: 'PUBLISHED', endedAt: null, isRecruiting: true, isLibrary: false }
  const teacher = { isActive: true, expiresAt: null, usedCount: 0, maxUses: 1 }
  it('resolves a legacy-length course code by stored authority', async () => {
    m.course.mockResolvedValue(course); const res = response()
    await resolveTrainingCode({ body: { code: ' OLD123 ' } } as any, res, vi.fn())
    expect(res.body.data).toEqual({ kind: 'STUDENT', code: 'OLD123', course: { courseId: 'c', courseName: '合成课程' } })
    expect(m.course).toHaveBeenCalledWith(expect.objectContaining({ where: { courseCode: 'OLD123' } }))
  })
  it('preserves teacher uppercase normalization and remaining use allowance', async () => {
    m.teacher.mockResolvedValue({ ...teacher, usedCount: 1, maxUses: 2 }); const res = response()
    await resolveTrainingCode({ body: { code: 'abcd1234' } } as any, res, vi.fn())
    expect(res.body.data).toEqual({ kind: 'TEACHER', code: 'ABCD1234' })
  })
  it.each([{ endedAt: new Date() }, { isRecruiting: false }, { isLibrary: true }, { status: 'DRAFT' }])('keeps course admission closed: %j', async change => {
    m.course.mockResolvedValue({ ...course, ...change }); const res = response()
    await resolveTrainingCode({ body: { code: 'OLD123' } } as any, res, vi.fn()); expect(res.statusCode).toBe(404)
  })
  it.each([{ isActive: false }, { expiresAt: new Date(0) }, { usedCount: 1 }])('keeps invalid teacher codes closed: %j', async change => {
    m.teacher.mockResolvedValue({ ...teacher, ...change }); const res = response()
    await resolveTrainingCode({ body: { code: 'ABCD1234' } } as any, res, vi.fn()); expect(res.statusCode).toBe(404)
  })
  it('rejects a collision instead of selecting the privileged role', async () => {
    m.course.mockResolvedValue(course); m.teacher.mockResolvedValue(teacher); const res = response()
    await resolveTrainingCode({ body: { code: 'ABCD1234' } } as any, res, vi.fn()); expect(res.statusCode).toBe(404)
    expect(res.body.data).toBeNull()
  })
  it.each([{ code: '' }, { code: 'x'.repeat(129) }, { code: 'a', role: 'TEACHER' }])('rejects malformed discovery without queries: %j', async body => {
    const res = response(); await resolveTrainingCode({ body } as any, res, vi.fn())
    expect(res.statusCode).toBe(404); expect(m.course).not.toHaveBeenCalled(); expect(m.teacher).not.toHaveBeenCalled()
  })
  it('reuses both original code budgets and restores the strict request', async () => {
    const original = { code: 'CODE123' }; const req: any = { body: original }; const next = vi.fn()
    m.rate.mockImplementation((request, _res, resume) => {
      expect(request.body).toEqual({ code: 'CODE123', courseCode: 'CODE123', teacherCode: 'CODE123' }); resume()
    })
    await trainingCodeRateLimit(req, response(), next)
    expect(next).toHaveBeenCalledOnce(); expect(req.body).toBe(original)
  })
})
