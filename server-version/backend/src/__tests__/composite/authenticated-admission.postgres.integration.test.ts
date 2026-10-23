import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { lockAuthenticatedAdmission } from '../../modules/composite/authenticated-admission-lock'

const url = integrationDatabaseUrl('AUTHENTICATED_ADMISSION_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
const prefix = 'admission-concurrency-' + randomUUID()
const teacher = prefix + '-teacher', a = prefix + '-a', b = prefix + '-b'
let db: typeof import('../../config/database')['prisma']
let runtime: typeof import('../../modules/composite/composite.service')
let courseId: string
const publications: string[] = []
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { resolve, promise } }
async function fixture() {
  const id = prefix + '-' + publications.length
  publications.push(id)
  const row = await db.compositeAssessment.create({ data: {
    id, code: id, name: 'Synthetic concurrent admission', createdBy: teacher,
    productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 1,
    questionnaireCourses: { create: { courseId } },
    formSections: { create: { title: 'Synthetic form', position: 0, contextSection: false } },
  }, include: { formSections: true } })
  await db.compositeAssessmentItem.create({ data: {
    compositeAssessmentId: id, type: 'FORM', position: 0, required: true,
    formType: 'text_input', formLabel: 'Synthetic answer', formSectionId: row.formSections[0].id, formSectionPosition: 0,
  } })
  await db.compositeAssessment.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
  return id
}
suite('authenticated admission lock boundaries (real isolated PostgreSQL)', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    ;({ prisma: db } = await import('../../config/database'))
    runtime = await import('../../modules/composite/composite.service')
    await db.user.createMany({ data: [teacher,a,b].map((id,i) => ({ id, username: id,
      role: i === 0 ? 'TEACHER' as const : 'STUDENT' as const, passwordHash: 'non-login-fixture' })) })
    const course = await db.course.create({ data: { creatorId: teacher, title: 'Synthetic admission',
      courseCode: prefix, courseType: 'TRAINING_COURSE', status: 'PUBLISHED',
      students: { create: [a,b].map(studentId => ({ studentId, status: 'ACTIVE' as const })) },
    } })
    courseId = course.id
  })
  afterAll(async () => {
    if (!db) return
    try {
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: publications } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: publications } } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
      await db.user.deleteMany({ where: { id: { in: [teacher,a,b] } } })
    } finally { await db.$disconnect() }
  })
  it('admits a different student while the first student owns its admission transaction', async () => {
    const id = await fixture(), ready = deferred(), release = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const started = await Promise.race([runtime.startUserAttempt(b,id),new Promise<never>((_,reject) => {
        timer = setTimeout(() => reject(new Error('Different student blocked behind a publication writer lock')),4000)
      })])
      expect(started.attempt).toMatchObject({ status: 'IN_PROGRESS' })
    } finally { if (timer) clearTimeout(timer); release.resolve(); await held }
  })
  it('serializes duplicate starts for one student and retains maxAttempts', async () => {
    const id = await fixture()
    const results = await Promise.all(Array.from({ length: 4 },() => runtime.startUserAttempt(a,id)))
    expect(new Set(results.map(row => row.attempt.id)).size).toBe(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: id, userId: a } })).toBe(1)
    await db.compositeAssessmentAttempt.update({ where: { id: results[0].attempt.id }, data: { status: 'COMPLETED' } })
    await expect(runtime.startUserAttempt(a,id)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('keeps archive behind admitted readers and refuses a new start after archive commits', async () => {
    const id = await fixture(), ready = deferred(), release = deferred(), updateStarted = deferred()
    const held = db.$transaction(async tx => {
      await lockAuthenticatedAdmission(tx,id,a); ready.resolve(); await release.promise
    }, { timeout: 10000 })
    await ready.promise
    let pid = 0
    const closing = db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
      pid=rows[0].pid; updateStarted.resolve()
      await tx.compositeAssessment.update({ where: { id }, data: { status: 'ARCHIVED' } })
    }, { timeout: 10000 })
    await updateStarted.promise
    try {
      let blocked = false
      for (let attempt=0;attempt<30;attempt++) {
        const [row] = await db.$queryRaw<Array<{blocked:boolean}>>`SELECT cardinality(pg_blocking_pids(${pid}::int))>0 AS blocked`
        if (row.blocked) { blocked=true;break }
        await new Promise(resolve => setTimeout(resolve,10))
      }
      expect(blocked).toBe(true)
    } finally { release.resolve(); await held; await closing }
    await expect(runtime.startUserAttempt(b,id)).rejects.toMatchObject({ statusCode: 400 })
  })
})
