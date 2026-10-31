import { beforeEach, expect, it, vi } from 'vitest'
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
const mocks = vi.hoisted(() => ({ enabled: true, memberships: vi.fn(), assignments: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  courseStudent: { findMany: mocks.memberships }, cognitiveAssignment: { findMany: mocks.assignments },
} }))
vi.mock('../../modules/cognitive/product-eligibility', async original => ({ ...(await original<any>()), isCognitiveNewAdmissionEnabled: () => mocks.enabled }))
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'

const target = 'course-0'
const memberships = Array.from({ length: 4 }, (_, i) => ({ courseId: `course-${i}`, studentId: 'student', status: i % 2 ? 'APPROVED' : 'ACTIVE' }))
const otherMemberships = [{ courseId: 'inactive', studentId: 'student', status: 'PENDING' }, { courseId: 'foreign', studentId: 'other', status: 'ACTIVE' }]
const row = (i: number) => ({
  id: `assignment-${i}`, courseId: `course-${Math.floor(i / 4)}`, title: `合成认知任务${i}`, instruction: '合成列表夹具', status: 'PUBLISHED', listedStandalone: true,
  opensAt: null, dueAt: new Date('2026-10-01T00:00:00Z'), maxAttempts: 2, required: true, publishedAt: new Date(Date.UTC(2026, 9, i + 1)),
  config: { id: `config-${i}`, testType: 'reaction', configVersion: '1', name: 'Reaction', engineVersion: '1', scoringVersion: '1', config: { private: 'not-projected' } },
  course: { id: `course-${Math.floor(i / 4)}`, title: '合成课程', courseCode: `C${Math.floor(i / 4)}`, isLibrary: false },
  sessions: [
    ...(i % 4 ? [{ id: `session-${i}`, userId: 'student', compositeAttemptId: null, status: i % 4 === 2 ? 'COMPLETED' : 'IN_PROGRESS', frozenAdmissionSnapshotHash: i % 4 === 3 ? null : 'frozen', createdAt: new Date('2026-10-03T00:00:00Z') }] : []),
    { id: `foreign-${i}`, userId: 'other', compositeAttemptId: null, status: 'COMPLETED', frozenAdmissionSnapshotHash: 'frozen', createdAt: new Date('2026-10-05T00:00:00Z') },
    { id: `child-${i}`, userId: 'student', compositeAttemptId: 'parent', status: 'COMPLETED', frozenAdmissionSnapshotHash: 'frozen', createdAt: new Date('2026-10-06T00:00:00Z') },
  ],
})
const assignments = Array.from({ length: 16 }, (_, i) => row(i))
const excluded = [
  { ...row(0), id: 'draft', status: 'DRAFT' },
  { ...row(0), id: 'wrapper', listedStandalone: false },
  { ...row(0), id: 'library', course: { ...row(0).course, isLibrary: true } },
  { ...row(0), id: 'inactive', courseId: 'inactive' },
  { ...row(0), id: 'foreign', courseId: 'foreign' },
]
const fixtureSHA256 = createHash('sha256').update(JSON.stringify({ memberships, otherMemberships, assignments, excluded })).digest('hex')
function project(value: any, select: any): any {
  return Object.fromEntries(Object.entries(select).map(([key, selection]: [string, any]) => [key, selection === true || value[key] == null ? value[key] :
    Array.isArray(value[key]) ? value[key].filter((s: any) => s.userId === selection.where.userId && s.compositeAttemptId === selection.where.compositeAttemptId && selection.where.status.in.includes(s.status))
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, selection.take).map((v: any) => project(v, selection.select)) : project(value[key], selection.select)]))
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true
  mocks.memberships.mockImplementation(async ({ where }: any) => [...memberships, ...otherMemberships].filter(m => m.studentId === where.studentId && where.status.in.includes(m.status) && (!where.courseId || m.courseId === where.courseId)).map(({ courseId }) => ({ courseId })))
  mocks.assignments.mockImplementation(async ({ where, select }: any) => [...assignments, ...excluded].filter(a => where.courseId.in.includes(a.courseId) && a.status === where.status && a.listedStandalone === where.listedStandalone && a.course.isLibrary === where.course.isLibrary)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).map(a => project(a, select)))
})
async function request(query: Record<string, string>) {
  const callsBefore = mocks.assignments.mock.calls.length
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await cognitiveController.myAssignments({ query, user: { userId: 'student', role: 'STUDENT' } } as any, res as any)
  const body = res.json.mock.calls[0][0]; expect(body.code).toBe(0)
  const selected = mocks.assignments.mock.calls.length > callsBefore ? await mocks.assignments.mock.results.at(-1)!.value : []
  const memberRows = await mocks.memberships.mock.results.at(-1)!.value
  if (process.env.COGNITIVE_COURSE_MEASURE_OUTPUT) appendFileSync(process.env.COGNITIVE_COURSE_MEASURE_OUTPUT,
    JSON.stringify({ query, enabled: mocks.enabled, fixtureSHA256, membershipRows: memberRows.length, assignmentRows: selected.length,
      sessionRows: selected.reduce((n: number, a: any) => n + a.sessions.length, 0), assignmentQueryExecuted: mocks.assignments.mock.calls.length > callsBefore,
      rawBodyBytes: Buffer.byteLength(JSON.stringify(body)), gzipBodyBytes: gzipSync(JSON.stringify(body), { level: 1 }).length, body }) + '\n')
  return body.data
}
it('keeps default published standalone non-library metadata and session ownership', async () => {
  const data = await request({})
  expect(data).toHaveLength(16)
  expect(data.map((a: any) => a.id)).toEqual([...assignments].reverse().map(a => a.id))
  expect(mocks.memberships.mock.calls[0][0].where).toEqual({ studentId: 'student', status: { in: ['ACTIVE', 'APPROVED'] } })
  expect(data.find((a: any) => a.id === 'assignment-0')).toMatchObject({ continueHref: null, latestCompletedSessionId: null })
  expect(data.find((a: any) => a.id === 'assignment-1').continueHref).toBe('/student/cognitive/sessions/session-1')
  expect(data.find((a: any) => a.id === 'assignment-2').latestCompletedSessionId).toBe('session-2')
  expect(data.every((a: any) => a.config.config === undefined)).toBe(true)
})
it('narrows memberships, assignment and session rows while returning the original course projection', async () => {
  const all = await request({}); const scoped = await request({ courseId: target })
  expect(scoped).toEqual(all.filter((a: any) => a.courseId === target))
  expect(scoped).toHaveLength(4)
  expect(mocks.memberships.mock.calls[1][0].where).toEqual({ ...mocks.memberships.mock.calls[0][0].where, courseId: target })
  expect(mocks.assignments.mock.calls[1][0].where).toEqual({ courseId: { in: [target] }, status: 'PUBLISHED', listedStandalone: true, course: { isLibrary: false } })
})
it('retains closed-admission frozen resume, completed feedback and paused unfrozen sessions in course scope', async () => {
  mocks.enabled = false
  const all = await request({}); const scoped = await request({ courseId: target })
  expect(scoped).toEqual(all.filter((a: any) => a.courseId === target))
  expect(scoped).toHaveLength(3)
  expect(scoped.find((a: any) => a.id === 'assignment-1')).toMatchObject({ admissionPaused: false, continueHref: '/student/cognitive/sessions/session-1' })
  expect(scoped.find((a: any) => a.id === 'assignment-2')).toMatchObject({ latestCompletedSessionId: 'session-2' })
  expect(scoped.find((a: any) => a.id === 'assignment-3')).toMatchObject({ admissionPaused: true, continueHref: null })
})
it('does not read assignments for an inactive, foreign or missing course membership', async () => {
  for (const courseId of ['inactive', 'foreign', 'missing']) expect(await request({ courseId })).toEqual([])
  expect(mocks.assignments).not.toHaveBeenCalled()
})
