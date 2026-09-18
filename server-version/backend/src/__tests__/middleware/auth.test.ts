import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, mockVerifyToken } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
  },
  mockVerifyToken: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/jwt', () => ({ verifyToken: mockVerifyToken }))

import { authenticate, optionalAuthenticate, requireSelfOrAdmin, requireStudent } from '../../middleware/auth'

const payload = { userId: 'user-1', username: 'u1', role: UserRole.STUDENT, tokenVersion: 0 }

const activePrincipal = {
  userId: 'user-1',
  username: 'u1',
  isActive: true,
  isFrozen: false,
  expiresAt: null,
  role: UserRole.STUDENT,
  platformRole: 'STANDARD',
  teacherApproved: true,
  tokenVersion: 0,
  mustChangePassword: false,
}

const dbRow = (overrides: Record<string, unknown> = {}) => [{
  id: 'user-1',
  username: 'u1',
  isActive: true,
  isFrozen: false,
  expiresAt: null,
  role: UserRole.STUDENT,
  platformRole: 'STANDARD',
  teacherApproved: true,
  tokenVersion: 0,
  mustChangePassword: false,
  ...overrides,
}]

const makeReq = (sessionToken?: string) =>
  ({
    headers: sessionToken ? { cookie: `ptool_session=${encodeURIComponent(sessionToken)}` } : {},
    params: { id: 'user-1' },
    originalUrl: '/api/users/me',
    user: undefined,
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

describe('authenticate account status and current authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyToken.mockReturnValue(payload)
    mockPrisma.$queryRaw.mockResolvedValue(dbRow())
  })

  it('rejects a frozen account even when the JWT is still valid', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({ isFrozen: true }))
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('valid-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('账号已被冻结，请联系教师')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a pending teacher while the JWT is still valid', async () => {
    mockVerifyToken.mockReturnValue({ ...payload, role: UserRole.TEACHER })
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({
      role: UserRole.TEACHER,
      teacherApproved: false,
    }))
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('valid-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toContain('等待管理员审核')
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches the current database principal for an active account', async () => {
    const req = makeReq('valid-token')
    const res = makeRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(req.user).toEqual({
      userId: activePrincipal.userId,
      username: activePrincipal.username,
      role: activePrincipal.role,
      platformRole: activePrincipal.platformRole,
      tokenVersion: activePrincipal.tokenVersion,
      mustChangePassword: false,
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('uses a current platform demotion on the next protected request even with an unexpired JWT', async () => {
    mockVerifyToken.mockReturnValue({ ...payload, role: UserRole.ADMIN })
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({
      role: UserRole.ADMIN,
      platformRole: 'STANDARD',
    }))
    const req = makeReq('still-valid-system-admin-token')
    const next = vi.fn()

    await authenticate(req, makeRes(), next)

    expect(req.user?.platformRole).toBe('STANDARD')
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects a token issued before a forced logout or password change', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({ tokenVersion: 1 }))
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('stale-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('认证令牌已失效，请重新登录')
    expect(next).not.toHaveBeenCalled()
  })
})

describe('optionalAuthenticate account status and current authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyToken.mockReturnValue(payload)
    mockPrisma.$queryRaw.mockResolvedValue(dbRow())
  })

  it('ignores a frozen token instead of returning 401', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({ isFrozen: true }))
    const req = makeReq('valid-token')
    const res = makeRes()
    const next = vi.fn()

    await optionalAuthenticate(req, res, next)

    expect(req.user).toBeUndefined()
    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })

  it('hydrates a current platform demotion instead of trusting the optional JWT', async () => {
    mockVerifyToken.mockReturnValue({ ...payload, role: UserRole.ADMIN })
    mockPrisma.$queryRaw.mockResolvedValue(dbRow({ role: UserRole.ADMIN, platformRole: 'STANDARD' }))
    const req = makeReq('valid-token')
    const next = vi.fn()

    await optionalAuthenticate(req, makeRes(), next)

    expect(req.user?.platformRole).toBe('STANDARD')
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireSelfOrAdmin', () => {
  const currentPayload = { ...payload, platformRole: 'STANDARD' as const, mustChangePassword: false }

  it('rejects access to another user record', () => {
    const req = { user: currentPayload, params: { id: 'user-2' } } as any
    const res = makeRes()
    const next = vi.fn()

    requireSelfOrAdmin(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a legacy administrator to inspect another user record', () => {
    const req = { user: { ...currentPayload, role: UserRole.ADMIN }, params: { id: 'user-2' } } as any
    const res = makeRes()
    const next = vi.fn()

    requireSelfOrAdmin(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireStudent', () => {
  const currentPayload = { ...payload, platformRole: 'STANDARD' as const, mustChangePassword: false }

  it('rejects a teacher from student-only scale assessment routes', () => {
    const req = { user: { ...currentPayload, role: UserRole.TEACHER } } as any
    const res = makeRes()
    const next = vi.fn()

    requireStudent(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a student through', () => {
    const req = { user: currentPayload } as any
    const res = makeRes()
    const next = vi.fn()

    requireStudent(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
