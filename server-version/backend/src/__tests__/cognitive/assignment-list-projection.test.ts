import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ enabled: true,
  db: { courseStudent: { findMany: vi.fn() }, cognitiveAssignment: { findMany: vi.fn() } } }))
vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../modules/cognitive/product-eligibility', async original => ({ ...(await original<any>()), isCognitiveNewAdmissionEnabled: () => mocks.enabled }))
import { listStudentAssignments } from '../../modules/cognitive/assignment.service'
const date = new Date('2026-10-01T00:00:00Z')
const row = (sessions: any[] = []) => ({ id: 'assignment', courseId: 'course', title: 'Title', instruction: 'Instruction', status: 'PUBLISHED',
  opensAt: null, dueAt: date, maxAttempts: 2, required: true, publishedAt: date,
  courseSnapshot: { hidden: true }, resolvedConfigSnapshotEncrypted: 'unused-config-cipher', resolvedReportSnapshotEncrypted: 'unused-report-cipher',
  config: { id: 'config', testType: 'reaction', configVersion: '1', name: 'Reaction', engineVersion: '1', scoringVersion: '1', config: { unused: 'large' } },
  course: { id: 'course', title: 'Course', courseCode: 'CODE', description: 'unused-description' }, sessions })
function project(value: any, select: any): any {
  return Object.fromEntries(Object.entries(select).filter(([, selection]) => Boolean(selection)).map(([key, selection]: [string, any]) => {
    const field = value[key]
    return [key, selection === true || field == null ? field : Array.isArray(field)
      ? field.slice(0, selection.take ?? field.length).map(item => project(item, selection.select)) : project(field, selection.select)]
  }))
}
function supply(value: ReturnType<typeof row>) {
  mocks.db.cognitiveAssignment.findMany.mockImplementation(async args => [project(value, args.select)])
}
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.db.courseStudent.findMany.mockResolvedValue([{ courseId: 'course' }]) })
afterEach(() => vi.restoreAllMocks())
describe('student cognitive assignment metadata projection', () => {
  it('returns the unchanged DTO while excluding frozen payloads and full related rows', async () => {
    supply(row())
    const result = await listStudentAssignments('student')
    expect(result).toEqual([{ id: 'assignment', admissionPaused: false, continueHref: null, latestCompletedSessionId: null,
      courseId: 'course', title: 'Title', instruction: 'Instruction', status: 'PUBLISHED', opensAt: null, dueAt: date,
      maxAttempts: 2, required: true, publishedAt: date,
      course: { id: 'course', title: 'Course', courseCode: 'CODE' },
      config: { id: 'config', testType: 'reaction', configVersion: '1', name: 'Reaction', engineVersion: '1', scoringVersion: '1' } }])
    const args = mocks.db.cognitiveAssignment.findMany.mock.calls[0][0]
    expect(args.include).toBeUndefined()
    expect(Object.keys(args.select).sort()).toEqual(['id','courseId','title','instruction','status','opensAt','dueAt','maxAttempts','required','publishedAt','config','course','sessions'].sort())
    expect(Object.keys(args.select.config.select).sort()).toEqual(['id','testType','configVersion','name','engineVersion','scoringVersion'].sort())
    expect(args.select.course).toEqual({ select: { id: true, title: true, courseCode: true } })
    expect(args.where).toEqual({ courseId: { in: ['course'] }, status: 'PUBLISHED', listedStandalone: true, course: { isLibrary: false } })
    expect(args.orderBy).toEqual({ publishedAt: 'desc' })
    expect(args.select.sessions).toEqual({ where: { userId: 'student', compositeAttemptId: null, status: { in: ['IN_PROGRESS','COMPLETED'] } },
      orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, frozenAdmissionSnapshotHash: true } })
    expect(mocks.db.courseStudent.findMany).toHaveBeenCalledWith({ where: { studentId: 'student', status: { in: ['ACTIVE','APPROVED'] } }, select: { courseId: true } })
  })
  it('does not query assignments when no eligible membership exists', async () => {
    mocks.db.courseStudent.findMany.mockResolvedValue([])
    expect(await listStudentAssignments('student')).toEqual([]); expect(mocks.db.cognitiveAssignment.findMany).not.toHaveBeenCalled()
  })
  it('hides new assignments while new admission is disabled', async () => {
    mocks.enabled = false; supply(row())
    expect(await listStudentAssignments('student')).toEqual([])
  })
  it.each([
    ['IN_PROGRESS', null, true, null, null],
    ['IN_PROGRESS', 'frozen', false, '/student/cognitive/sessions/latest', null],
    ['COMPLETED', 'frozen', false, null, 'latest'],
  ])('keeps closed-admission latest session behavior: %s / %s', async (status, hash, paused, href, completed) => {
    mocks.enabled = false
    supply(row([{ id: 'latest', status, frozenAdmissionSnapshotHash: hash }, { id: 'older', status: 'COMPLETED', frozenAdmissionSnapshotHash: 'older' }]))
    expect(await listStudentAssignments('student')).toMatchObject([{ admissionPaused: paused, continueHref: href, latestCompletedSessionId: completed }])
  })
})
