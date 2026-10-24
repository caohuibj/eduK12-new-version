import { beforeEach, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { PassThrough } from 'node:stream'
const auth = vi.hoisted(() => vi.fn())
vi.mock('../../middleware/auth', () => ({ authenticate: auth, requireTeacher: (req: any, res: any, next: () => void) => ['TEACHER', 'ADMIN'].includes(req.user.role) ? next() : res.status(403).json({ message: 'forbidden' }) }))
const db = vi.hoisted(() => ({ $transaction: vi.fn(), assignment: { findUnique: vi.fn(), findMany: vi.fn() }, submission: { findMany: vi.fn() }, course: { findMany: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { assignmentController } from '../../controllers/assignmentController'
const response = () => { const res: any = new PassThrough(); res.chunks = []; res.on('data', (chunk: Buffer) => res.chunks.push(chunk)); res.setHeader = vi.fn(); res.removeHeader = vi.fn(); res.send = vi.fn(); res.status = vi.fn(() => res); res.json = vi.fn(); return res }
beforeEach(() => { vi.clearAllMocks(); auth.mockImplementation((_req, _res, next) => next()); db.$transaction.mockImplementation(fn => fn(db)) })

it('preserves assignment workbook answers, feedback and formula escaping with the narrow export projection', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '合成练习', course: { creatorId: 'teacher' }, questions: [{ id: 'q', question: '合成问题', type: 'text' }] })
  db.submission.findMany.mockResolvedValue([{ id: 's', student: { nickname: '=合成姓名', username: 'synthetic', phone: null }, content: '合成正文', answers: { q: '合成答案' }, submittedAt: new Date('2026-10-23T00:00:00Z'), reviewedAt: null, status: 'SUBMITTED', comment: '合成反馈' }])
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.concat(res.chunks))
  const values = JSON.stringify(book.worksheets[0].getSheetValues())
  expect(values).toContain("'=合成姓名")
  for (const value of ['合成问题', '合成答案', '合成正文', '合成反馈']) expect(values).toContain(value)
  expect(db.submission.findMany.mock.calls[0][0].select).not.toHaveProperty('images')
  expect(db.submission.findMany.mock.calls[0][0].select).not.toHaveProperty('revision')
})

it('does not load assignment submissions for a different teacher', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '练习', course: { creatorId: 'other' }, questions: [] })
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(db.submission.findMany).not.toHaveBeenCalled()
  expect(res.send).not.toHaveBeenCalled()
})

it('queries teacher tags through the ownership relation without first listing course IDs', async () => {
  db.assignment.findMany.mockResolvedValue([{ tags: ['合成', '练习'] }, { tags: ['合成'] }])
  const res = response()
  await assignmentController.getTags({ user: { userId: 'teacher', role: 'TEACHER' } } as any, res)
  expect(db.course.findMany).not.toHaveBeenCalled()
  expect(db.assignment.findMany).toHaveBeenCalledWith({ where: { course: { creatorId: 'teacher', courseType: { not: 'CAMPUS_ACTIVITY' } } }, select: { tags: true } })
  expect(res.json.mock.calls[0][0].data.tags).toEqual(['合成', '练习'])
})

it('rejects roles outside the legacy content contract without querying tags', async () => {
  const res = response()
  await assignmentController.getTags({ user: { userId: 'parent', role: 'PARENT' } } as any, res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(db.assignment.findMany).not.toHaveBeenCalled()
})

it('exports every keyset batch in snapshot order with deterministic ties and no duplicate numbering', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '分页练习', course: { creatorId: 'teacher' }, questions: [] })
  const time = new Date('2026-10-24T00:00:00Z')
  const rows = Array.from({ length: 501 }, (_, index) => ({ id: String(999 - index), submittedAt: time, reviewedAt: null, status: 'SUBMITTED', student: { username: `S${index}`, nickname: '', phone: '' }, content: `row-${index}` }))
  db.submission.findMany.mockReset()
  db.submission.findMany.mockResolvedValueOnce(rows.slice(0, 250)).mockResolvedValueOnce(rows.slice(250, 500)).mockResolvedValueOnce(rows.slice(500))
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead', timeout: 5000, maxWait: 2000 })
  expect(db.submission.findMany.mock.calls[1][0]).toMatchObject({ take: 250, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], where: { assignmentId: 'a', OR: [{ submittedAt: { lt: time } }, { submittedAt: time, id: { lt: rows[249].id } }] } })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.concat(res.chunks))
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(502)
  for (let index = 0; index < 501; index++) {
    expect(sheet.getCell(index + 2, 1).value).toBe(index + 1)
    expect(sheet.getCell(index + 2, 2).value).toBe(`S${index}`)
  }
})

it('returns JSON without Excel headers on snapshot timeout', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '练习', course: { creatorId: 'teacher' }, questions: [] })
  db.$transaction.mockRejectedValueOnce(new Error('synthetic transaction timeout'))
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  expect(res.setHeader).not.toHaveBeenCalled()
  expect(res.json).toHaveBeenCalled()
  expect(res.chunks).toHaveLength(0)
})


it.each(['deleted-task', 'changed-owner', 'revoked-admin', 'revoked-owner-teacher', 'expired-session'])('does not deliver a completed workbook after %s', async kind => {
  const metadata = { title: '练习', course: { creatorId: 'teacher' }, questions: [] }
  db.assignment.findUnique.mockReset()
  db.assignment.findUnique.mockResolvedValue(metadata)
  db.submission.findMany.mockReset()
  db.submission.findMany.mockResolvedValue([{ id: 's', submittedAt: new Date(), student: { username: 'synthetic' } }])
  if (kind === 'deleted-task' || kind === 'changed-owner') {
    db.assignment.findUnique.mockResolvedValueOnce(metadata).mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(kind === 'deleted-task' ? null : { ...metadata, course: { creatorId: 'other' } })
  }
  auth.mockImplementationOnce((req, res, next) => {
    if (kind === 'expired-session') { res.status(401).json({ message: 'expired' }); return }
    if (kind === 'revoked-admin' || kind === 'revoked-owner-teacher') req.user.role = 'STUDENT'
    next()
  })
  const res = response()
  await assignmentController.export({ user: { userId: kind === 'revoked-admin' ? 'admin' : 'teacher', role: kind === 'revoked-admin' ? 'ADMIN' : 'TEACHER' }, params: { id: 'a' } } as any, res)
  expect(auth).toHaveBeenCalledTimes(1)
  expect(res.status).toHaveBeenCalledWith(kind === 'expired-session' ? 401 : 403)
  expect(res.setHeader).not.toHaveBeenCalled()
  expect(res.chunks).toHaveLength(0)
  expect(res.json).toHaveBeenCalledTimes(1)
})

it('uses question labels captured inside the same snapshot as answer rows', async () => {
  const metadata = { title: '练习', course: { creatorId: 'teacher' }, questions: [{ id: 'q', type: 'text', question: 'snapshot label' }] }
  db.assignment.findUnique.mockReset()
  db.assignment.findUnique.mockResolvedValue(metadata).mockResolvedValueOnce({ ...metadata, questions: [{ id: 'q', type: 'text', question: 'stale label' }] })
  db.submission.findMany.mockReset()
  db.submission.findMany.mockResolvedValue([{ id: 's', submittedAt: new Date(), student: { username: 'synthetic' }, answers: { q: 'answer' } }])
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.concat(res.chunks))
  expect(JSON.stringify(workbook.worksheets[0].getSheetValues())).toContain('snapshot label')
  expect(JSON.stringify(workbook.worksheets[0].getSheetValues())).not.toContain('stale label')
})


it('does not deliver the file when fresh authentication calls next with an infrastructure error', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '练习', course: { creatorId: 'teacher' }, questions: [] })
  db.submission.findMany.mockResolvedValue([{ id: 's', submittedAt: new Date(), student: { username: 'synthetic' } }])
  auth.mockImplementationOnce((_req, _res, next) => next(new Error('synthetic authentication lookup failure')))
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  expect(res.setHeader).not.toHaveBeenCalled()
  expect(res.chunks).toHaveLength(0)
  expect(res.json).toHaveBeenCalledTimes(1)
  expect(res.status).toHaveBeenCalledWith(400)
})
