import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'

/**
 * Old-vs-new parity on a real PostgreSQL fixture. The oracle is the verbatim
 * pre-change code (fixtures/legacy*.ts) running against the same rows, with the
 * composite catalog query restored to its pre-change shape (no cognitive
 * pushdown, own membership read). Every response must be deep-equal.
 */
const url = integrationDatabaseUrl('TRAINING_ARCHIVE_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
const prefix = 'tasks-parity-' + randomUUID()
type Db = typeof import('../../config/database')['prisma']
let db: Db
let config: typeof import('../../config')['config']
let tasks: typeof import('../../services/studentTasks')
let inbox: typeof import('../../services/trainingLearningInbox')
let legacyTasks: typeof import('./fixtures/legacyStudentTasks')
let legacyInbox: typeof import('./fixtures/legacyTrainingLearningInbox')
const teacher = prefix + '-teacher', big = prefix + '-big', archived = prefix + '-archived', none = prefix + '-none'
const users = [big, archived, none]
const courseIds: Record<'B' | 'T1' | 'T2' | 'L', string> = { B: '', T1: '', T2: '', L: '' }
const compositeIds: string[] = [], questionnaireIds: string[] = []
const now = new Date()
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
const pushedDown = { not: 0, legacyRows: 0, newRows: 0 }

/** The catalog query exactly as main issued it: no `NOT` cognitive pushdown. */
async function legacy<T>(run: () => Promise<T>) {
  const original = db.compositeAssessment.findMany.bind(db.compositeAssessment) as (args: any) => Promise<any[]>
  const spy = vi.spyOn(db.compositeAssessment, 'findMany').mockImplementation(((args: any) => {
    const { NOT, ...where } = args.where
    if (NOT) expect(NOT).toEqual({ items: { some: { type: 'COGNITIVE' } }, attempts: { none: { userId: expect.any(String) } } })
    return original({ ...args, where }).then(rows => { pushedDown.legacyRows += rows.length; return rows })
  }) as any)
  try { return await run() } finally { spy.mockRestore() }
}
async function current<T>(run: () => Promise<T>) {
  const original = db.compositeAssessment.findMany.bind(db.compositeAssessment) as (args: any) => Promise<any[]>
  const spy = vi.spyOn(db.compositeAssessment, 'findMany').mockImplementation(((args: any) => {
    if (args.where.NOT) pushedDown.not++
    return original(args).then(rows => { pushedDown.newRows += rows.length; return rows })
  }) as any)
  try { return await run() } finally { spy.mockRestore() }
}

/**
 * Strict deep equality first. Both versions read multi-course delivery rows
 * (questionnaireCourseDelivery / courseQuestionnaires) with no ORDER BY, so
 * on main too a multi-course row's `courses` order, and the first-course
 * `courseId=` its href carries, follow PostgreSQL's physical order and can
 * move while other suites write the same tables. Only that pre-existing
 * unordered dimension may differ: same course set, href still names one of
 * those courses, everything else identical. Every such case is counted.
 */
const orderOnly = { count: 0 }
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const out: any = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, canonical(item)]))
  if (Array.isArray(out.courses) && out.courses.length > 1) {
    const ids = out.courses.map((course: any) => course.id)
    out.courses = [...out.courses].sort((left: any, right: any) => left.id.localeCompare(right.id))
    if (typeof out.href === 'string') out.href = out.href.replace(/courseId=([^&]+)/, (match: string, id: string) => ids.includes(decodeURIComponent(id)) ? 'courseId=<one-of-courses>' : match)
  }
  return out
}
function same(actual: unknown, expected: unknown, label: string) {
  try { expect(actual).toEqual(expected); return } catch {}
  expect(canonical(actual), label).toEqual(canonical(expected))
  orderOnly.count++
}

async function composite(index: number, data: { courseId?: string; productKind?: string; deliveries?: string[]; cognitive?: boolean; status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT'; opensAt?: Date | null; expiresAt?: Date | null; maxAttempts?: number; publishedAt?: Date }) {
  const id = `${prefix}-comp-${String(index).padStart(3, '0')}`
  compositeIds.push(id)
  await db.compositeAssessment.create({ data: { id, code: id, name: 'Parity ' + index, createdBy: teacher, status: 'DRAFT',
    productKind: data.productKind ?? 'LEGACY_COMPOSITE', courseId: data.courseId ?? null, maxAttempts: data.maxAttempts ?? 2,
    opensAt: data.opensAt ?? null, expiresAt: data.expiresAt ?? null,
    ...(data.productKind === 'QUESTIONNAIRE' ? { questionnaireType: 'COURSE', questionnaireCourses: { create: (data.deliveries ?? []).map(courseId => ({ courseId })) } } : {}),
  } })
  await db.compositeAssessmentItem.createMany({ data: [
    { compositeAssessmentId: id, type: 'FORM', position: 0, required: true, formType: 'text_input', formLabel: 'Fixture' },
    ...(data.cognitive ? [{ compositeAssessmentId: id, type: 'COGNITIVE' as const, position: 1, required: true }] : []),
  ] })
  if (data.status !== 'DRAFT') await db.compositeAssessment.update({ where: { id }, data: { status: data.status, publishedAt: data.publishedAt ?? at(-1000 + (index % 7)) } })
  return id
}
async function attempt(userId: string, compositeAssessmentId: string, status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED', extra: { taskSatisfaction?: string; deliveryCourseId?: string } = {}) {
  await db.compositeAssessmentAttempt.create({ data: { compositeAssessmentId, userId, participantKey: `user:${userId}`, status,
    progress: status === 'COMPLETED' ? 100 : 10, completedAt: status === 'COMPLETED' ? at(-5) : null, ...extra } })
}

async function seed() {
  await db.user.createMany({ data: [teacher, ...users].map((id, index) => ({ id, username: id, passwordHash: 'fixture-without-login-credentials', role: index ? 'STUDENT' : 'TEACHER', isActive: id !== archived })) })
  const course = async (key: keyof typeof courseIds, courseType: string, isLibrary: boolean, members: [string, 'ACTIVE' | 'APPROVED' | 'PENDING'][]) => {
    courseIds[key] = (await db.course.create({ data: { creatorId: teacher, title: `Parity ${key}`, courseCode: `${prefix}-${key}`, status: 'PUBLISHED', courseType, isLibrary,
      students: { create: members.map(([studentId, status]) => ({ studentId, status })) } } })).id
  }
  await course('B', 'LEGACY_COURSE', false, [[big, 'ACTIVE'], [archived, 'PENDING']])
  await course('T1', 'TRAINING_COURSE', false, [[big, 'APPROVED'], [archived, 'ACTIVE']])
  await course('T2', 'TRAINING_COURSE', false, [[big, 'ACTIVE']])
  await course('L', 'TRAINING_COURSE', true, [[big, 'ACTIVE']])
  const { B, T1, T2, L } = courseIds
  // Assignments / check-ins in every state, in the big course and in Training.
  for (const [courseId, count] of [[B, 25], [T1, 6], [T2, 3], [L, 2]] as const) {
    for (let i = 0; i < count; i++) {
      const row = await db.assignment.create({ data: { courseId, title: `A${i}`, status: i % 9 === 8 ? 'DRAFT' : 'PUBLISHED', deadline: i % 4 === 0 ? null : at(i % 2 ? 600 + i : -600 - i) } })
      if (i % 3 === 1) await db.submission.create({ data: { assignmentId: row.id, studentId: big, status: i % 2 ? 'DRAFT' : 'GRADED', comment: i % 6 === 1 ? 'fixture review' : null, reviewedAt: at(-30 - i) } })
      if (i % 5 === 2) await db.submission.create({ data: { assignmentId: row.id, studentId: archived, status: 'SUBMITTED' } })
    }
    for (let i = 0; i < Math.ceil(count / 3); i++) {
      const row = await db.checkin.create({ data: { courseId, creatorId: teacher, title: `C${i}`, endTime: i % 3 === 0 ? null : at(i % 2 ? 300 : -300) } })
      if (i % 2) await db.checkinSubmission.create({ data: { checkinId: row.id, studentId: big } })
    }
  }
  // Legacy questionnaires: public unlinked, public/course linked to each scope.
  const questionnaire = async (visibility: 'PUBLIC' | 'COURSE' | 'HIDDEN', courses: string[], assessment?: 'IN_PROGRESS' | 'COMPLETED') => {
    const id = `${prefix}-q-${questionnaireIds.length}`
    questionnaireIds.push(id)
    await db.questionnaire.create({ data: { id, code: id, name: id, creatorId: teacher, status: 'PUBLISHED', type: 'COURSE', visibility,
      courseQuestionnaires: { create: courses.map(courseId => ({ courseId })) } } })
    if (assessment) await db.questionnaireAssessment.create({ data: { questionnaireId: id, userId: big, status: assessment, completedAt: assessment === 'COMPLETED' ? at(-20) : null } })
  }
  await questionnaire('PUBLIC', [])
  await questionnaire('PUBLIC', [T1], 'COMPLETED')
  await questionnaire('PUBLIC', [B])
  await questionnaire('COURSE', [T1, T2], 'IN_PROGRESS')
  await questionnaire('COURSE', [B, T2])
  await questionnaire('COURSE', [L])
  await questionnaire('HIDDEN', [T1])
  // Big course: a large composite catalog, mostly COGNITIVE, every status.
  let index = 0
  for (let i = 0; i < 120; i++) {
    const status = i % 23 === 0 ? 'DRAFT' : i % 17 === 0 ? 'ARCHIVED' : 'PUBLISHED'
    const id = await composite(index++, { courseId: B, productKind: i % 10 === 9 ? 'ASSESSMENT_BUNDLE' : 'LEGACY_COMPOSITE', cognitive: i % 6 !== 0, status,
      opensAt: i % 11 === 3 ? at(120) : null, expiresAt: i % 13 === 4 ? at(-120) : i % 13 === 5 ? at(240) : null, maxAttempts: i % 8 === 0 ? 1 : 3 })
    if (i % 7 === 0) await attempt(big, id, 'IN_PROGRESS')
    if (i % 7 === 1) await attempt(big, id, 'COMPLETED', { taskSatisfaction: 'SATISFIED' })
    if (i % 7 === 2) await attempt(big, id, 'COMPLETED', { taskSatisfaction: 'NOT_SATISFIED' })
    if (i % 7 === 3) await attempt(big, id, 'ABANDONED')
    if (i % 9 === 0) await attempt(archived, id, 'COMPLETED')
  }
  // Multi-course Training deployment and Training-only/library deliveries.
  for (const [deliveries, cognitive, status, attemptStatus] of [
    [[T1, T2, B], false, 'PUBLISHED', 'COMPLETED'], [[T1, T2], true, 'PUBLISHED', null], [[T1], true, 'ARCHIVED', 'IN_PROGRESS'],
    [[T2], false, 'PUBLISHED', 'IN_PROGRESS'], [[B], false, 'PUBLISHED', null], [[L], false, 'PUBLISHED', null], [[T1], false, 'ARCHIVED', null],
    [[T1, B], true, 'PUBLISHED', 'ABANDONED'], [[T1], false, 'DRAFT', null],
  ] as const) {
    const id = await composite(index++, { productKind: 'QUESTIONNAIRE', deliveries: [...deliveries], cognitive, status })
    if (attemptStatus) await attempt(big, id, attemptStatus, { deliveryCourseId: deliveries[0] })
    if (attemptStatus === 'COMPLETED') await attempt(archived, id, 'COMPLETED', { deliveryCourseId: T1 })
  }
  for (let i = 0; i < 6; i++) {
    const id = await composite(index++, { courseId: i < 4 ? T1 : L, cognitive: i % 2 === 1, status: i === 3 ? 'ARCHIVED' : 'PUBLISHED' })
    if (i === 3) await attempt(archived, id, 'COMPLETED', { deliveryCourseId: T1 })
    if (i === 1) await attempt(big, id, 'IN_PROGRESS')
  }
}

async function compareTasks(userId: string) {
  const { taskFilters } = tasks
  const cases: { page: number; pageSize: number; state?: typeof taskFilters[number]; courseId?: string }[] = []
  for (const state of [undefined, ...taskFilters]) cases.push({ page: 1, pageSize: 100, state })
  for (const courseId of [undefined, courseIds.B, courseIds.T1, courseIds.T2, courseIds.L, prefix + '-not-enrolled'])
    for (const state of [undefined, 'ACTIONABLE' as const]) {
      const total = (await current(() => tasks.listStudentTasks(userId, { page: 1, pageSize: 7, state, courseId }, now))).total
      for (let page = 1; page <= Math.ceil(total / 7) + 2; page++) cases.push({ page, pageSize: 7, state, courseId })
      cases.push({ page: 50, pageSize: 20, state, courseId }, { page: 100000, pageSize: 100, state, courseId })
    }
  let rows = 0
  for (const options of cases) {
    const expected = await legacy(() => legacyTasks.legacyListStudentTasks(userId, options, now))
    const actual = await current(() => tasks.listStudentTasks(userId, options, now))
    same(actual, expected, JSON.stringify(options))
    rows += actual.list.length
  }
  return { cases: cases.length, rows }
}
async function compareInbox(userId: string) {
  let cases = 0, rows = 0
  for (const view of ['todo', 'feedback'] as const) for (const kind of ['ALL', 'ASSIGNMENT', 'CHECKIN', 'ASSESSMENT'] as const) {
    const total = (await current(() => inbox.listTrainingLearningInbox(userId, { view, kind, page: 1, pageSize: 6 }, now))).total
    for (const [page, pageSize] of [...Array.from({ length: Math.ceil(total / 6) + 2 }, (_, i) => [i + 1, 6]), [1, 50], [1000, 50]]) {
      const query = { view, kind, page, pageSize }
      const expected = await legacy(() => legacyInbox.legacyListTrainingLearningInbox(userId, query, now))
      const actual = await current(() => inbox.listTrainingLearningInbox(userId, query, now))
      same(actual, expected, JSON.stringify(query))
      cases++; rows += actual.list.length
    }
  }
  return { cases, rows }
}

suite('student tasks and Training inbox bounded-work parity (isolated real PostgreSQL)', () => {
  let previousCognitive: boolean
  beforeAll(async () => {
    if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('explicit loopback fixture database required')
    process.env.DATABASE_URL = url
    ;({ prisma: db } = await import('../../config/database'))
    ;({ config } = await import('../../config'))
    tasks = await import('../../services/studentTasks')
    inbox = await import('../../services/trainingLearningInbox')
    legacyTasks = await import('./fixtures/legacyStudentTasks')
    legacyInbox = await import('./fixtures/legacyTrainingLearningInbox')
    previousCognitive = config.cognitiveModuleEnabled
    await seed()
  }, 180000)
  afterAll(async () => {
    if (!db) return
    try {
      config.cognitiveModuleEnabled = previousCognitive
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: compositeIds } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: compositeIds } } })
      await db.questionnaireAssessment.deleteMany({ where: { questionnaireId: { in: questionnaireIds } } })
      await db.questionnaire.deleteMany({ where: { id: { in: questionnaireIds } } })
      const ids = Object.values(courseIds).filter(Boolean)
      await db.checkinSubmission.deleteMany({ where: { checkin: { courseId: { in: ids } } } })
      await db.course.deleteMany({ where: { id: { in: ids } } })
      await db.user.deleteMany({ where: { id: { in: [teacher, ...users] } } })
    } finally { await db.$disconnect() }
  })

  for (const cognitive of [false, true]) {
    it(`matches the pre-change task feed and inbox exactly with the cognitive module ${cognitive ? 'on' : 'off'}`, async () => {
      config.cognitiveModuleEnabled = cognitive
      Object.assign(pushedDown, { not: 0, legacyRows: 0, newRows: 0 }); orderOnly.count = 0
      const results = []
      for (const userId of users) results.push({ userId, tasks: await compareTasks(userId), inbox: await compareInbox(userId) })
      // The fixture really exercises the visible paths (pages with rows, both courses).
      process.stdout.write('PARITY_SUMMARY ' + JSON.stringify({ cognitive, results: results.map(({ tasks, inbox }) => ({ tasks, inbox })), compositeRows: { ...pushedDown }, unorderedDeliveryOrderOnlyDiffs: orderOnly.count }) + '\n')
      const bigResult = results.find(row => row.userId === big)!
      expect(bigResult.tasks.rows).toBeGreaterThan(100)
      expect(bigResult.inbox.rows).toBeGreaterThan(10)
      expect(results.find(row => row.userId === archived)!.inbox.rows).toBeGreaterThan(0)
      if (cognitive) expect(pushedDown.not).toBe(0)
      else {
        // The cognitive filter ran in SQL and the catalog read shrank.
        expect(pushedDown.not).toBeGreaterThan(0)
        expect(pushedDown.newRows).toBeLessThan(pushedDown.legacyRows / 2)
      }
    }, 600000)
  }
})
