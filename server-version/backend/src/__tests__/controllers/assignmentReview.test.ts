import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ assignment: { findUnique: vi.fn() }, submission: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { assignmentController } from '../../controllers/assignmentController'
import { freezeSelection, readSelection, nextReviewCursor, gradeReviewChunk } from '../../modules/assignment-review/selection'
const response = () => { const res: any = {}; res.status = vi.fn(() => res); res.json = vi.fn(); return res }
const req = (body = {}, query = {}, actor = 'teacher') => ({ user: { userId: actor, role: 'TEACHER' }, params: { id: 'a' }, body, query } as any)
beforeEach(() => {
  vi.clearAllMocks()
  db.assignment.findUnique.mockResolvedValue({ course: { creatorId: 'teacher' } })
  db.$transaction.mockImplementation(async callback => callback(db))
  db.submission.count.mockImplementation(async ({ where }) => where.status ? 2 : 4)
  db.submission.findMany.mockResolvedValue([])
  db.submission.updateMany.mockResolvedValue({ count: 1 })
})
describe('bounded assignment review', () => {
  it('defaults to 25 rows, stable immutable ID ordering and exact assignment-wide counts', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({ id: String(100 - index), submittedAt: index % 2 ? null : new Date(0) }))
    db.submission.findMany.mockResolvedValue(rows)
    const res = response(); await assignmentController.submissions(req(), res)
    const result = res.json.mock.calls[0][0].data
    expect(result).toMatchObject({ total: 4, gradedCount: 2, ungradedCount: 2 })
    expect(result.list).toHaveLength(25)
    expect(result.nextCursor).toBe(nextReviewCursor(rows[24]))
    expect(db.submission.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 26, orderBy: { id: 'desc' }, where: { assignmentId: 'a' } }))
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' })
  })
  it('uses only immutable ID seek despite tied, null or changed timestamps', async () => {
    const res = response(); await assignmentController.submissions(req({}, { cursor: nextReviewCursor({ id: 'middle' }), pageSize: '10' }), res)
    expect(db.submission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { assignmentId: 'a', id: { lt: 'middle' } }, take: 11 }))
  })
  it.each([{ pageSize: '101' }, { cursor: 'broken' }, { pageSize: '0' }])('rejects bad cursor or unbounded page %j', async query => {
    const res = response(); await assignmentController.submissions(req({}, query), res)
    expect(res.status).toHaveBeenCalledWith(400); expect(db.submission.findMany).not.toHaveBeenCalled()
  })
  it('checks ownership before list or selection metadata reads', async () => {
    for (const operation of [assignmentController.submissions, assignmentController.reviewSelection]) {
      const res = response(); await operation(req({ scope: 'all-ungraded' }, {}, 'other'), res)
      expect(res.status).toHaveBeenCalledWith(403)
    }
    expect(db.submission.findMany).not.toHaveBeenCalled()
  })
  it('captures only IDs and revisions, retains not-GRADED semantics including drafts', async () => {
    db.submission.findMany.mockResolvedValue([{ id: 'draft', revision: 3 }])
    const res = response(); await assignmentController.reviewSelection(req({ scope: 'all-ungraded' }), res)
    expect(db.submission.findMany).toHaveBeenCalledWith({ where: { assignmentId: 'a', status: { not: 'GRADED' } }, select: { id: true, revision: true }, orderBy: { id: 'asc' }, take: 5001 })
    const snapshot = res.json.mock.calls[0][0].data
    expect(readSelection(snapshot.chunks[0], 'teacher', 'a').items).toEqual([{ id: 'draft', revision: 3 }])
  })
  it('page selection freezes the observed revisions rather than fetching fresh answer versions', async () => {
    const res = response(); await assignmentController.reviewSelection(req({ scope: 'page', items: [{ id: 'one', revision: 8 }] }), res)
    expect(db.submission.findMany.mock.calls[0][0].where.OR).toEqual([{ id: 'one', revision: 8 }])
  })
  it('fails closed over 5000 instead of reporting partial all selection', async () => {
    db.submission.findMany.mockResolvedValue(Array.from({ length: 5001 }, (_, i) => ({ id: String(i), revision: 1 })))
    const res = response(); await assignmentController.reviewSelection(req({ scope: 'all-ungraded' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].message).toContain('5000')
  })
  it('signs bounded chunks and rejects wrong actors, assignments, expiry and tampering', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ id: String(i), revision: 1 }))
    const result = freezeSelection('teacher', 'a', items)
    expect(result.chunks).toHaveLength(3)
    expect(readSelection(result.chunks[0], 'teacher', 'a').items).toHaveLength(100)
    expect(readSelection(result.chunks[2], 'teacher', 'a')).toMatchObject({ index: 2, total: 201, items: [items[200]] })
    for (const [token, actor, assignment] of [[result.chunks[0], 'other', 'a'], [result.chunks[0], 'teacher', 'b'], [result.chunks[0] + 'x', 'teacher', 'a']]) expect(() => readSelection(token, actor, assignment)).toThrow()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000)
    expect(() => readSelection(result.chunks[0], 'teacher', 'a')).toThrow(); vi.restoreAllMocks()
  })
  it('locks sorted submit keys and updates only frozen revisions and fresh ownership', async () => {
    db.submission.findMany.mockResolvedValue([{ studentId: 'z' }, { studentId: 'a' }])
    await gradeReviewChunk('a', [{ id: 'old', revision: 7 }], 'feedback', 'teacher', false)
    expect(db.$executeRaw.mock.calls.map(call => call[1])).toEqual(['assignment-submission:a:a', 'assignment-submission:a:z'])
    expect(db.submission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { assignmentId: 'a', assignment: { course: { creatorId: 'teacher' } }, status: { not: 'GRADED' }, OR: [{ id: 'old', revision: 7 }] }, data: expect.objectContaining({ revision: { increment: 1 } }) }))
  })
  it('replayed proof skips changed or graded submissions, never adds later arrivals', async () => {
    const snapshot = freezeSelection('teacher', 'a', [{ id: 'old', revision: 1 }])
    db.submission.updateMany.mockResolvedValue({ count: 0 })
    const res = response(); await assignmentController.batchGrade(req({ selectionToken: snapshot.chunks[0], comment: 'good' }), res)
    expect(res.json.mock.calls[0][0].data).toMatchObject({ gradedCount: 0, skippedCount: 1 })
    expect(db.submission.updateMany.mock.calls[0][0].where.OR).toEqual([{ id: 'old', revision: 1 }])
  })
  it('failed chunks return errors and do not claim success', async () => {
    db.submission.updateMany.mockRejectedValue(new Error('synthetic failure'))
    const snapshot = freezeSelection('teacher', 'a', [{ id: 'old', revision: 1 }])
    const res = response(); await assignmentController.batchGrade(req({ selectionToken: snapshot.chunks[0], comment: 'good' }), res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json.mock.calls[0][0].code).not.toBe(0)
  })
})

it('single grading supports the observed revision and shares student locks without changing history', async () => {
  db.submission.findFirst.mockResolvedValue({ id: 's', studentId: 'student', revision: 4 })
  db.submission.findUnique.mockResolvedValue({ id: 's', revision: 5 })
  const request = req({ comment: 'feedback', expectedRevision: 3 }); request.params.submissionId = 's'
  db.submission.updateMany.mockResolvedValue({ count: 0 })
  const res = response(); await assignmentController.grade(request, res)
  expect(db.$executeRaw.mock.calls[0][1]).toBe('assignment-submission:a:student')
  expect(db.submission.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 's', revision: 3, assignmentId: 'a', assignment: { course: { creatorId: 'teacher' } } }, data: { revision: { increment: 1 } } })
  expect(res.status).toHaveBeenCalledWith(409)
})
it('legacy all-grade refuses oversized snapshots before writing anything', async () => {
  db.submission.findMany.mockResolvedValue(Array.from({ length: 5001 }, (_, i) => ({ id: String(i), revision: 1 })))
  const res = response(); await assignmentController.batchGrade(req({ comment: 'feedback' }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(db.submission.updateMany).not.toHaveBeenCalled()
})
it('legacy partial failure reports confirmed progress, not whole-batch atomic success', async () => {
  db.submission.findMany.mockResolvedValueOnce(Array.from({ length: 101 }, (_, i) => ({ id: String(i), revision: 1 })))
  db.submission.findMany.mockResolvedValue([{ studentId: 'student' }])
  db.submission.updateMany.mockResolvedValueOnce({ count: 100 }).mockRejectedValueOnce(new Error('second chunk failed'))
  const res = response(); await assignmentController.batchGrade(req({ comment: 'feedback' }), res)
  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.json.mock.calls[0][0].message).toContain('已确认批改 100 份')
})
