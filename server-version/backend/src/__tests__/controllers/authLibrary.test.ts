import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    course: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    courseStudent: { create: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/jwt', () => ({ generateToken: vi.fn(() => 'token') }))
vi.mock('../../utils/password', () => ({
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  isValidPassword: vi.fn(() => true),
  hashPassword: vi.fn(async () => 'hash'),
  comparePassword: vi.fn(),
}))

import { authController } from '../../controllers/authController'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
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

describe('studentRegister library course', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
  })

  it('rejects registering into a library course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'library-1',
      courseCode: 'LIB',
      status: 'PUBLISHED',
      endedAt: null,
      isLibrary: true,
    })
    const res = makeRes()
    await authController.studentRegister({
      body: { courseCode: 'LIB', username: 'stu01', password: 'Demo2026', nickname: '学生甲' },
    } as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('库课程不能加入')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  it('rejects a stale course code after rotation while registration is locking the row', async () => {
    const oldCourse = {
      id: 'course-1',
      courseCode: 'OLD-CODE',
      status: 'PUBLISHED',
      endedAt: null,
      isRecruiting: true,
      isLibrary: false,
    }
    const rotatedCourse = { ...oldCourse, courseCode: 'NEW-CODE' }
    mockPrisma.course.findUnique
      .mockResolvedValueOnce(oldCourse)
      .mockResolvedValueOnce(rotatedCourse)

    const res = makeRes()
    await authController.studentRegister({
      body: { courseCode: 'OLD-CODE', username: 'stu01', password: 'Demo2026', nickname: '学生甲' },
    } as any, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('课程码无效')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })
})

describe('current user mobile bootstrap contract', () => {
  it.each(['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'])('adds versioned discovery for %s without credentials or child/report grants', async role => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u', username: 'u', role, nickname: 'user', isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true, mustChangePassword: false })
    const res = makeRes()
    await authController.me({ user: { userId: 'u', role, businessRole: role, platformRole: 'STANDARD',
      entryGrants: role === 'ADMIN' ? [{ entry: 'TRAINING', version: 1 }] : [] } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.mobile.activeRole).toBe(role)
    expect(res.body.data.mobile.capabilities.canReadChildReports).toBe(false)
    expect(res.body.data).not.toHaveProperty('token')
    expect(res.body.data).not.toHaveProperty('passwordHash')
  })
})


describe('legacy account extension target boundary', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('only queries teachers inside the legacy products and rejects absent foreign targets without mutation', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null)
    const res = makeRes()
    await authController.extendAccount({ body: { userId: 'school-teacher', months: 12 } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'school-teacher', accountDomain: { in: ['LEGACY', 'TRAINING'] } } })
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled()
  })
  it('extends an ordinary legacy teacher and prevents lost updates or target-domain changes with CAS', async () => {
    const expiresAt = new Date('2026-12-01T00:00:00Z')
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'teacher', role: 'TEACHER', accountDomain: 'TRAINING', expiresAt })
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 })
    const res = makeRes()
    await authController.extendAccount({ body: { userId: 'teacher', months: 12 } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.expiresAt.toISOString()).toBe('2027-12-01T00:00:00.000Z')
    expect(mockPrisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: 'teacher', accountDomain: { in: ['LEGACY', 'TRAINING'] }, role: 'TEACHER', expiresAt })
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 })
    const raced = makeRes()
    await authController.extendAccount({ body: { userId: 'teacher', months: 12 } } as any, raced)
    expect(raced.statusCode).toBe(409)
    expect(raced.body).not.toHaveProperty('data.expiresAt')
  })
})
