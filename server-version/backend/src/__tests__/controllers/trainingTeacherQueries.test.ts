import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  course: { findMany: vi.fn() },
  assignment: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  checkin: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  submission: { findMany: vi.fn() },
  checkinSubmission: { findMany: vi.fn(), count: vi.fn() },
}))
const mocks = vi.hoisted(() => ({ hydrate: vi.fn(), workbook: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/assetStorage', () => ({ hydrateAssetReferenceBatch: mocks.hydrate }))
vi.mock('../../utils/excelWorkbook', () => ({ workbookBuffer: mocks.workbook }))
import { assignmentController } from '../../controllers/assignmentController'
import { checkinController } from '../../controllers/checkinController'
const response = () => {
  const res: any = {}
  res.status = vi.fn(() => res); res.json = vi.fn(); res.setHeader = vi.fn(); res.send = vi.fn()
  return res
}
const request = (query = {}, role = 'TEACHER') => ({ user: { userId: 'teacher', role }, params: { id: 'task' }, query }) as any
beforeEach(() => {
  vi.resetAllMocks()
  for (const model of [db.assignment, db.checkin]) { model.findMany.mockResolvedValue([]); model.count.mockResolvedValue(0) }
  db.submission.findMany.mockResolvedValue([])
  db.checkinSubmission.findMany.mockResolvedValue([]); db.checkinSubmission.count.mockResolvedValue(0)
  mocks.hydrate.mockImplementation(async entries => entries.map((entry: any) => entry.value))
  mocks.workbook.mockResolvedValue(Buffer.from('xlsx'))
})
describe.each([
  ['assignment', assignmentController, db.assignment, db.submission],
  ['checkin', checkinController, db.checkin, db.checkinSubmission],
] as const)('%s teacher query boundaries', (kind, controller, model, submissions) => {
  it.each([{}, { courseId: 'foreign-course' }])('filters ownership in both list queries without listing course IDs: %j', async query => {
    const res = response()
    await controller.list(request({ ...query, page: '2', pageSize: '10', tags: '重点' }), res)
    expect(db.course.findMany).not.toHaveBeenCalled()
    const where = { ...query, tags: { hasEvery: ['重点'] }, course: { creatorId: 'teacher', courseType: { not: 'CAMPUS_ACTIVITY' } } }
    expect(model.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where, skip: 10, take: 10 }))
    expect(model.count).toHaveBeenCalledExactlyOnceWith({ where })
    expect(res.json.mock.calls[0][0].data.total).toBe(0)
  })
  it('preserves active enrollment for students and does not add teacher ownership', async () => {
    await controller.list(request({}, 'STUDENT'), response())
    expect(model.findMany.mock.calls[0][0].where.course).toEqual({ courseType: { not: 'CAMPUS_ACTIVITY' }, students: { some: { studentId: 'teacher', status: { in: ['ACTIVE', 'APPROVED'] } } } })
  })
  it('keeps the administrator list unrestricted by creator but excludes campus activities', async () => {
    await controller.list(request({}, 'ADMIN'), response())
    expect(model.findMany.mock.calls[0][0].where.course).toEqual({ courseType: { not: 'CAMPUS_ACTIVITY' } })
  })
  it('reads only review authorization context and rejects other teachers before submissions', async () => {
    model.findUnique.mockResolvedValue({ course: { creatorId: 'other' } })
    const res = response(); await controller.submissions(request(), res)
    expect(model.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'task' }, select: { ...(kind === 'checkin' ? { courseId: true } : {}), course: { select: { creatorId: true } } } })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(submissions.findMany).not.toHaveBeenCalled(); expect(mocks.hydrate).not.toHaveBeenCalled()
  })
  it('returns a normal error without download headers when workbook generation fails', async () => {
    model.findUnique.mockResolvedValue({ title: 'Task', questions: [], course: { creatorId: 'teacher', title: 'Course' } })
    mocks.workbook.mockRejectedValue(new Error('synthetic serialization failure'))
    const res = response(); await controller.export(request(), res)
    expect(res.status).toHaveBeenCalledWith(400) // Preserve the existing error status contract.
    expect(res.setHeader).not.toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled()
  })
})
it('preserves checkin page counts, lookahead, cursor and hydration context', async () => {
  db.checkin.findUnique.mockResolvedValue({ courseId: 'course', course: { creatorId: 'teacher' } })
  const rows = ['b', 'a'].map(id => ({ id, createdAt: new Date('2026-10-23T00:00:00Z'), images: [] }))
  db.checkinSubmission.findMany.mockResolvedValue(rows); db.checkinSubmission.count.mockResolvedValue(8)
  const res = response(); await checkinController.submissions(request({ pageSize: '1' }), res)
  expect(db.checkinSubmission.findMany.mock.calls[0][0]).toMatchObject({ where: { checkinId: 'task' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 2, skip: 0 })
  expect(mocks.hydrate).toHaveBeenCalledWith([{ value: rows[0], context: { entityType: 'CheckinSubmission', entityId: 'b', courseId: 'course', checkinId: 'task', parentAccess: true } }])
  const page = res.json.mock.calls[0][0].data
  expect(page).toMatchObject({ total: 8, hasMore: true, pageSize: 1 })
  db.checkinSubmission.count.mockClear()
  await checkinController.submissions(request({ pageSize: '1', cursor: page.nextCursor }), response())
  expect(db.checkinSubmission.count).not.toHaveBeenCalled()
  expect(db.checkinSubmission.findMany.mock.calls[1][0].where.OR[1]).toEqual({ createdAt: rows[0].createdAt, id: { lt: 'b' } })
})
