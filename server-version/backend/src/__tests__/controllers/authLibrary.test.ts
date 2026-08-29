import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    course: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
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
