import { beforeEach, expect, it, vi } from 'vitest'
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { scaleController } from '../../controllers/scaleController'

const mocks = vi.hoisted(() => ({ courses: vi.fn(), scales: vi.fn(), attempts: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  courseStudent: { findMany: mocks.courses }, scale: { findMany: mocks.scales },
  assessment: { findMany: mocks.attempts },
} }))

const target = 'target-course'
const scales = Array.from({ length: 12 }, (_, i) => ({
  id: `scale-${i}`, code: `S${i}`, name: `合成课程量表${i}`, description: '合成目录夹具',
  status: 'PUBLISHED', visibility: i % 2 ? 'COURSE' : 'PUBLIC', estimatedTime: 5,
  itemCount: 12, dimensionCount: 2, createdAt: new Date(Date.UTC(2026, 9, i + 1)),
  courseScales: [{ course: { id: i < 3 ? target : 'other-course', title: i < 3 ? '当前课程' : '其他课程' } },
    ...(i === 1 ? [{ course: { id: 'other-course', title: '其他课程' } }] : [])],
}))
const excluded = [
  { ...scales[0], id: 'hidden', visibility: 'HIDDEN' },
  { ...scales[0], id: 'draft', status: 'DRAFT' },
  { ...scales[0], id: 'not-joined', visibility: 'COURSE', courseScales: [{ course: { id: 'not-joined', title: '未加入' } }] },
]
const attempts = scales.flatMap((scale, i) => [
  { id: `${scale.id}-done`, scaleId: scale.id, userId: 'student', status: 'COMPLETED', startedAt: new Date('2026-10-01T00:00:00Z'), completedAt: new Date('2026-10-02T00:00:00Z'), progress: 100, questionnaireAssessmentId: null, compositeAttemptId: null },
  ...(i === 1 ? ['z', 'a'].map(suffix => ({ id: `${scale.id}-active-${suffix}`, scaleId: scale.id, userId: 'student', status: 'IN_PROGRESS', startedAt: new Date('2026-10-03T00:00:00Z'), completedAt: null, progress: 40, questionnaireAssessmentId: null, compositeAttemptId: null })) : []),
])
const foreignAttempts = [
  { ...attempts[0], id: 'foreign-user', userId: 'other-student' },
  { ...attempts[0], id: 'questionnaire-child', questionnaireAssessmentId: 'questionnaire-parent' },
  { ...attempts[0], id: 'composite-child', compositeAttemptId: 'composite-parent' },
]
const allAttempts = [...attempts, ...foreignAttempts]
const fixtureSHA256 = createHash('sha256').update(JSON.stringify({ scales, excluded, allAttempts })).digest('hex')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.courses.mockResolvedValue([{ courseId: target }, { courseId: 'other-course' }])
  mocks.scales.mockImplementation(async ({ where }: any) => [...scales, ...excluded].filter(scale =>
    scale.status === where.status &&
    (!where.courseScales || scale.courseScales.some(cs => cs.course.id === where.courseScales.some.courseId)) &&
    (!where.OR || where.OR.some((rule: any) => scale.visibility === rule.visibility &&
      (!rule.courseScales || scale.courseScales.some(cs => rule.courseScales.some.courseId.in.includes(cs.course.id)))))
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
  mocks.attempts.mockImplementation(async ({ where }: any) => allAttempts.filter(a =>
    a.userId === where.userId && where.scaleId.in.includes(a.scaleId) &&
    a.questionnaireAssessmentId === where.questionnaireAssessmentId && a.compositeAttemptId === where.compositeAttemptId))
})
async function request(query: Record<string, string>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await scaleController.available({ query, user: { userId: 'student', role: 'STUDENT' } } as any, res as any)
  const body = res.json.mock.calls[0][0]
  expect(body.code).toBe(0)
  const ids = mocks.attempts.mock.calls.at(-1)![0].where.scaleId.in as string[]
  const returnedAttempts = await mocks.attempts.mock.results.at(-1)!.value
  if (process.env.SCALE_COURSE_MEASURE_OUTPUT) appendFileSync(process.env.SCALE_COURSE_MEASURE_OUTPUT,
    JSON.stringify({ query, fixtureSHA256, scaleIds: ids, scaleRows: ids.length, attemptRows: returnedAttempts.length,
      prismaCalls: { memberships: mocks.courses.mock.calls.length, scales: mocks.scales.mock.calls.length, attempts: mocks.attempts.mock.calls.length },
      rawBodyBytes: Buffer.byteLength(JSON.stringify(body)), gzipBodyBytes: gzipSync(JSON.stringify(body), { level: 1 }).length, body }) + '\n')
  return body.data
}

it('preserves the default catalog ordering, status and standalone attempt isolation', async () => {
  const data = await request({})
  expect(data.total).toBe(12)
  expect(data.list.map((s: any) => s.id)).toEqual([...scales].reverse().map(s => s.id))
  expect(mocks.scales.mock.calls[0][0].where).not.toHaveProperty('courseScales')
  expect(data.list.find((s: any) => s.id === 'scale-0').attemptCount).toBe(1)
  expect(data.list.find((s: any) => s.id === 'scale-1')).toMatchObject({ completed: true, inProgress: true,
    assessmentId: 'scale-1-active-a', attemptCount: 3, retakeAllowed: false })
})
it('returns identical course rows while narrowing the catalog and attempt query', async () => {
  const all = await request({})
  const scoped = await request({ courseId: target })
  expect(scoped).toEqual({ list: all.list.filter((s: any) => s.courses.some((c: any) => c.id === target)), total: 3 })
  expect(mocks.scales.mock.calls[1][0].where).toEqual({ ...mocks.scales.mock.calls[0][0].where, courseScales: { some: { courseId: target } } })
  expect(mocks.attempts.mock.calls[1][0].where).toEqual({ userId: 'student', scaleId: { in: ['scale-2', 'scale-1', 'scale-0'] }, questionnaireAssessmentId: null, compositeAttemptId: null })
  expect(scoped.list.find((s: any) => s.id === 'scale-1').courses).toHaveLength(2)
})
it('keeps inaccessible COURSE entries excluded and returns no rows for unrelated courses', async () => {
  expect(await request({ courseId: 'not-joined' })).toEqual({ list: [], total: 0 })
  expect(await request({ courseId: 'missing' })).toEqual({ list: [], total: 0 })
  expect(mocks.attempts.mock.calls.map(([arg]) => arg.where.scaleId.in)).toEqual([[], []])
})
