import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCourse: vi.fn(), updateCourse: vi.fn(), findStudents: vi.fn(),
  protectedIds: vi.fn(), clearPattern: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: {
  course: { findUnique: mocks.findCourse, update: mocks.updateCourse },
  courseStudent: { findMany: mocks.findStudents },
} }))
vi.mock('../../utils/cache', () => ({ cache: { clearPattern: mocks.clearPattern } }))
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('../../services/assetStorage', () => ({
  getSignedAssetUrls: vi.fn(), attachAssetReference: vi.fn(), discardUnreferencedAsset: vi.fn(),
  getSignedAssetUrl: vi.fn(), signKnownAsset: vi.fn(), storeAsset: vi.fn(),
}))
vi.mock('../../controllers/platformAccountController', () => ({ resetPasswordForPlatformAdmin: vi.fn() }))
vi.mock('../../controllers/courseStudentPasswordController', () => ({ resetPasswordForCourseTeacher: vi.fn() }))
vi.mock('../../services/courseStudentPasswordResetService', () => ({ courseCredentialProtectedIds: mocks.protectedIds }))
import { courseController } from '../../controllers/courseController'

const response = () => {
  const res: any = { json: vi.fn() }
  res.status = vi.fn(() => res)
  return res
}
const request = (role = 'ADMIN', userId = 'manager') => ({ params: { id: 'course' }, user: { role, userId } } as any)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.updateCourse.mockResolvedValue({})
  mocks.protectedIds.mockResolvedValue(new Set(['protected']))
})

it.each([['ADMIN', 'manager', 10000], ['TEACHER', 'owner', 0]])(
  'ends a course for %s using a filtered scalar count, without loading student IDs', async (role, userId, count) => {
    // Deliberately return only the selected fields, with no student array.
    mocks.findCourse.mockResolvedValue({ creatorId: 'owner', _count: { students: count } })
    const res = response()
    await courseController.endCourse(request(String(role), String(userId)), res)
    expect(mocks.findCourse).toHaveBeenCalledExactlyOnceWith({ where: { id: 'course' }, select: {
      creatorId: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } },
    } })
    expect(mocks.findStudents).not.toHaveBeenCalled()
    expect(mocks.updateCourse).toHaveBeenCalledExactlyOnceWith({ where: { id: 'course' }, data: {
      status: 'COMPLETED', endedAt: expect.any(Date), isRecruiting: false,
    } })
    const endedAt = mocks.updateCourse.mock.calls[0][0].data.endedAt
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { studentCount: count, endedAt } }))
    expect(mocks.clearPattern).toHaveBeenCalledExactlyOnceWith('courses:list:')
    expect(mocks.findCourse.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateCourse.mock.invocationCallOrder[0])
    expect(mocks.updateCourse.mock.invocationCallOrder[0]).toBeLessThan(mocks.clearPattern.mock.invocationCallOrder[0])
  },
)

it.each(['endCourse', 'getStudents'] as const)('%s preserves missing-course and non-owner rejection', async method => {
  for (const course of [null, { creatorId: 'other', _count: { students: 4 }, shares: [{ sharedTo: 'reader' }] }]) {
    mocks.findCourse.mockResolvedValue(course)
    const res = response()
    await courseController[method](request('TEACHER', 'reader'), res)
    expect(res.status).toHaveBeenCalledWith(course ? 403 : 404)
  }
  expect(mocks.findStudents).not.toHaveBeenCalled()
  expect(mocks.protectedIds).not.toHaveBeenCalled()
  expect(mocks.updateCourse).not.toHaveBeenCalled()
  expect(mocks.clearPattern).not.toHaveBeenCalled()
})

it.each([['ADMIN', 'manager'], ['TEACHER', 'owner']])(
  'preserves complete roster response and credential-protection batch for %s with minimal projections', async (role, userId) => {
    mocks.findCourse.mockResolvedValue({ creatorId: 'owner' })
    const joinedAt = new Date('2026-10-23T00:00:00Z')
    const students = ['ACTIVE', 'APPROVED', 'PENDING'].map((status, index) => ({
      status, joinedAt, student: { id: index ? `student-${index}` : 'protected', username: `name-${index}`,
        nickname: index ? null : 'nickname', avatarUrl: index ? null : 'avatar', isFrozen: index === 0 },
    }))
    mocks.findStudents.mockResolvedValue(students)
    const res = response()
    await courseController.getStudents(request(role, userId), res)
    expect(mocks.findCourse).toHaveBeenCalledExactlyOnceWith({ where: { id: 'course' }, select: { creatorId: true } })
    expect(mocks.findStudents).toHaveBeenCalledExactlyOnceWith({
      where: { courseId: 'course', status: { in: ['ACTIVE', 'APPROVED', 'PENDING'] } },
      select: { status: true, joinedAt: true, student: { select: {
        id: true, username: true, nickname: true, avatarUrl: true, isFrozen: true,
      } } }, orderBy: { joinedAt: 'desc' },
    })
    expect(mocks.protectedIds).toHaveBeenCalledExactlyOnceWith(['protected', 'student-1', 'student-2'])
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: {
      total: 3, list: students.map(({ student, status }) => ({ ...student,
        enrollmentStatus: status, joinedAt, credentialManagementProtected: student.id === 'protected',
      })),
    } }))
  },
)

it('retains an empty complete roster and its protection check', async () => {
  mocks.findCourse.mockResolvedValue({ creatorId: 'owner' })
  mocks.findStudents.mockResolvedValue([])
  const res = response()
  await courseController.getStudents(request(), res)
  expect(mocks.protectedIds).toHaveBeenCalledExactlyOnceWith([])
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { list: [], total: 0 } }))
})
