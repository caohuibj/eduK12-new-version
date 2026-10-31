import { beforeEach, expect, it, vi } from 'vitest'
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { questionnaireController } from '../../controllers/questionnaireController'

const mocks = vi.hoisted(() => ({ courses: vi.fn(), questionnaires: vi.fn(), attempts: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  courseStudent: { findMany: mocks.courses }, questionnaire: { findMany: mocks.questionnaires },
  questionnaireAssessment: { findMany: mocks.attempts },
} }))

const questionnaires = Array.from({ length: 12 }, (_, i) => ({
  id: i === 5 ? 'target' : `q-${i}`, code: `Q${i}`, name: `合成问卷${i}`, description: '现有课程问卷',
  instruction: '请按实际情况作答', estimatedTime: 5, status: 'PUBLISHED', type: 'COURSE',
  visibility: i % 2 ? 'COURSE' : 'PUBLIC', createdAt: new Date(2026, 9, i + 1),
  questionnaireScales: [{ scale: { id: `scale-${i}`, name: '合成量表', itemCount: 3, dimensionCount: 1 } }],
  formItems: [{ id: `f-${i}-1` }, { id: `f-${i}-2` }],
  courseQuestionnaires: [{ course: { id: 'joined-course', title: '当前课程' } }],
  _count: { formItems: 2, questionnaireScales: 1, assessments: 2 },
}))
const excluded = [
  { ...questionnaires[0], id: 'not-joined', visibility: 'COURSE', courseQuestionnaires: [{ course: { id: 'other-course', title: '其他课程' } }] },
  { ...questionnaires[0], id: 'draft', status: 'DRAFT' },
  { ...questionnaires[0], id: 'general', type: 'GENERAL' },
  { ...questionnaires[0], id: 'private', visibility: 'PRIVATE' },
]
const attempts = questionnaires.flatMap(q => [
  { id: `${q.id}-active-z`, questionnaireId: q.id, status: 'IN_PROGRESS', startedAt: new Date('2026-10-02Z'), progress: 25, completedAt: null },
  { id: `${q.id}-done`, questionnaireId: q.id, status: 'COMPLETED', startedAt: new Date('2026-10-01Z'), progress: 100, completedAt: new Date('2026-10-03Z') },
]).concat([
  { id: 'target-active-a', questionnaireId: 'target', status: 'IN_PROGRESS', startedAt: new Date('2026-10-01Z'), progress: 50, completedAt: null },
  { id: 'target-done-latest', questionnaireId: 'target', status: 'COMPLETED', startedAt: new Date('2026-10-01Z'), progress: 100, completedAt: new Date('2026-10-04Z') },
])
const matches = (q: typeof questionnaires[number], where: any): boolean => (!where.id || q.id === where.id)
  && q.status === where.status && q.type === where.type
  && where.OR.some((rule: any) => rule.visibility === q.visibility && (rule.visibility === 'PUBLIC'
    || q.courseQuestionnaires.some(c => rule.courseQuestionnaires.some.courseId.in.includes(c.course.id))))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.courses.mockResolvedValue([{ courseId: 'joined-course' }])
  mocks.questionnaires.mockImplementation(async ({ where }) => [...questionnaires, ...excluded]
    .filter(q => matches(q, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
  mocks.attempts.mockImplementation(async ({ where }) => attempts.filter(a => where.questionnaireId.in.includes(a.questionnaireId)))
})
async function request(query: Record<string, string>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await questionnaireController.available({ query, user: { userId: 'student', role: 'STUDENT' } } as any, res as any)
  const body = res.json.mock.calls[0][0]
  const ids: string[] = mocks.attempts.mock.calls.at(-1)?.[0].where.questionnaireId.in ?? []
  if (process.env.QUESTIONNAIRE_AVAILABLE_MEASURE_OUTPUT) appendFileSync(process.env.QUESTIONNAIRE_AVAILABLE_MEASURE_OUTPUT,
    JSON.stringify({ query, fixtureSHA256: createHash('sha256').update(JSON.stringify({ questionnaires, excluded, attempts })).digest('hex'),
      questionnaireIds: ids, questionnaireRows: ids.length, attemptRows: attempts.filter(a => ids.includes(a.questionnaireId)).length,
      formRows: ids.length * 2, scaleLinks: ids.length, rawBodyBytes: Buffer.byteLength(JSON.stringify(body)),
      gzipBodyBytes: gzipSync(JSON.stringify(body), { level: 1 }).length, body }) + '\n')
  return body.data
}

it('keeps the default catalog and identical target DTO while narrowing questionnaire and attempt rows', async () => {
  const all = await request({})
  expect(all.total).toBe(12)
  expect(all.list.map((q: any) => q.id)).toEqual([...questionnaires].reverse().map(q => q.id))
  expect(mocks.questionnaires.mock.calls[0][0].where).not.toHaveProperty('id')
  const target = await request({ questionnaireId: 'target' })
  expect(target).toEqual({ list: [all.list.find((q: any) => q.id === 'target')], total: 1 })
  expect(mocks.questionnaires.mock.calls[1][0].where).toEqual({ ...mocks.questionnaires.mock.calls[0][0].where, id: 'target' })
  expect(mocks.attempts.mock.calls[1][0].where).toEqual({ userId: 'student', questionnaireId: { in: ['target'] } })
  expect(target.list[0]).toMatchObject({ inProgress: true, completed: true, activeAttempt: { id: 'target-active-a' },
    latestCompletedAttempt: { id: 'target-done-latest' }, assessmentId: 'target-done-latest', attemptCount: 4 })
})
it.each(['not-joined', 'draft', 'general', 'private', 'missing'])('keeps %s outside target availability', async id => {
  expect(await request({ questionnaireId: id })).toEqual({ list: [], total: 0 })
  expect(mocks.attempts.mock.calls[0][0].where.questionnaireId.in).toEqual([])
})
