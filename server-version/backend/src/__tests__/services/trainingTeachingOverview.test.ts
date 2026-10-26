import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { course: { groupBy: vi.fn() }, submission: { groupBy: vi.fn() }, assignment: { findMany: vi.fn() } } }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { listTrainingTeachingOverview } from '../../services/trainingTeachingOverview'
const courseWhere = { creatorId: 'teacher', isLibrary: false, courseType: { not: 'CAMPUS_ACTIVITY' } }
beforeEach(() => {
  vi.clearAllMocks()
  db.course.groupBy.mockResolvedValue([{ status: 'PUBLISHED', _count: { _all: 4 } }, { status: 'DRAFT', _count: { _all: 2 } }])
  db.submission.groupBy.mockResolvedValue([])
  db.assignment.findMany.mockResolvedValue([])
})
describe('Training trainer overview ownership and pending semantics', () => {
  it.each([undefined, true])('keeps the full course-count contract when includeCourseCounts is %s', async includeCourseCounts => {
    const result = await listTrainingTeachingOverview('teacher', { page: 1, pageSize: 5, includeCourseCounts })
    expect(result.summary).toEqual({ pendingSubmissions: 0, pendingAssignments: 0, courses: 6, publishedCourses: 4 })
    expect(db.course.groupBy).toHaveBeenCalledExactlyOnceWith({ by: ['status'], where: courseWhere, _count: { _all: true } })
    expect(db.submission.groupBy).toHaveBeenCalledTimes(1)
    expect(db.assignment.findMany).not.toHaveBeenCalled()
  })
  it('binds course totals and submitted-only counts to the current owner, excluding libraries and campus activities', async () => {
    await listTrainingTeachingOverview('teacher', { page: 1, pageSize: 5 })
    expect(db.course.groupBy.mock.calls[0][0].where).toEqual(courseWhere)
    const args = db.submission.groupBy.mock.calls[0][0]
    expect(args.where).toEqual({ status: 'SUBMITTED', assignment: { course: courseWhere } })
    expect(args.by).toEqual(['assignmentId'])
    expect(JSON.stringify(args)).not.toMatch(/answers|content|studentId|comment|GRADED|DRAFT/)
    expect(args.orderBy).toEqual([{ _min: { submittedAt: 'asc' } }, { assignmentId: 'asc' }])
  })
  it('distinguishes submission counts from exercise counts, with course totals independent of queue paging', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ assignmentId: 'a' + i, _count: { _all: i + 1 }, _min: { submittedAt: new Date('2026-10-24T00:00:00Z') } }))
    db.submission.groupBy.mockResolvedValue(rows)
    db.assignment.findMany.mockResolvedValue(rows.slice(5).map(row => ({ id: row.assignmentId, title: '练习' + row.assignmentId, courseId: 'course', course: { id: 'course', title: '我的课程' } })))
    const result = await listTrainingTeachingOverview('teacher', { page: 2, pageSize: 5 })
    expect(result.summary).toEqual({ pendingSubmissions: 28, pendingAssignments: 7, courses: 6, publishedCourses: 4 })
    expect(result.total).toBe(7)
    expect(result.list.map(row => row.id)).toEqual(['a5', 'a6'])
    expect(result.list[0]).toMatchObject({ pendingCount: 6, href: '/courses/course/detail?section=assignments&assignmentId=a5' })
    expect(db.assignment.findMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['a5', 'a6'] }, course: courseWhere },
      select: { id: true, title: true, courseId: true, course: { select: { id: true, title: true } } },
    })
  })
  it.each([undefined, false])('does not expose an exercise removed from ownership when includeCourseCounts is %s', async includeCourseCounts => {
    db.submission.groupBy.mockResolvedValue([{ assignmentId: 'transferred', _count: { _all: 2 }, _min: { submittedAt: null } }])
    const result = await listTrainingTeachingOverview('teacher', { page: 1, pageSize: 5, includeCourseCounts })
    expect(result.list).toEqual([])
    expect(db.assignment.findMany.mock.calls[0][0].where.course).toEqual(courseWhere)
  })
  it('omits unrequested course counts and one query while preserving pending aggregates, paging and owner-bound titles', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ assignmentId: 'a' + i, _count: { _all: i + 1 }, _min: { submittedAt: new Date('2026-10-24T00:00:00Z') } }))
    db.submission.groupBy.mockResolvedValue(rows)
    db.assignment.findMany.mockResolvedValue(rows.slice(5).map(row => ({ id: row.assignmentId, title: '练习' + row.assignmentId, courseId: 'course', course: { id: 'course', title: '我的课程' } })))
    const full = await listTrainingTeachingOverview('teacher', { page: 2, pageSize: 5 })
    const pendingQuery = db.submission.groupBy.mock.calls[0][0]
    const titleQuery = db.assignment.findMany.mock.calls[0][0]
    expect(db.course.groupBy).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()

    const result = await listTrainingTeachingOverview('teacher', { page: 2, pageSize: 5, includeCourseCounts: false })
    expect(db.course.groupBy).not.toHaveBeenCalled()
    expect(db.submission.groupBy).toHaveBeenCalledExactlyOnceWith(pendingQuery)
    expect(db.assignment.findMany).toHaveBeenCalledExactlyOnceWith(titleQuery)
    expect(result).toEqual({ ...full, summary: { pendingSubmissions: 28, pendingAssignments: 7 } })
    expect(result.summary).not.toHaveProperty('courses')
    expect(result.summary).not.toHaveProperty('publishedCourses')
  })
  it('shows genuine zeroes without issuing a title query for an empty queue', async () => {
    db.course.groupBy.mockResolvedValue([])
    const result = await listTrainingTeachingOverview('teacher', { page: 1, pageSize: 5 })
    expect(result.summary).toEqual({ pendingSubmissions: 0, pendingAssignments: 0, courses: 0, publishedCourses: 0 })
    expect(result.list).toEqual([]); expect(db.assignment.findMany).not.toHaveBeenCalled()
  })
  it.each([undefined, false])('fails visibly instead of inventing an empty queue when includeCourseCounts is %s', async includeCourseCounts => {
    db.submission.groupBy.mockRejectedValue(new Error('offline'))
    await expect(listTrainingTeachingOverview('teacher', { page: 1, pageSize: 5, includeCourseCounts })).rejects.toThrow('offline')
  })
})
