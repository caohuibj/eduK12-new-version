import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { startUserAttempt } from '../../modules/composite/composite.service'

/**
 * Resume of an IN_PROGRESS attempt must not queue behind new starts in the
 * bounded admission gate. Counterexample: a one-wide gate is occupied by a
 * new START blocked on the composite row; the resume must still return the
 * same attempt immediately, and the live eligibility checks still apply.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) {
  const url = new URL(DB_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/test|ci/i.test(url.pathname)) {
    if (process.env.CI !== 'true') throw new Error('training start resume requires an isolated loopback test database')
  }
}

suite('Training START resume bypasses the admission gate (real PostgreSQL)', () => {
  const suffix = `resume-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let compositeId = ''
  let courseId = ''
  const [a, b] = [`${suffix}-a`, `${suffix}-b`]

  beforeAll(async () => {
    process.env.TRAINING_START_MAX_CONCURRENT = '1'
    process.env.TRAINING_START_MAX_WAIT_MS = '20000'
    const { compileResearchScale } = await import('../../modules/survey/builder.compiler')
    const { hashScaleDefinition } = await import('../../modules/scale/scale-definition')
    const owner = await db.user.create({ data: { id: `${suffix}-owner`, username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'TRAINING' } })
    const course = await db.course.create({ data: { title: 'resume course', courseCode: `${suffix}-course`, creatorId: owner.id, status: 'PUBLISHED', courseType: 'TRAINING_COURSE' } })
    courseId = course.id
    const definition = compileResearchScale('resume scale', {
      schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
      responseOptions: [{ optionKey: 'low', label: 'Low', score: 0 }, { optionKey: 'high', label: 'High', score: 1 }],
      dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
      items: [0, 1].map((i) => ({ itemKey: `item${i}`, prompt: `resume item ${i}`, required: true, reverse: false, dimensionKeys: ['total'] })),
    })
    const scale = await db.scale.create({ data: { code: `${suffix}-scale`, name: 'resume scale', creatorId: owner.id, status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '1', definition, definitionHash: hashScaleDefinition(definition) } })
    const composite = await db.compositeAssessment.create({ data: {
      code: `${suffix}-composite`, name: 'resume delivery', createdBy: owner.id,
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 3,
      questionnaireCourses: { create: { courseId: course.id } },
      items: { create: { type: 'SCALE', position: 0, required: true, scaleId: scale.id } },
    } })
    compositeId = composite.id
    await db.compositeAssessment.update({ where: { id: compositeId }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z') } })
    for (const id of [a, b]) {
      await db.user.create({ data: { id, username: id, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'TRAINING' } })
      await db.courseStudent.create({ data: { courseId: course.id, studentId: id, status: 'ACTIVE' } })
    }
  }, 120000)

  afterAll(async () => {
    await (await import('../../config/queue')).closeQueues(true)
    await db.$disconnect()
  })

  it('returns the same attempt while the gate is occupied, without a second attempt or quota use', async () => {
    const first = await startUserAttempt(a, compositeId)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    let locked!: () => void
    const isLocked = new Promise<void>(r => { locked = r })
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR UPDATE', compositeId)
      locked(); await held
    }, { maxWait: 10000, timeout: 60000 })
    await isLocked
    let bDone = false
    const bStart = startUserAttempt(b, compositeId).finally(() => { bDone = true })
    await new Promise(r => setTimeout(r, 300))
    const t0 = Date.now()
    const resumed = await Promise.race([
      startUserAttempt(a, compositeId),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('resume queued behind the gate')), 5000)),
    ])
    const elapsed = Date.now() - t0
    expect(bDone).toBe(false)
    release(); await blocker; await bStart
    expect(elapsed).toBeLessThan(5000)
    expect(resumed).toEqual(first)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId, userId: a } })).toBe(1)
  }, 60000)

  it('still applies the live eligibility checks to a resume', async () => {
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: a } }, data: { status: 'PENDING' } })
    await expect(startUserAttempt(a, compositeId)).rejects.toMatchObject({ message: '不是问卷投放课程的有效学生' })
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: a } }, data: { status: 'ACTIVE' } })
    await db.compositeAssessment.update({ where: { id: compositeId }, data: { status: 'ARCHIVED' } })
    await expect(startUserAttempt(a, compositeId)).rejects.toMatchObject({ message: '综合测评尚未发布' })
  }, 60000)
})
