import { beforeEach, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
const db = vi.hoisted(() => ({ assignment: { findUnique: vi.fn(), findMany: vi.fn() }, submission: { findMany: vi.fn() }, course: { findMany: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { assignmentController } from '../../controllers/assignmentController'
const response = () => { const res: any = {}; res.setHeader = vi.fn(); res.send = vi.fn(); res.status = vi.fn(() => res); res.json = vi.fn(); return res }
beforeEach(() => vi.clearAllMocks())

it('preserves assignment workbook answers, feedback and formula escaping with the narrow export projection', async () => {
  db.assignment.findUnique.mockResolvedValue({ title: '合成练习', course: { creatorId: 'teacher' }, questions: [{ id: 'q', question: '合成问题', type: 'text' }] })
  db.submission.findMany.mockResolvedValue([{ student: { nickname: '=合成姓名', username: 'synthetic', phone: null }, content: '合成正文', answers: { q: '合成答案' }, submittedAt: new Date('2026-10-23T00:00:00Z'), reviewedAt: null, status: 'SUBMITTED', comment: '合成反馈' }])
  const res = response()
  await assignmentController.export({ user: { userId: 'teacher', role: 'TEACHER' }, params: { id: 'a' } } as any, res)
  const book = new ExcelJS.Workbook(); await book.xlsx.load(res.send.mock.calls[0][0])
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
