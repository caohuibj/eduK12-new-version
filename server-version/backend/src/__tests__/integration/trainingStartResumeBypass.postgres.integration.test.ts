import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { startUserAttempt } from '../../modules/composite/composite.service'

/**
 * Resume of an IN_PROGRESS attempt must not queue behind new starts in the
 * bounded admission gate. Counterexample: a one-wide gate is occupied by a
 * new START blocked on the composite row; the resume must still return the
 * same attempt immediately, and the live eligibility checks still apply.
 *
 * Blocking is observed deterministically through pg_stat_activity /
 * pg_blocking_pids(): every orchestrating transaction publishes its backend
 * PID, and the test waits until some session is actually blocked by that
 * PID instead of guessing readiness from a fixed sleep.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

/** Wait until at least one session is blocked by the holder's backend PID on
 * a query matching the expected shape (the blocked SQL must be the target
 * statement, so unrelated parallel database activity cannot produce a false
 * positive). Returns the blocked session PID for correlation. */
const waitForBlockedBy = async (holderPid: number, timeoutMs: number, label: string,
  expectedQueryPattern: RegExp): Promise<number> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await db.$queryRawUnsafe<Array<{ pid: number; query: string }>>(
      `SELECT s.pid, left(s.query, 300) AS query
         FROM pg_stat_activity s
        WHERE s.wait_event_type = 'Lock' AND ${holderPid} = ANY(pg_blocking_pids(s.pid))`,
    )
    const matched = rows.filter((row) => expectedQueryPattern.test(row.query))
    if (matched.length) return matched[0].pid
    if (Date.now() > deadline) {
      throw new Error(`[${label}] no session observed blocked by pid ${holderPid} on ${expectedQueryPattern} within ${timeoutMs}ms; seen: ${JSON.stringify(rows)}`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/** Races the holder-ready signal against the blocker's failure and a bounded
 * timeout: if the blocker dies before signalling, the error surfaces here
 * instead of the suite hanging until the framework timeout. */
const waitForHolderReady = async (isLocked: Promise<void>, blocker: Promise<unknown>, timeoutMs: number, label: string): Promise<void> => {
  const blockerFailure = blocker.then(() => { throw new Error(`[${label}] blocker transaction ended before signalling the held lock`) },
    (e: unknown) => { throw new Error(`[${label}] blocker transaction failed: ${String((e as Error)?.message ?? e)}`) })
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`[${label}] holder never signalled within ${timeoutMs}ms`)), timeoutMs))
  await Promise.race([isLocked, blockerFailure, timeout])
}

suite('Training START resume bypasses the admission gate (real PostgreSQL)', () => {
  const suffix = `resume-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let compositeId = ''
  let courseId = ''
  let scaleId = ''
  const [a, b] = [`${suffix}-a`, `${suffix}-b`]
  const createdUserIds: string[] = []
  const startEnvNames = ['TRAINING_START_MAX_CONCURRENT', 'TRAINING_START_MAX_WAIT_MS'] as const
  const originalStartEnv: Record<string, string | undefined> = {}

  beforeAll(async () => {
    for (const name of startEnvNames) originalStartEnv[name] = process.env[name]
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
    scaleId = scale.id
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
    try {
      // FK-order cleanup keyed on the run suffix so an early-failure path
      // (or a previous aborted run of the same suite) still cleans up fully:
      // attempts → composite (cascades items & questionnaireCourses) →
      // courseStudents → scale (Restrict via items, so after the composite)
      // → course → users.
      // Suffix-precise cleanup: only THIS run's exact identifiers are
      // deleted; cross-run data is never touched here.
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: compositeId } })
      await db.compositeAssessment.deleteMany({ where: { id: compositeId } })
      await db.courseStudent.deleteMany({ where: { courseId } })
      await db.scale.deleteMany({ where: { id: scaleId } })
      await db.course.deleteMany({ where: { id: courseId } })
      await db.user.deleteMany({ where: { id: { in: [a, b, `${suffix}-owner`] } } })
    } finally {
      for (const name of startEnvNames) {
        if (originalStartEnv[name] === undefined) delete process.env[name]
        else process.env[name] = originalStartEnv[name]
      }
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  it('returns the same attempt while the gate is occupied, without a second attempt or quota use', async () => {
    const first = await startUserAttempt(a, compositeId)
    let release!: () => void
    let bStart: Promise<unknown> | undefined
    let blockerPid = 0
    let blockerError: unknown = undefined
    const held = new Promise<void>(r => { release = r })
    // FOR UPDATE returning is the deterministic held-the-row-lock signal.
    let locked!: () => void
    const isLocked = new Promise<void>(r => { locked = r })
    const blocker = db.$transaction(async (tx) => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      blockerPid = pidRow.pid
      await tx.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR UPDATE', compositeId)
      locked()
      await held
    }, { maxWait: 10000, timeout: 60000 })
    // A gate timeout rejection must not surface as an unhandled rejection.
    blocker.catch(e => { blockerError = e })
    try {
      await waitForHolderReady(isLocked, blocker, 15000, 'case 1 blocker')
      bStart = startUserAttempt(b, compositeId)
      let bDone = false
      bStart.finally(() => { bDone = true }).catch(() => {})
      if (blockerError !== undefined) throw blockerError
      // Deterministic observation: the new START is truly queued behind the
      // composite row lock held by the blocker transaction, on the composite
      // lock statement itself.
      await waitForBlockedBy(blockerPid, 20000, 'new START behind the composite row lock',
        /composite_assessments[\s\S]*FOR (SHARE|UPDATE)/i)
      const t0 = Date.now()
      const resumed = await Promise.race([
        startUserAttempt(a, compositeId),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('resume queued behind the gate')), 5000)),
      ])
      const elapsed = Date.now() - t0
      expect(bDone).toBe(false)
      expect(elapsed).toBeLessThan(5000)
      expect(resumed).toEqual(first)
      expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId, userId: a } })).toBe(1)
    } finally {
      release()
      const settled = await Promise.allSettled([blocker, ...(bStart ? [bStart] : [])])
      // Cleanup must not mask the original assertion error: only a cleanup
      // failure on an otherwise-passing test surfaces here.
      const firstRejection = settled.find(s => s.status === 'rejected')
      if (firstRejection && !bStart) throw firstRejection.reason
    }
  }, 60000)

  it('does not recover an attempt whose retirement transaction is in flight', async () => {
    const first = await startUserAttempt(a, compositeId)
    let release!: () => void
    let nextStart: Promise<unknown> | undefined
    let retiringPid = 0
    const held = new Promise<void>(resolve => { release = resolve })
    // The UPDATE returning is the deterministic held-the-row-lock signal.
    let marked!: () => void
    const updated = new Promise<void>(resolve => { marked = resolve })
    const retiring = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      retiringPid = pidRow.pid
      await tx.compositeAssessmentAttempt.update({
        where: { id: first.attempt.id },
        data: { status: 'ABANDONED', completedAt: new Date() },
      })
      marked()
      await held
    }, { maxWait: 10000, timeout: 60000 })
    let blockerError: unknown = undefined
    retiring.catch(e => { blockerError = e })
    try {
      await waitForHolderReady(updated, retiring, 15000, 'case 2 blocker')
      if (blockerError !== undefined) throw blockerError
      nextStart = startUserAttempt(a, compositeId)
      // Deterministic observation: the resume fast read (FOR SHARE) is truly
      // blocked by the retiring transaction's row lock on the attempt row.
      await waitForBlockedBy(retiringPid, 20000, 'resume FOR SHARE behind the retiring row lock',
        /composite_assessment_attempts[\s\S]*FOR SHARE/i)
      release()
      await retiring
      const next = await nextStart
      expect(next.attempt.status).toBe('IN_PROGRESS')
      expect(next.attempt.id).not.toBe(first.attempt.id)
      expect(await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: first.attempt.id } }))
        .toMatchObject({ status: 'ABANDONED' })
    } finally {
      release()
      await Promise.allSettled([retiring, ...(nextStart ? [nextStart] : [])])
    }
  }, 60000)

  it('still applies the live eligibility checks to a resume', async () => {
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: a } }, data: { status: 'PENDING' } })
    await expect(startUserAttempt(a, compositeId)).rejects.toMatchObject({ message: '不是问卷投放课程的有效学生' })
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: a } }, data: { status: 'ACTIVE' } })
    await db.compositeAssessment.update({ where: { id: compositeId }, data: { status: 'ARCHIVED' } })
    await expect(startUserAttempt(a, compositeId)).rejects.toMatchObject({ message: '综合测评尚未发布' })
  }, 60000)
})
