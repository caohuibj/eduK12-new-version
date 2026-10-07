import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
const suffix = randomUUID()
const actor = { userId: 'workbench-' + suffix, role: UserRole.TEACHER }
const other = { userId: 'workbench-other-' + suffix, role: UserRole.TEACHER }
let db: PrismaClient, courseId: string
let products: typeof import('../../modules/questionnaire-product/service')
let workbench: typeof import('../../modules/questionnaire-product/workbench')
let summary: typeof import('../../services/classroomEndSummary')

suite('R5 private templates, course overview and frozen classroom summaries', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url } } })
    products = await import('../../modules/questionnaire-product/service')
    workbench = await import('../../modules/questionnaire-product/workbench')
    summary = await import('../../services/classroomEndSummary')
    await db.user.createMany({ data: [actor, other].map(({ userId, role }) => ({ id: userId, username: userId, passwordHash: 'isolated-fixture', role })) })
    courseId = (await db.course.create({ data: { creatorId: actor.userId, title: 'Workbench fixture', courseCode: suffix } })).id
  })
  afterAll(async () => {
    if (!db) return
    await db.assessmentCompositionTemplate.deleteMany({ where: { ownerId: { in: [actor.userId, other.userId] } } })
    await db.compositeAssessment.deleteMany({ where: { createdBy: { in: [actor.userId, other.userId] } } })
    await db.course.deleteMany({ where: { creatorId: actor.userId } })
    await db.user.deleteMany({ where: { id: { in: [actor.userId, other.userId] } } })
    await db.$disconnect()
  })
  const draft = () => products.create(actor, { requestId: randomUUID(), name: 'Template source', questionnaireType: 'COURSE', courseIds: [courseId], publicEnabled: true, expiresAt: new Date(Date.now() + 86400000).toISOString() })

  it('copies definitions once under concurrent retries and removes every delivery capability', async () => {
    let source = await draft()
    source = await products.addItem(actor, source.id, { revision: source.revision, item: { type: 'FORM', formType: 'text_input', formLabel: 'Learning goal', required: true } })
    const input = { sourceId: source.id, name: 'Private reusable template', requestId: randomUUID() }
    const [a, b] = await Promise.all([workbench.saveTemplate(actor, input), workbench.saveTemplate(actor, input)])
    expect(a.id).toBe(b.id)
    await expect(workbench.saveTemplate(actor, { ...input, name: 'Changed retry' })).rejects.toMatchObject({ statusCode: 409 })
    const saved = await products.detail(actor, a.definitionId)
    expect(saved).toMatchObject({ status: 'DRAFT', publicEnabled: false, courseId: null, expiresAt: null, opensAt: null })
    expect(saved.questionnaireCourses).toHaveLength(0)
    expect(saved.items).toHaveLength(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: saved.id } })).toBe(0)
    expect(await db.compositeAssessmentAccessToken.count({ where: { compositeAssessmentId: saved.id } })).toBe(0)
    expect((await products.list(actor)).list.some((row: any) => row.id === saved.id)).toBe(false)
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: a.id, action: 'TEMPLATE_SAVE' } })).toBe(1)
    const request = { requestId: randomUUID() }
    const [first, retry] = await Promise.all([workbench.instantiateTemplate(actor, a.id, request), workbench.instantiateTemplate(actor, a.id, request)])
    expect(first.id).toBe(retry.id)
    expect(first.id).not.toBe(a.definitionId)
    expect(first.items).toHaveLength(1)
    expect(first.questionnaireCourses).toHaveLength(0)
    await expect(products.publish(actor, first.id, { revision: first.revision })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('keeps templates and management audit private, including archive retries', async () => {
    const source = await draft()
    const saved = await workbench.saveTemplate(actor, { sourceId: source.id, name: 'Private', requestId: randomUUID() })
    expect((await workbench.templates(other, {})).list).toHaveLength(0)
    expect((await workbench.managementEvents(other, {})).list).toHaveLength(0)
    await expect(workbench.instantiateTemplate(other, saved.id, { requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 })
    await expect(workbench.archiveTemplate(other, saved.id)).rejects.toMatchObject({ statusCode: 404 })
    await workbench.archiveTemplate(actor, saved.id)
    await workbench.archiveTemplate(actor, saved.id)
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: saved.id, action: 'TEMPLATE_ARCHIVE' } })).toBe(1)
    await expect(workbench.instantiateTemplate(actor, saved.id, { requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('shows only managed course deliveries and rejects a foreign course or student', async () => {
    const source = await draft()
    const saved = await workbench.saveTemplate(actor, { sourceId: source.id, name: 'Hidden prototype', requestId: randomUUID() })
    const result = await workbench.courseOverview(actor, courseId, {})
    expect(result.list.some(row => row.id === source.id)).toBe(true)
    expect(result.list.some(row => row.id === saved.definitionId)).toBe(false)
    expect(result).not.toHaveProperty('scores')
    await expect(workbench.courseOverview(other, courseId, {})).rejects.toMatchObject({ statusCode: 404 })
    await expect(workbench.courseOverview({ ...actor, role: UserRole.STUDENT }, courseId, {})).rejects.toMatchObject({ statusCode: 403 })
    await expect(workbench.templates(actor, { page: 0 })).rejects.toBeDefined()
    await expect(workbench.templates(actor, { pageSize: 999 })).rejects.toBeDefined()
  })

  it('archives once with an audit record while retaining definition and history', async () => {
    const source = await draft()
    const first = await products.archive(actor, source.id, { revision: source.revision })
    const retry = await products.archive(actor, first.id, { revision: first.revision })
    expect(retry.revision).toBe(first.revision)
    const staleRetry = await products.archive(actor, first.id, { revision: source.revision })
    expect(staleRetry.revision).toBe(first.revision)
    await expect(products.archive(other, first.id, { revision: first.revision })).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: source.id, action: 'ASSESSMENT_ARCHIVE' } })).toBe(1)
    expect(await db.compositeAssessment.findUnique({ where: { id: source.id } })).not.toBeNull()
  })

  it('freezes the ended classroom, question versions and cutoff without raw answers or identities', async () => {
    const endedAt = new Date()
    const classroom = await db.classroom.create({ data: { creatorId: actor.userId, courseId, name: 'Ended fixture', code: 'summary-' + suffix, status: 'ENDED', endedAt } })
    const question = await db.classroomQuestion.create({ data: { classroomId: classroom.id, questionIndex: 1, questionContent: { title: 'Reflection', type: 'text_input' }, endedAt } })
    await db.classroomQuestion.create({ data: { classroomId: classroom.id, questionIndex: 2, questionContent: { type: 'text_input' }, endedAt } })
    const session = await db.classroomSession.create({ data: { classroomId: classroom.id, studentId: 'PRIVATE_STUDENT', joinedAt: new Date(endedAt.getTime() - 1000) } })
    await db.classroomAnswer.create({ data: { classroomId: classroom.id, questionId: question.id, sessionId: session.id, submittedAt: new Date(endedAt.getTime() - 500), answer: { text: 'SECRET_RAW_ANSWER' } } })
    expect(await summary.classroomEndSummary(actor, classroom.id)).toBeNull()
    const [first, retry] = await Promise.all([summary.classroomEndSummary(actor, classroom.id, true), summary.classroomEndSummary(actor, classroom.id, true)])
    expect(first.contentHash).toBe(retry.contentHash)
    expect(first.payload).toMatchObject({ endedAt: endedAt.toISOString(), endTimeStatus: 'recorded', participants: 1, questions: [{ ordinal: 1, answered: 1, questionVersion: expect.stringMatching(/^[a-f0-9]{64}$/) }, { ordinal: 2, title: '第 2 题', answered: 0 }] })
    expect(JSON.stringify(first)).not.toContain('PRIVATE_STUDENT')
    expect(JSON.stringify(first)).not.toContain('SECRET_RAW_ANSWER')
    expect(JSON.stringify(first)).not.toContain('correctRate')
    await db.classroomQuestion.update({ where: { id: question.id }, data: { questionContent: { title: 'Later mutation' } } })
    expect((await summary.classroomEndSummary(actor, classroom.id))?.payload).toEqual(first.payload)
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: classroom.id, action: 'CLASSROOM_SUMMARY' } })).toBe(1)
    await expect(summary.classroomEndSummary(other, classroom.id)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses to freeze an active classroom', async () => {
    const classroom = await db.classroom.create({ data: { creatorId: actor.userId, courseId, name: 'Active fixture', code: 'active-' + suffix, status: 'ACTIVE' } })
    await expect(summary.classroomEndSummary(actor, classroom.id, true)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.classroomEndSummary.findUnique({ where: { classroomId: classroom.id } })).toBeNull()
  })

  it('filters all authorized objects with literal search text and keeps count and pagination aligned', async () => {
    const marker = 'dotqa_100%_' + suffix
    const source = await products.create(actor, { requestId: randomUUID(), name: marker, questionnaireType: 'COURSE', courseIds: [courseId] })
    const result = await products.list(actor, 1, 1, { search: marker, status: 'DRAFT', since: '2020-01-01' })
    expect(result.total).toBe(1)
    expect(result.list[0].id).toBe(source.id)
    expect((await products.list(other, 1, 25, { search: marker })).total).toBe(0)
    expect((await products.list(actor, 2, 1, { search: marker })).list).toEqual([])
    await expect(products.list(actor, 1, 25, { since: '2026-02-31' })).rejects.toBeDefined()
  })

  it('cannot repurpose an acknowledged published copy or publish a private template prototype', async () => {
    let source = await draft()
    source = await products.addItem(actor, source.id, { revision: source.revision, item: { type: 'FORM', formType: 'text_input', formLabel: 'Fixture', required: true } })
    const requestId = randomUUID()
    let copied = await products.copy(actor, source.id, { requestId })
    copied = await products.publish(actor, copied.id, { revision: copied.revision })
    await expect(workbench.saveTemplate(actor, { sourceId: source.id, name: 'Collision', requestId })).rejects.toMatchObject({ statusCode: 409 })
    expect((await products.detail(actor, copied.id)).questionnaireCourses).toEqual(copied.questionnaireCourses)
    const template = await workbench.saveTemplate(actor, { sourceId: source.id, name: 'Private', requestId: randomUUID() })
    const definition = await products.detail(actor, template.definitionId)
    await expect(products.publish(actor, definition.id, { revision: definition.revision })).rejects.toMatchObject({ statusCode: 409 })
  })
})
