import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'
const { db } = vi.hoisted(() => ({ db: {
  courseStudent: { findMany: vi.fn() }, compositeAssessment: { findMany: vi.fn() },
  compositeAssessmentAttempt: { findMany: vi.fn() }, questionnaireCourseDelivery: { findMany: vi.fn() },
  assignment: { findMany: vi.fn() }, checkin: { findMany: vi.fn() }, questionnaire: { findMany: vi.fn() },
} }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { listAvailableForStudent } from '../../modules/composite/composite.service'
import { compositeController } from '../../modules/composite/composite.controller'
import { listStudentTasks } from '../../services/studentTasks'
const now = new Date('2026-10-31T00:00:00.000Z')
const rows = Array.from({ length: 12 }, (_, i) => {
  const courseId = 'c' + Math.floor(i / 3)
  const productKind = ['LEGACY_COMPOSITE', 'ASSESSMENT_BUNDLE', 'QUESTIONNAIRE'][i % 3]
  return { id: 'q' + i, code: 'Q' + i, name: '课程测评' + i, description: '合成说明',
    status: i === 0 ? 'ARCHIVED' : 'PUBLISHED', productKind, questionnaireType: 'COURSE',
    course: productKind === 'QUESTIONNAIRE' ? null : { id: courseId, title: courseId, courseCode: courseId, isLibrary: false },
    deliveryIds: i === 5 ? [courseId, 'c0'] : [courseId], opensAt: null, expiresAt: null, maxAttempts: 3,
    items: [], formSections: [],
  }
})
const targetIds = new Set(rows.filter(row => row.deliveryIds.includes('c0')).map(row => row.id))
const attempts = rows.flatMap(row => [
  { id: row.id + '-active', compositeAssessmentId: row.id, status: 'IN_PROGRESS', progress: 50, taskSatisfaction: 'PENDING', completedAt: null, cognitiveSessions: [] },
  { id: row.id + '-done', compositeAssessmentId: row.id, status: 'COMPLETED', progress: 100, taskSatisfaction: 'SATISFIED', completedAt: now, cognitiveSessions: [] },
])
let reads: { composites: number; attempts: number }
beforeEach(() => {
  vi.clearAllMocks(); reads = { composites: 0, attempts: 0 }
  db.courseStudent.findMany.mockImplementation(async ({ where, select }) => {
    expect(where.studentId).toBe('student')
    expect(where.status).toEqual({ in: ['ACTIVE', 'APPROVED'] })
    return ['c0', 'c1', 'c2', 'c3'].filter(id => !where.courseId || where.courseId === id)
      .map(id => select.course ? { course: { id, title: id } } : { courseId: id })
  })
  db.compositeAssessment.findMany.mockImplementation(async ({ where }) => {
    expect(where.AND).toEqual([{ OR: [
      { status: 'PUBLISHED' }, { status: 'ARCHIVED', attempts: { some: { userId: 'student', status: { in: ['IN_PROGRESS', 'COMPLETED'] } } } },
    ] }])
    expect(where.OR[0].course).toEqual({ isLibrary: false })
    expect(where.OR[1].questionnaireCourses.some.course).toEqual({ isLibrary: false })
    const legacyIds = where.OR[0].courseId.in
    const questionnaireIds = where.OR[1].questionnaireCourses.some.courseId.in
    const result = rows.filter(row => row.productKind === 'QUESTIONNAIRE'
      ? row.deliveryIds.some(id => questionnaireIds.includes(id)) : legacyIds.includes(row.course!.id))
    reads.composites += result.length; return result
  })
  db.compositeAssessmentAttempt.findMany.mockImplementation(async ({ where, orderBy }) => {
    expect(where.userId).toBe('student'); expect(orderBy).toEqual({ startedAt: 'desc' })
    const result = attempts.filter(row => where.compositeAssessmentId.in.includes(row.compositeAssessmentId))
    reads.attempts += result.length; return result
  })
  for (const key of ['assignment', 'checkin', 'questionnaire'] as const) db[key].findMany.mockResolvedValue([])
  db.questionnaireCourseDelivery.findMany.mockImplementation(async ({ where }) => rows
    .filter(row => row.productKind === 'QUESTIONNAIRE' && where.compositeId.in.includes(row.id))
    .flatMap(row => row.deliveryIds.filter(id => where.courseId.in.includes(id)).map(courseId => ({ compositeId: row.id, courseId }))))
})
const response = () => { const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res }
describe('Composite course-scoped availability', () => {
  it('retains default catalog, archived continuation and latest completed feedback', async () => {
    const list = await listAvailableForStudent('student', now.getTime())
    expect(list).toHaveLength(12)
    expect(list[0]).toMatchObject({ canStartNewAttempt: false, canContinue: true,
      attempt: { id: 'q0-active' }, latestCompletedAttempt: { id: 'q0-done' } })
    expect(reads).toEqual({ composites: 12, attempts: 24 })
  })
  it('narrows before materialization while preserving the exact multi-course projection', async () => {
    const full = await listAvailableForStudent('student', now.getTime())
    const baseline = { ...reads }; reads = { composites: 0, attempts: 0 }
    const scoped = await listAvailableForStudent('student', now.getTime(), 'c0')
    expect(scoped).toEqual(full.filter(row => targetIds.has(row.id)))
    expect(reads).toEqual({ composites: 4, attempts: 8 })
    const bytes = (value: unknown) => { const body = JSON.stringify(value); return { json: Buffer.byteLength(body), gzip: gzipSync(body, { level: 1 }).byteLength } }
    console.info('COMPOSITE_SCOPE_MEASUREMENT', JSON.stringify({ baseline: { ...baseline, ...bytes(full) }, candidate: { ...reads, ...bytes(scoped) }, fixture: 'mock Prisma rows, real service; not SQL/network timing' }))
  })
  it('does not create entitlement from a caller-selected unjoined course', async () => {
    expect(await listAvailableForStudent('student', now.getTime(), 'not-enrolled')).toEqual([])
    expect(db.compositeAssessment.findMany).not.toHaveBeenCalled()
    expect(db.compositeAssessmentAttempt.findMany).not.toHaveBeenCalled()
  })
  it('forwards the available endpoint course to the same authorized service', async () => {
    const res = response()
    await compositeController.available({ user: { userId: 'student' }, query: { courseId: 'c0' } } as any, res)
    expect(res.json.mock.calls[0][0].data.list.map((row: any) => row.id)).toEqual([...targetIds])
    expect(reads).toEqual({ composites: 4, attempts: 8 })
  })
  it('keeps task-feed counts, ordering and page continuation while reducing each page read', async () => {
    const first = await listStudentTasks('student', { page: 1, pageSize: 2, courseId: 'c0' }, now)
    const second = await listStudentTasks('student', { page: 2, pageSize: 2, courseId: 'c0' }, now)
    expect(first.total).toBe(4); expect(first.counts).toEqual(second.counts)
    expect(first.counts.IN_PROGRESS).toBe(4)
    expect([...first.list, ...second.list].map(row => row.id)).toEqual([...targetIds].sort())
    expect(reads).toEqual({ composites: 8, attempts: 16 })
  })
})
