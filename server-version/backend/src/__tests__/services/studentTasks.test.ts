import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, available } = vi.hoisted(() => ({
  db: { courseStudent: { findMany: vi.fn() }, assignment: { findMany: vi.fn() }, checkin: { findMany: vi.fn() }, questionnaire: { findMany: vi.fn() }, questionnaireCourseDelivery: { findMany: vi.fn() } },
  available: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => ({ listAvailableForStudent: available }))
import { listStudentTasks } from '../../services/studentTasks'
const now = new Date('2026-09-30T00:00:00Z')
beforeEach(() => {
  vi.clearAllMocks()
  db.courseStudent.findMany.mockResolvedValue([{ course: { id: 'c', title: '课程' } }])
  for (const table of [db.assignment, db.checkin, db.questionnaire, db.questionnaireCourseDelivery]) table.findMany.mockResolvedValue([])
  available.mockResolvedValue([])
})
describe('student task aggregate', () => {
  it('limits membership to the current active student and excludes library/private/draft content in every batch', async () => {
    await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(db.courseStudent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: 'student', status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false } } }))
    expect(db.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: { in: ['c'] }, status: 'PUBLISHED' }, select: expect.objectContaining({ submissions: { where: { studentId: 'student' }, select: { status: true } } }) }))
    expect(db.checkin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: { in: ['c'] } } }))
    expect(db.questionnaire.findMany.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED', type: 'COURSE', OR: [{ visibility: 'PUBLIC' }, { visibility: 'COURSE', courseQuestionnaires: { some: { courseId: { in: ['c'] } } } }] })
    expect(available).toHaveBeenCalledWith('student', now.getTime())
  })
  it('keeps exact deadline equality open, distinguishes drafts, and preserves completed tasks after expiry', async () => {
    db.assignment.findMany.mockResolvedValue([
      { id: 'equal', courseId: 'c', title: 'equal', deadline: now, submissions: [] },
      { id: 'draft', courseId: 'c', title: 'draft', deadline: null, submissions: [{ status: 'DRAFT' }] },
      { id: 'late', courseId: 'c', title: 'late', deadline: new Date(now.getTime() - 1), submissions: [{ status: 'DRAFT' }] },
      { id: 'done', courseId: 'c', title: 'done', deadline: new Date(now.getTime() - 1), submissions: [{ status: 'GRADED' }] },
    ])
    const result = await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(result.list.map(row => [row.id, row.state, row.canContinue, row.canStart])).toEqual([
      ['draft', 'IN_PROGRESS', true, false], ['equal', 'PENDING', false, true], ['late', 'EXPIRED', false, false], ['done', 'COMPLETED', false, false],
    ])
    expect(result.list.find(row => row.id === 'late')?.href).toBeNull()
  })
  it('prioritizes a new active attempt over past completion and blocks expired resume links', async () => {
    db.questionnaire.findMany.mockResolvedValue([{ id: 'q', name: '问卷', courseQuestionnaires: [{ courseId: 'c' }], assessments: [{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }] }])
    const base = { course: { id: 'c' }, opensAt: null, expiresAt: null, canContinue: true, canStartNewAttempt: false, attempt: { id: 'active' }, latestCompletedAttempt: { id: 'old' } }
    available.mockResolvedValue([{ ...base, id: 'new', name: 'new', availability: 'OPEN' }, { ...base, id: 'late', name: 'late', availability: 'EXPIRED' }])
    const result = await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(result.list.find(row => row.id === 'q')?.state).toBe('IN_PROGRESS')
    expect(result.list.find(row => row.id === 'new')).toMatchObject({ state: 'IN_PROGRESS', href: '/student/composite/attempts/active', canContinue: true })
    expect(result.list.find(row => row.id === 'late')).toMatchObject({ state: 'EXPIRED', href: null, canContinue: false })
  })
  it('deduplicates questionnaires delivered to several courses and paginates deterministically with global counts', async () => {
    db.courseStudent.findMany.mockResolvedValue([{ course: { id: 'c', title: '课程' } }, { course: { id: 'd', title: '课程2' } }])
    db.questionnaire.findMany.mockResolvedValue([{ id: 'q', name: '问卷', courseQuestionnaires: [{ courseId: 'c' }, { courseId: 'd' }], assessments: [] }])
    db.checkin.findMany.mockResolvedValue([{ id: 'check', title: '打卡', courseId: 'c', endTime: null, submissions: [{ id: 'mine' }] }])
    const result = await listStudentTasks('student', { page: 1, pageSize: 1, state: 'PENDING' }, now)
    expect(result.total).toBe(1)
    expect(result.list[0].courses).toHaveLength(2)
    expect(result.counts.COMPLETED).toBe(1)
    expect(result.generatedAt).toBe(now.toISOString())
  })
  it('keeps query count constant with 100 courses and returns no course tasks without membership', async () => {
    db.courseStudent.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({ course: { id: `c${index}`, title: '课程' } })))
    await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    for (const table of [db.assignment, db.checkin, db.questionnaire]) expect(table.findMany).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()
    db.courseStudent.findMany.mockResolvedValue([])
    const result = await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(result.list).toEqual([])
    expect(db.assignment.findMany).not.toHaveBeenCalled()
    expect(db.checkin.findMany).not.toHaveBeenCalled()
  })
  it('propagates read failures instead of returning a misleading empty aggregate', async () => {
    db.assignment.findMany.mockRejectedValue(new Error('database unavailable'))
    await expect(listStudentTasks('student', { page: 1, pageSize: 20 }, now)).rejects.toThrow('database unavailable')
  })
  it('opens the latest completed questionnaire report without starting a retake', async () => {
    db.questionnaire.findMany.mockResolvedValue([{ id: 'q', name: '问卷', courseQuestionnaires: [], assessments: [
      { id: 'old', status: 'COMPLETED', completedAt: new Date(now.getTime() - 1000) },
      { id: 'new', status: 'COMPLETED', completedAt: now },
    ] }])
    const result = await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(result.list[0]).toMatchObject({ state: 'COMPLETED', canStart: false, href: '/student/questionnaires/result/new' })
  })
  it('includes new questionnaires delivered to a member course and rejects unrelated composite contexts', async () => {
    const base = { name: '新问卷', opensAt: null, expiresAt: null, canContinue: false, canStartNewAttempt: true, availability: 'OPEN', latestCompletedAttempt: null }
    available.mockResolvedValue([{ ...base, id: 'new', course: null }, { ...base, id: 'other', course: { id: 'private' } }])
    db.questionnaireCourseDelivery.findMany.mockResolvedValue([{ compositeId: 'new', courseId: 'c' }])
    const result = await listStudentTasks('student', { page: 1, pageSize: 20 }, now)
    expect(result.list).toHaveLength(1)
    expect(result.list[0]).toMatchObject({ id: 'new', courses: [{ id: 'c', title: '课程' }], state: 'PENDING', href: '/student/composite/new' })
  })
})
