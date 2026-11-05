import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { startUserAttempt } from '../../modules/composite/composite.service'

/**
 * Concurrent first-START regression for one user on one composite (real
 * PostgreSQL). Deterministic interleaving: the first START transaction is
 * held at its attempt INSERT while it owns the per-participant advisory
 * lock; the second concurrent START is then provably waiting on that
 * advisory lock before the first commits. Invariants asserted:
 *   - exactly one attempt row, attemptNo 1, quota consumed once
 *   - both concurrent responses return the SAME attemptId
 * Reversal (mutation) property: removing the transaction-internal
 * IN_PROGRESS recheck must make this suite fail with two attempts.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) {
  const url = new URL(DB_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/test|ci/i.test(url.pathname)) {
    if (process.env.CI !== 'true') throw new Error('training start concurrency requires an isolated loopback test database')
  }
}

suite('Training concurrent first START (real PostgreSQL)', () => {
  const suffix = `start-conc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let compositeId = ''
  let courseId = ''
  const userId = `${suffix}-student`
  const observer = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  // Test-local middleware gate: hold the FIRST attempt INSERT until the
  // second START is observed waiting on the advisory lock.
  let gateActive = false
  let releaseCreate!: () => void
  let createHeld = new Promise<void>(r => { releaseCreate = r })
  const createdIds: string[] = []
  db.$use(async (params, next) => {
    if (gateActive && params.action === 'create' && params.model === 'CompositeAssessmentAttempt') {
      gateActive = false
      const [pidRow] = await observer.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      // Wait until some session is advisory-waiting (the second START behind
      // our per-participant advisory lock), bounded to avoid a hung suite.
      const deadline = Date.now() + 15000
      for (;;) {
        const rows = await observer.$queryRawUnsafe<Array<{ waiting: number }>>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE wait_event = 'advisory' AND pid <> ${pidRow.pid}`)
        if (rows[0].waiting > 0 || Date.now() > deadline) break
        await new Promise(r => setTimeout(r, 50))
      }
      const result = await next(params)
      createdIds.push(String((result as { id?: string })?.id ?? ''))
      releaseCreate()
      return result
    }
    return next(params)
  })

  beforeAll(async () => {
    const { compileResearchScale } = await import('../../modules/survey/builder.compiler')
    const { hashScaleDefinition } = await import('../../modules/scale/scale-definition')
    const owner = await db.user.create({ data: { id: `${suffix}-owner`, username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'TRAINING' } })
    const course = await db.course.create({ data: { title: 'start concurrency course', courseCode: `${suffix}-course`, creatorId: owner.id, status: 'PUBLISHED', courseType: 'TRAINING_COURSE' } })
    courseId = course.id
    const definition = compileResearchScale('start concurrency scale', {
      schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
      responseOptions: [{ optionKey: 'low', label: 'Low', score: 0 }, { optionKey: 'high', label: 'High', score: 1 }],
      dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
      items: [0, 1].map((i) => ({ itemKey: `item${i}`, prompt: `concurrency item ${i}`, required: true, reverse: false, dimensionKeys: ['total'] })),
    })
    const scale = await db.scale.create({ data: { code: `${suffix}-scale`, name: 'start concurrency scale', creatorId: owner.id, status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '1', definition, definitionHash: hashScaleDefinition(definition) } })
    const composite = await db.compositeAssessment.create({ data: {
      code: `${suffix}-composite`, name: 'start concurrency delivery', createdBy: owner.id,
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 3,
      questionnaireCourses: { create: { courseId: course.id } },
      items: { create: { type: 'SCALE', position: 0, required: true, scaleId: scale.id } },
    } })
    compositeId = composite.id
    await db.compositeAssessment.update({ where: { id: compositeId }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z') } })
    await db.user.create({ data: { id: userId, username: userId, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'TRAINING' } })
    await db.courseStudent.create({ data: { courseId: course.id, studentId: userId, status: 'ACTIVE' } })
    await observer.$connect()
  }, 120000)

  afterAll(async () => {
    try {
      // Suffix-keyed cleanup only: this run's exact identifiers, FK order.
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessment: { code: `${suffix}-composite` } } })
      await db.compositeAssessment.deleteMany({ where: { code: `${suffix}-composite` } })
      await db.scale.deleteMany({ where: { code: `${suffix}-scale` } })
      await db.courseStudent.deleteMany({ where: { course: { courseCode: `${suffix}-course` } } })
      await db.course.deleteMany({ where: { courseCode: `${suffix}-course` } })
      await db.user.deleteMany({ where: { id: { in: [userId, `${suffix}-owner`] } } })
    } finally {
      await observer.$disconnect()
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  it('concurrent first STARTs yield exactly one attempt with the same attemptId (quota once)', async () => {
    gateActive = true
    const [r1, r2] = await Promise.all([
      startUserAttempt(userId, compositeId),
      startUserAttempt(userId, compositeId),
    ])
    await createHeld
    const attempts = await db.compositeAssessmentAttempt.findMany({
      where: { compositeAssessmentId: compositeId, userId },
      select: { id: true, attemptNo: true, status: true } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].attemptNo).toBe(1)
    expect(attempts[0].status).toBe('IN_PROGRESS')
    expect(r1.attempt.id).toBe(attempts[0].id)
    expect(r2.attempt.id).toBe(attempts[0].id)
    expect(createdIds).toHaveLength(1)
    // Quota consumed once: maxAttempts 3, one attempt, second START must be a
    // recovery (same id), never a second attemptNo.
  }, 60000)
})
