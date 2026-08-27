import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
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
  beforeEach(() => vi.clearAllMocks())

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
})
