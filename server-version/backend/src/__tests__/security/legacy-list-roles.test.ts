import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  course: { findMany: vi.fn(), count: vi.fn() },
  assignment: { findMany: vi.fn(), count: vi.fn() },
  checkin: { findMany: vi.fn(), count: vi.fn() },
  cacheGet: vi.fn(), cacheSet: vi.fn(), submission: { findMany: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: { course: mocks.course, assignment: mocks.assignment, checkin: mocks.checkin, submission: mocks.submission } }))
vi.mock('../../utils/cache', () => ({ cache: { get: mocks.cacheGet, set: mocks.cacheSet } }))
import { courseController } from '../../controllers/courseController'
import { assignmentController } from '../../controllers/assignmentController'
import { checkinController } from '../../controllers/checkinController'
const controllers = [courseController, assignmentController, checkinController]
const response = () => { const res: any = { statusCode: 200 }; res.status = vi.fn((code: number) => { res.statusCode = code; return res }); res.json = vi.fn(); return res }
describe('legacy content lists reject unrecognized principals before side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const model of [mocks.course, mocks.assignment, mocks.checkin]) { model.findMany.mockResolvedValue([]); model.count.mockResolvedValue(0) }
    mocks.cacheGet.mockReturnValue(undefined)
    mocks.submission.findMany.mockResolvedValue([])
  })
  it.each(['PARENT', 'FUTURE_ROLE', undefined])('rejects %s without querying or signing any content', async role => {
    for (const controller of controllers) {
      const res = response()
      await controller.list({ user: { userId: 'actor', role }, query: { courseId: 'other-course', tags: 'private' } } as any, res)
      expect(res.statusCode).toBe(403)
    }
    for (const controller of [assignmentController, checkinController]) {
      const res = response()
      await controller.getTags({ user: { userId: 'actor', role }, query: {} } as any, res)
      expect(res.statusCode).toBe(403)
    }
    expect(mocks.course.findMany).not.toHaveBeenCalled()
    expect(mocks.assignment.findMany).not.toHaveBeenCalled()
    expect(mocks.checkin.findMany).not.toHaveBeenCalled()
    expect(mocks.cacheGet).not.toHaveBeenCalled()
  })
  it('rejects a parent even if a stale course-list cache entry exists', async () => {
    mocks.cacheGet.mockReturnValue({ list: [{ id: 'other-course', courseCode: 'private-code' }], total: 1 })
    const res = response()
    await courseController.list({ user: { userId: 'parent', role: 'PARENT' }, query: {} } as any, res)
    expect(res.statusCode).toBe(403)
    expect(mocks.cacheGet).not.toHaveBeenCalled()
  })
  it.each(['ADMIN', 'TEACHER', 'STUDENT'])('keeps the existing %s list workflow', async role => {
    for (const controller of controllers) {
      const res = response()
      await controller.list({ user: { userId: 'actor', role }, query: {} } as any, res)
      expect(res.statusCode).toBe(200)
    }
    if (role === 'TEACHER') expect(mocks.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { creatorId: 'actor' } }))
    if (role === 'STUDENT') {
      expect(mocks.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED', course: expect.objectContaining({ students: expect.anything() }) }) }))
      expect(mocks.checkin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ course: expect.objectContaining({ students: expect.anything() }) }) }))
    }
  })
})
