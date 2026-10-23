import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    course: { findUnique: vi.fn() },
    teacherCode: { findUnique: vi.fn() },
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
import { hashPassword } from '../../utils/password'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.getHeader = vi.fn()
  res.setHeader = vi.fn()
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

describe('registration lookup projections', () => {
  const courseSelect = { id: true, courseCode: true, status: true, endedAt: true, isRecruiting: true, isLibrary: true }
  const course = {
    id: 'course-1', courseCode: 'COURSE', status: 'PUBLISHED', endedAt: null,
    isRecruiting: true, isLibrary: false, description: 'Unneeded course content',
  }
  const body = { courseCode: 'COURSE', username: 'student01', password: 'Demo2026', nickname: '学生甲' }
  // Return only requested fields so omitted status or transaction fields
  // actually affect behavior, rather than hiding omissions in broad mocks.
  const projected = (row: Record<string, unknown>, select: Record<string, boolean>) =>
    Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, row[key]]))
  const prepareCourses = (locked: Record<string, unknown> = course) => {
    mockPrisma.course.findUnique.mockImplementation(async ({ where, select }) => {
      expect(select).toEqual(courseSelect)
      return projected('courseCode' in where ? course : locked, select)
    })
  }
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(hashPassword).mockResolvedValue('hash')
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
    mockPrisma.user.findUnique.mockImplementation(async ({ select }) => {
      expect(select).toEqual({ id: true })
      return null
    })
    mockPrisma.user.create.mockResolvedValue({ id: 'new-student', username: 'student01', role: 'STUDENT', tokenVersion: 0, mustChangePassword: false })
    prepareCourses()
  })

  it('registers using selected course fields and preserves both reads and the row lock', async () => {
    const res = makeRes()
    await authController.studentRegister({ body } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('注册成功，已加入课程')
    expect(mockPrisma.course.findUnique.mock.calls).toEqual([
      [{ where: { courseCode: 'COURSE' }, select: courseSelect }],
      [{ where: { id: 'course-1' }, select: courseSelect }],
    ])
    expect(mockPrisma.user.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { username: 'student01' }, select: { id: true } })
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockPrisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.course.findUnique.mock.invocationCallOrder[1])
    expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: {
      username: 'student01', passwordHash: 'hash', role: 'STUDENT', nickname: '学生甲', expiresAt: null,
    } })
    expect(mockPrisma.courseStudent.create).toHaveBeenCalledWith({ data: { courseId: 'course-1', studentId: 'new-student', status: 'ACTIVE' } })
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('ptool_session='))
  })

  it.each([
    [{ courseCode: 'ROTATED' }, '课程码无效'],
    [{ status: 'DRAFT' }, '课程未发布，无法加入'],
    [{ endedAt: new Date(0) }, '课程已结束，无法加入'],
    [{ isRecruiting: false }, '该课程已停止招募，无法加入'],
    [{ isLibrary: true }, '库课程不能加入'],
  ])('rechecks projected locked course state: %j', async (change, message) => {
    prepareCourses({ ...course, ...change })
    const res = makeRes()
    await authController.studentRegister({ body } as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe(message)
    expect(mockPrisma.course.findUnique).toHaveBeenCalledTimes(2)
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
    expect(mockPrisma.courseStudent.create).not.toHaveBeenCalled()
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it.each(['student', 'teacher'])('uses only id for %s username conflicts before hashing or writing', async kind => {
    mockPrisma.teacherCode.findUnique.mockResolvedValue({ id: 'teacher-code', isActive: true, expiresAt: null, usedCount: 0, maxUses: 1 })
    mockPrisma.user.findUnique.mockImplementation(async ({ select }) => {
      expect(select).toEqual({ id: true })
      return projected({ id: 'existing', passwordHash: 'must-not-be-loaded', nickname: 'unused' }, select)
    })
    const res = makeRes()
    if (kind === 'student') await authController.studentRegister({ body } as any, res)
    else await authController.teacherRegister({ body: { teacherCode: 'ABCD1234', username: body.username, password: body.password, nickname: body.nickname } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('用户名已被使用，请更换')
    expect(mockPrisma.user.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { username: body.username }, select: { id: true } })
    const codeLookup = kind === 'student' ? mockPrisma.course.findUnique : mockPrisma.teacherCode.findUnique
    expect(codeLookup.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.user.findUnique.mock.invocationCallOrder[0])
    expect(hashPassword).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(res.setHeader).not.toHaveBeenCalled()
  })
})
