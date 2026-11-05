import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { startUserAttempt } from '../../modules/composite/composite.service'

/**
 * c150 acceptance for the bounded START admission on real PostgreSQL:
 * 150 distinct students, a 40-scale/200-item questionnaire, all starting
 * simultaneously. The gate (default TRAINING_START_MAX_CONCURRENT=24,
 * TRAINING_START_MAX_WAIT_MS=10000) queues waiters without database
 * connections; every start must complete and no request may be rejected.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) {
  const url = new URL(DB_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/test|ci/i.test(url.pathname)) {
    if (process.env.CI !== 'true') throw new Error('training start admission requires an isolated loopback test database')
  }
}

suite('bounded Training START admission on real PostgreSQL', () => {
  const suffix = `start-adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let compositeId = ''
  const students: string[] = []

  beforeAll(async () => {
    // Reproduce the exact configuration validated in the c150 experiment:
    // an explicit 24-wide admission window against a 24-wide pool.
    process.env.TRAINING_START_MAX_CONCURRENT = '24'
    process.env.TRAINING_START_MAX_WAIT_MS = '10000'
    const { compileResearchScale } = await import('../../modules/survey/builder.compiler')
    const { hashScaleDefinition } = await import('../../modules/scale/scale-definition')
    const owner = await db.user.create({ data: {
      id: `${suffix}-owner`, username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN',
      role: 'TEACHER', teacherApproved: true, accountDomain: 'TRAINING',
    } })
    const course = await db.course.create({ data: {
      title: 'start admission course', courseCode: `${suffix}-course`, creatorId: owner.id,
      status: 'PUBLISHED', courseType: 'TRAINING_COURSE',
    } })
    for (let s = 0; s < 40; s += 1) {
      const definition = compileResearchScale(`admission scale ${s}`, {
        schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
        responseOptions: [
          { optionKey: 'low', label: 'Low', score: 0 },
          { optionKey: 'mid', label: 'Mid', score: 1 },
          { optionKey: 'high', label: 'High', score: 2 },
        ],
        dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
        items: [0, 1, 2, 3, 4].map((i) => ({ itemKey: `item${i}`, prompt: `admission item ${s}-${i}`, required: true, reverse: false, dimensionKeys: ['total'] })),
      })
      const scale = await db.scale.create({ data: {
        code: `${suffix}-scale-${s}`, name: `admission scale ${s}`, creatorId: owner.id,
        status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '1',
        definition, definitionHash: hashScaleDefinition(definition),
      } })
      if (s === 0) {
        const composite = await db.compositeAssessment.create({ data: {
          code: `${suffix}-composite`, name: 'start admission delivery', createdBy: owner.id,
          productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 3,
          questionnaireCourses: { create: { courseId: course.id } },
          items: { create: { type: 'SCALE', position: s, required: true, scaleId: scale.id } },
        } })
        compositeId = composite.id
      } else {
        await db.compositeAssessmentItem.create({ data: {
          compositeAssessmentId: compositeId, type: 'SCALE', position: s, required: true, scaleId: scale.id,
        } })
      }
    }
    await db.compositeAssessment.update({ where: { id: compositeId }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z') } })
    for (let i = 0; i < 150; i += 1) {
      const id = `${suffix}-student-${i}`
      await db.user.create({ data: { id, username: id, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'TRAINING' } })
      await db.courseStudent.create({ data: { courseId: course.id, studentId: id, status: 'ACTIVE' } })
      students.push(id)
    }
  }, 300000)

  afterAll(async () => {
    await (await import('../../config/queue')).closeQueues(true)
    await db.$disconnect()
  })

  it('admits 150 simultaneous first starts through the bounded gate without a rejection', async () => {
    const results = await Promise.allSettled(students.map(u => startUserAttempt(u, compositeId)))
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
    const rejections = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason as { code?: string; message?: string }))
    expect(rejections, `unexpected rejections: ${JSON.stringify(rejections.slice(0, 3))}`).toHaveLength(0)
    expect(fulfilled).toHaveLength(150)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId } })).toBe(150)
  }, 600000)
})
