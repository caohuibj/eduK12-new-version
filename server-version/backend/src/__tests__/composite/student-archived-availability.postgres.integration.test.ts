import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'

const url = integrationDatabaseUrl('TRAINING_ARCHIVE_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
const prefix = 'archive-regression-' + randomUUID()
let db: typeof import('../../config/database')['prisma']
let runtime: typeof import('../../modules/composite/composite.service')
let forms: typeof import('../../modules/composite/final-submit.service')
let tasks: typeof import('../../services/studentTasks')
const teacher = prefix + '-teacher', student = prefix + '-student', other = prefix + '-other'
let courseId: string
let summaryScaleId: string | undefined
const ids: string[] = []

async function fixture(status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT' = 'PUBLISHED') {
  const id = prefix + '-' + ids.length
  ids.push(id)
  // Attach the synthetic definition as a draft before publishing the fixture.
  const row = await db.compositeAssessment.create({ data: {
    id, code: id, name: 'Archive regression', createdBy: teacher, productKind: 'QUESTIONNAIRE',
    questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 3,
    questionnaireCourses: { create: { courseId } },
    formSections: { create: { title: 'Fixture form', position: 0, contextSection: false } },
  }, include: { formSections: true } })
  const section = row.formSections[0]
  await db.compositeAssessmentItem.create({ data: {
    compositeAssessmentId: id, type: 'FORM', position: 0, required: true,
    formType: 'text_input', formLabel: 'Fixture answer', formSectionId: section.id, formSectionPosition: 0,
  } })
  await db.compositeAssessment.update({ where: { id }, data: { status, publishedAt: status === 'DRAFT' ? null : new Date() } })
  return { id, sectionId: section.id }
}

suite('student archived availability (isolated real PostgreSQL)', () => {
  beforeAll(async () => {
    if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('explicit loopback fixture database required')
    process.env.DATABASE_URL = url
    ;({ prisma: db } = await import('../../config/database'))
    runtime = await import('../../modules/composite/composite.service')
    forms = await import('../../modules/composite/final-submit.service')
    tasks = await import('../../services/studentTasks')
    // Non-login synthetic principals, removed together with this fixture.
    await db.user.createMany({ data: [
      { id: teacher, username: teacher, passwordHash: 'fixture-without-login-credentials', role: 'TEACHER' },
      { id: student, username: student, passwordHash: 'fixture-without-login-credentials', role: 'STUDENT' },
      { id: other, username: other, passwordHash: 'fixture-without-login-credentials', role: 'STUDENT' },
    ] })
    const course = await db.course.create({ data: { creatorId: teacher, title: 'Isolated archive regression',
      courseCode: prefix, status: 'PUBLISHED', courseType: 'TRAINING_COURSE',
      students: { create: [{ studentId: student, status: 'ACTIVE' }, { studentId: other, status: 'APPROVED' }] },
    } })
    courseId = course.id
  }, 60000)
  afterAll(async () => {
    if (!db) return
    try {
      await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: ids } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: ids } } })
      if (summaryScaleId) await db.scale.deleteMany({ where: { id: summaryScaleId } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
      await db.user.deleteMany({ where: { id: { in: [teacher, student, other] } } })
    } finally { await db.$disconnect() }
  })

  it('retains the original runner after archive, refuses a fresh start, and preserves completed feedback', async () => {
    const fixtureRow = await fixture()
    const started = await runtime.startUserAttempt(student, fixtureRow.id)
    const attemptId = started.attempt.id
    const originalHash = (await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })).frozenActiveSlotSetHash
    const { archive } = await import('../../modules/questionnaire-product/service')
    await archive({ userId: teacher, role: 'TEACHER' }, fixtureRow.id, { revision: 0 })
    const rows = await runtime.listAvailableForStudent(student)
    expect(rows.find(row => row.id === fixtureRow.id)).toMatchObject({ canContinue: true, canStartNewAttempt: false, attempt: { id: attemptId } })
    const feed = await tasks.listStudentTasks(student, { page: 1, pageSize: 100, courseId })
    expect(feed.list.find(row => row.id === fixtureRow.id)).toMatchObject({ canContinue: true, canStart: false, href: `/student/composite/attempts/${attemptId}` })
    await expect(runtime.startUserAttempt(student, fixtureRow.id)).rejects.toMatchObject({ statusCode: 400 })
    const resumed = await runtime.getAttemptState(attemptId, { userId: student })
    expect(resumed).toMatchObject({ id: attemptId, status: 'IN_PROGRESS' })
    const item = resumed.currentItem as { definitionHash: string }
    const field = await db.compositeAssessmentItem.findFirstOrThrow({ where: { compositeAssessmentId: fixtureRow.id } })
    await forms.submitCompositeFormSectionFinal({ attemptId, sectionId: fixtureRow.sectionId, userId: student,
      submissionId: randomUUID(), attemptEpoch: 1, definitionHash: item.definitionHash, contextSnapshotHash: null,
      answers: [{ formItemId: field.id, value: 'synthetic answer' }],
    })
    await runtime.finalizeCompositeAttemptIfReady(attemptId)
    const [completed] = (await runtime.listAvailableForStudent(student)).filter(row => row.id === fixtureRow.id)
    expect(completed).toMatchObject({ canContinue: false, canStartNewAttempt: false, latestCompletedAttempt: { id: attemptId } })
    expect(await runtime.getReport(attemptId, { userId: student })).toBeTruthy()
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })).frozenActiveSlotSetHash).toBe(originalHash)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: fixtureRow.id } })).toBe(1)
  })

  it('does not expose another student’s archived attempt or an unstarted archived delivery', async () => {
    const row = await fixture()
    await runtime.startUserAttempt(other, row.id)
    await db.compositeAssessment.update({ where: { id: row.id }, data: { status: 'ARCHIVED' } })
    const unstarted = await fixture('ARCHIVED')
    const visible = (await runtime.listAvailableForStudent(student)).map(item => item.id)
    expect(visible).not.toContain(row.id)
    expect(visible).not.toContain(unstarted.id)
  })

  it('does not restore withdrawn membership, draft publications or abandoned-only attempts', async () => {
    const row = await fixture()
    const started = await runtime.startUserAttempt(student, row.id)
    await db.compositeAssessment.update({ where: { id: row.id }, data: { status: 'ARCHIVED' } })
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: student } }, data: { status: 'PENDING' } })
    expect(await runtime.listAvailableForStudent(student)).toEqual([])
    await db.courseStudent.update({ where: { courseId_studentId: { courseId, studentId: student } }, data: { status: 'ACTIVE' } })
    await db.compositeAssessmentAttempt.update({ where: { id: started.attempt.id }, data: { status: 'ABANDONED' } })
    expect((await runtime.listAvailableForStudent(student)).map(item => item.id)).not.toContain(row.id)
    for (const status of ['DRAFT'] as const) {
      const hidden = await fixture(status)
      await db.compositeAssessmentAttempt.create({ data: { compositeAssessmentId: hidden.id, userId: student, participantKey: `user:${student}`, status: 'IN_PROGRESS' } })
      expect((await runtime.listAvailableForStudent(student)).map(item => item.id)).not.toContain(hidden.id)
    }
  })

  it('reads 475 real catalog rows as summaries without truncating cards or changing authority', async () => {
    const sampleIds = Array.from({ length: 475 }, (_, index) => prefix + '-summary-' + index)
    ids.push(...sampleIds)
    summaryScaleId = prefix + '-summary-scale'
    await db.scale.create({ data: { id: summaryScaleId, code: summaryScaleId, name: 'Synthetic catalog scale', creatorId: teacher, status: 'DRAFT' } })
    await db.compositeAssessment.createMany({ data: sampleIds.map((id, index) => ({
      id, code: id, name: 'Synthetic catalog ' + index, description: 'Synthetic course card', instruction: 'Not needed for a course card',
      createdBy: teacher, productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 1,
    })) })
    await db.questionnaireCourseDelivery.createMany({ data: sampleIds.map(compositeId => ({ compositeId, courseId })) })
    const sections = sampleIds.flatMap(id => Array.from({ length: 4 }, (_, n) => ({ id: id + '-section-' + n, compositeAssessmentId: id, title: 'Synthetic section ' + n, position: 8 + n, contextSection: false })))
    await db.compositeFormSection.createMany({ data: sections })
    for (let start = 0; start < sampleIds.length; start += 25) {
      await db.compositeAssessmentItem.createMany({ data: sampleIds.slice(start, start + 25).flatMap(id => [
        ...Array.from({ length: 8 }, (_, n) => ({ compositeAssessmentId: id, type: 'SCALE' as const, position: n, required: true, scaleId: summaryScaleId })),
        ...Array.from({ length: 12 }, (_, n) => ({ compositeAssessmentId: id, type: 'FORM' as const, position: 8 + n, required: true,
          formType: 'text_input', formLabel: 'Synthetic field ' + n, formSectionId: id + '-section-' + Math.floor(n / 3), formSectionPosition: n % 3 })),
      ]) })
    }
    await db.compositeAssessment.updateMany({ where: { id: { in: sampleIds } }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
    const allowed = new Set(sampleIds)
    const full = (await runtime.listAvailableForStudent(student, Date.now(), courseId)).filter(row => allowed.has(row.id))
    const summary = (await runtime.listAvailableForStudent(student, Date.now(), courseId, true)).filter(row => allowed.has(row.id))
    const cards = (rows: any[]) => rows.map(({ instruction, items, units, formSections, ...card }) => card)
    expect(summary).toHaveLength(475)
    expect(cards(summary)).toEqual(cards(full))
    expect(summary.every(row => row.estimatedModules === 12 && row.items.length === 0 && row.units.length === 0 && row.formSections.length === 0)).toBe(true)
    const bytes = (value: unknown) => ({ json: Buffer.byteLength(JSON.stringify(value)), gzip: gzipSync(JSON.stringify(value)).byteLength })
    expect(bytes(summary).gzip).toBeLessThan(bytes(full).gzip)
    process.stdout.write('REAL_PG_SUMMARY_BYTES ' + JSON.stringify({ rows: 475, full: bytes(full), summary: bytes(summary), synthetic: true }) + '\n')
    expect(await runtime.listAvailableForStudent(student, Date.now(), prefix + '-not-enrolled', true)).toEqual([])
  }, 30000)

  it('keeps emergency collection stops independent of publication and rolls back its synthetic fence', async () => {
    const { assertTrainingScaleCollectionAllowed } = await import('../../modules/scale/scale-collection-guard')
    const rollback = new Error('rollback synthetic emergency fence')
    const scaleId = prefix + '-stopped-scale'
    await expect(db.$transaction(async tx => {
      await tx.scale.create({ data: { id: scaleId, code: scaleId, name: 'Synthetic emergency boundary', creatorId: teacher, status: 'PUBLISHED' } })
      await assertTrainingScaleCollectionAllowed(tx, [scaleId])
      await tx.scaleLibraryEmergencyStop.create({ data: {
        targetKind: 'TRAINING_SCALE', targetId: scaleId, actorId: teacher, reason: 'Synthetic rollback-only regression fixture',
      } })
      await expect(assertTrainingScaleCollectionAllowed(tx, [scaleId])).rejects.toThrow('已紧急停用')
      expect((await tx.scale.findUniqueOrThrow({ where: { id: scaleId } })).status).toBe('PUBLISHED')
      throw rollback
    })).rejects.toBe(rollback)
    expect(await db.scaleLibraryEmergencyStop.count({ where: { targetId: scaleId } })).toBe(0)
  })
})
