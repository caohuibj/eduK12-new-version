import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    course: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    courseStudent: { findMany: vi.fn(), findFirst: vi.fn() },
    courseShare: { findMany: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/cache', () => ({ cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clearPattern: vi.fn() } }))

import { courseController } from '../../controllers/courseController'

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  user: { userId: 'admin-1', role: UserRole.ADMIN },
  body: {},
  params: { id: 'course-1' },
  query: {},
  ...overrides,
})

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('course isLibrary', () => {
  it('forbids a teacher from marking a course as library', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      creatorId: 'teacher-1',
      creator: { role: UserRole.TEACHER },
    })
    const res = makeRes()
    await courseController.update(makeReq({
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
      body: { isLibrary: true },
    }) as any, res)
    expect(res.statusCode).toBe(403)
    expect(mockPrisma.course.update).not.toHaveBeenCalled()
  })

  it('lets ADMIN mark a second library course and forces recruiting off', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'course-2',
      creatorId: 'admin-1',
      creator: { role: UserRole.ADMIN },
    })
    mockPrisma.course.update.mockResolvedValue({ id: 'course-2', isLibrary: true, isRecruiting: false })
    const res = makeRes()
    await courseController.update(makeReq({
      params: { id: 'course-2' },
      body: { isLibrary: true },
    }) as any, res)
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.course.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isLibrary: true, isRecruiting: false }),
    }))
  })

  it('rejects joining a library course by course code', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'library-1',
      courseCode: 'LIB',
      status: 'PUBLISHED',
      isRecruiting: false,
      isLibrary: true,
    })
    const res = makeRes()
    await courseController.join(makeReq({
      user: { userId: 'student-1', role: UserRole.STUDENT },
      body: { courseCode: 'LIB' },
    }) as any, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('库课程不能加入')
  })

  it('hides library course detail from students', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'library-1',
      isLibrary: true,
      isRecruiting: false,
      _count: { students: 0 },
    })
    const res = makeRes()
    await courseController.detail(makeReq({
      user: { userId: 'student-1', role: UserRole.STUDENT },
      params: { id: 'library-1' },
    }) as any, res)
    expect(res.statusCode).toBe(404)
  })

  it('hides a course detail from a non-member student', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      isLibrary: false,
      courseCode: 'SECRET-CODE',
      isRecruiting: true,
      students: [],
      _count: { students: 0 },
    })
    mockPrisma.courseStudent.findFirst.mockResolvedValue(null)
    const res = makeRes()

    await courseController.detail(makeReq({
      user: { userId: 'student-1', role: UserRole.STUDENT },
      params: { id: 'course-1' },
    }) as any, res)

    expect(res.statusCode).toBe(403)
  })

  it('does not return the course code or roster to a member student', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      title: 'Private course',
      isLibrary: false,
      courseCode: 'SECRET-CODE',
      isRecruiting: true,
      students: [{ student: { id: 'student-2', nickname: 'Other', username: 'other', avatarUrl: null } }],
      _count: { students: 1 },
    })
    mockPrisma.courseStudent.findFirst.mockResolvedValue({ id: 'membership-1' })
    const res = makeRes()

    await courseController.detail(makeReq({
      user: { userId: 'student-1', role: UserRole.STUDENT },
      params: { id: 'course-1' },
    }) as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data).not.toHaveProperty('courseCode')
    expect(res.body.data).not.toHaveProperty('students')
  })

  it('does not return the course code or roster to a shared teacher', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      creatorId: 'owner-1',
      shares: [{ sharedTo: 'teacher-1' }],
      title: 'Shared course',
      isLibrary: false,
      courseCode: 'SECRET-CODE',
      isRecruiting: true,
      students: [{ student: { id: 'student-2', nickname: 'Other', username: 'other', avatarUrl: null } }],
      _count: { students: 1 },
    })
    const res = makeRes()

    await courseController.detail(makeReq({
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
      params: { id: 'course-1' },
    }) as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data).not.toHaveProperty('courseCode')
    expect(res.body.data).not.toHaveProperty('students')
  })

  it('does not return the original course code in a shared-course listing', async () => {
    mockPrisma.courseShare.findMany.mockResolvedValue([{
      id: 'share-1',
      createdAt: new Date('2026-08-25T00:00:00Z'),
      course: {
        id: 'course-1',
        title: 'Shared course',
        courseCode: 'SECRET-CODE',
        creatorId: 'owner-1',
        status: 'PUBLISHED',
        isRecruiting: true,
        _count: { students: 3, assignments: 1, checkins: 1 },
        creator: { id: 'owner-1', nickname: 'Owner', username: 'owner' },
      },
      sharer: { id: 'owner-1', nickname: 'Owner', username: 'owner' },
    }])
    const res = makeRes()

    await courseController.getSharedToMe(makeReq({
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
    }) as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.list[0].course).not.toHaveProperty('courseCode')
    expect(res.body.data.list[0].course.studentCount).toBe(3)
  })

  it('omits library courses from the student myCourses list', async () => {
    mockPrisma.courseStudent.findMany.mockResolvedValue([])
    const res = makeRes()
    await courseController.myCourses(makeReq({
      user: { userId: 'student-1', role: UserRole.STUDENT },
    }) as any, res)
    expect(mockPrisma.courseStudent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ course: { isLibrary: false } }),
    }))
  })
})
