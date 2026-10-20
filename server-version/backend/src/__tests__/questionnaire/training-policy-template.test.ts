import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeTrainingTimingPolicy } from '../../modules/assessment-runtime/training-scale-timing'

const { db, helpers } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(), $executeRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  questionnaire: { findUnique: vi.fn() },
  questionnaireCourseDelivery: { deleteMany: vi.fn(), createMany: vi.fn() },
  assessmentCompositionTemplate: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  assessmentManagementEvent: { create: vi.fn() },
  compositeAssessmentItem: { create: vi.fn() }, compositeFormSection: { create: vi.fn() },
  cognitiveTestConfig: { findUnique: vi.fn() }, cognitiveAssignment: { create: vi.fn() },
  course: { findMany: vi.fn() }, user: { findUnique: vi.fn() },
}, helpers: { getCompositeForTeacher: vi.fn(), resolveCompositeSituationalItems: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => ({ ...helpers, compositeSjtGrantScope: (row: unknown) => row }))
vi.mock('../../modules/composite/final-submit.service', () => ({ ensureCompositeFormSections: vi.fn() }))
// Task eligibility is independent of template delivery-policy normalization.
vi.mock('../../modules/cognitive/product-eligibility', () => ({ assertCognitiveProductEligible: vi.fn() }))
import { copy, publish, update, validateTrainingFeedbackAuthoring } from '../../modules/questionnaire-product/service'
import { instantiateTemplate, saveTemplate } from '../../modules/questionnaire-product/workbench'

const actor = { userId: 'teacher', role: UserRole.TEACHER }
const immediate = { schemaVersion: 1, mode: 'IMMEDIATE' }
const scheduled = { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-11-01T10:00:00.000Z' }
const persistence = { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 24 }, localCognitive: { enabled: true, ttlHours: 12 } }
const course = { id: 'training', courseType: 'TRAINING_COURSE', isLibrary: false, creatorId: actor.userId }
const timing = freezeTrainingTimingPolicy([course], false)
const cleared = { trainingFeedbackPolicy: null, trainingFeedbackPolicyHash: null,
  trainingPersistencePolicy: null, trainingPersistencePolicyHash: null, trainingTimingPolicy: null }
let definitions: Map<string, any>, templates: Map<string, any>, assignments: Map<string, any>
const source = () => definitions.get('source')
const savedInput = () => ({ sourceId: 'source', name: 'Reusable definition', requestId: randomUUID() })
const metadata = (row: any, extra: Record<string, unknown> = {}) => ({ name: row.name, revision: row.revision,
  courseIds: row.questionnaireCourses.map((entry: any) => entry.courseId), publicEnabled: false, ...extra })
const applyData = (row: any, data: any) => {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value === Prisma.DbNull || value === Prisma.JsonNull ? null
      : key === 'revision' ? row.revision + 1 : key === 'questionnaireCourses' ? (value as any).create : value
  }
  return row
}

beforeEach(() => {
  vi.resetAllMocks()
  const cognitive = { id: 'cognitive-source', configId: 'config', createdBy: actor.userId,
    title: 'Cognitive task', instruction: 'Scientific instruction', listedStandalone: false, status: 'PUBLISHED',
    profile: 'standard', profileDefinitionVersion: 'v1', maxAttempts: 2,
    resolvedConfigSnapshotEncrypted: 'scientific-stimuli-and-task-timing', resolvedConfigHash: 'config-hash',
    resolvedReportSnapshotEncrypted: 'scientific-scoring-and-report', quotaSourceAssignmentId: null }
  assignments = new Map([[cognitive.id, cognitive]])
  definitions = new Map([['source', {
    id: 'source', name: 'Published Training', createdBy: actor.userId, productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
    deliveryMode: 'FINAL_ONLY', status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z'), revision: 4,
    publicEnabled: true, opensAt: new Date('2026-10-01T00:00:00Z'), expiresAt: new Date('2026-12-01T00:00:00Z'),
    questionnaireCourses: [{ courseId: course.id }], trainingFeedbackPolicy: scheduled, trainingFeedbackPolicyHash: canonicalHash(scheduled),
    trainingPersistencePolicy: persistence, trainingPersistencePolicyHash: canonicalHash(persistence), trainingTimingPolicy: timing,
    formSections: [], items: [
      { id: 'form', compositeAssessmentId: 'source', type: 'FORM', position: 0, required: true, formType: 'single_choice',
        formLabel: 'Scientific item', formOptions: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        formDefinition: null, formPolicy: null, formSectionId: null, cognitiveAssignment: null },
      { id: 'task', compositeAssessmentId: 'source', type: 'COGNITIVE', position: 1, required: true,
        cognitiveAssignmentId: cognitive.id, cognitiveAssignment: cognitive, formDefinition: null, formOptions: null, formPolicy: null },
    ], _count: { attempts: 7, accessTokens: 3 },
  }]])
  templates = new Map()
  // Exercise real service/workbench code, with an in-memory DB transaction adapter.
  // This checks lifecycle contracts, not PostgreSQL locking/concurrency behavior.
  db.$transaction.mockImplementation(async (run: any) => {
    const before = structuredClone({ definitions, templates, assignments })
    try { return await run(db) } catch (error) {
      definitions = before.definitions; templates = before.templates; assignments = before.assignments; throw error
    }
  })
  db.compositeAssessment.findUnique.mockImplementation(async ({ where }: any) => where.id ? definitions.get(where.id) ?? null
    : [...definitions.values()].find(row => row.creationKey === where.creationKey) ?? null)
  db.compositeAssessment.create.mockImplementation(async ({ data }: any) => {
    const row = applyData({ id: randomUUID(), status: 'DRAFT', publishedAt: null, revision: 0, deliveryMode: 'FINAL_ONLY',
      courseId: null, publicEnabled: false, opensAt: null, expiresAt: null, ...cleared,
      questionnaireCourses: [], items: [], formSections: [], _count: { attempts: 0, accessTokens: 0 } }, data)
    definitions.set(row.id, row); return row
  })
  db.compositeAssessment.update.mockImplementation(async ({ where, data }: any) => applyData(definitions.get(where.id), data))
  db.questionnaire.findUnique.mockResolvedValue(null)
  db.course.findMany.mockImplementation(async ({ where }: any) => where.id.in.map((id: string) => ({ ...course, id,
    courseType: id === 'school' ? 'SCHOOL_COURSE' : 'TRAINING_COURSE', creatorId: id === 'foreign' ? 'other' : actor.userId })))
  db.$queryRaw.mockImplementation(async (parts:TemplateStringsArray)=>parts.join('').includes('FROM "users"')
    ? [{userId:actor.userId,username:'teacher',role:'TEACHER',accountDomain:'TRAINING',platformRole:'STANDARD',tokenVersion:0,
      isActive:true,isFrozen:false,expiresAt:null,mustChangePassword:false,teacherApproved:true,entryGrants:[]}]
    : [])
  db.questionnaireCourseDelivery.deleteMany.mockImplementation(async ({ where }: any) => { definitions.get(where.compositeId).questionnaireCourses = []; return { count: 1 } })
  db.questionnaireCourseDelivery.createMany.mockImplementation(async ({ data }: any) => {
    for (const entry of data) definitions.get(entry.compositeId).questionnaireCourses.push({ courseId: entry.courseId })
    return { count: data.length }
  })
  db.assessmentCompositionTemplate.findUnique.mockImplementation(async ({ where }: any) =>
    [...templates.values()].find(row => where.requestKey ? row.requestKey === where.requestKey : row.definitionId === where.definitionId) ?? null)
  db.assessmentCompositionTemplate.findFirst.mockImplementation(async ({ where }: any) =>
    [...templates.values()].find(row => row.id === where.id && row.ownerId === where.ownerId && row.archivedAt === null) ?? null)
  db.assessmentCompositionTemplate.create.mockImplementation(async ({ data }: any) => {
    const row = { ...data, id: randomUUID(), archivedAt: null }; templates.set(row.id, row); return row
  })
  db.cognitiveTestConfig.findUnique.mockResolvedValue({ testType: 'go_no_go' })
  db.cognitiveAssignment.create.mockImplementation(async ({ data }: any) => {
    const row = { ...data, id: randomUUID() }; assignments.set(row.id, row); return row
  })
  db.compositeAssessmentItem.create.mockImplementation(async ({ data }: any) => {
    const row = applyData({}, data)
    row.cognitiveAssignment = row.cognitiveAssignmentId ? assignments.get(row.cognitiveAssignmentId) : null
    definitions.get(row.compositeAssessmentId).items.push(row); return row
  })
  helpers.getCompositeForTeacher.mockImplementation(async (_user: string, _role: string, id: string) => definitions.get(id))
  helpers.resolveCompositeSituationalItems.mockResolvedValue(new Map())
})

describe('Training delivery policies in reusable private templates', () => {
  it.each([immediate, scheduled])('resets only copied delivery settings and instantiates reusable content (%j)', async feedback => {
    Object.assign(source(), { trainingFeedbackPolicy: feedback, trainingFeedbackPolicyHash: canonicalHash(feedback) })
    const original = structuredClone(source()), input = savedInput()
    const saved = await saveTemplate(actor, input)
    const prototype = definitions.get(saved.definitionId)
    expect(prototype).toMatchObject({ ...cleared, status: 'DRAFT', publicEnabled: false, courseId: null, opensAt: null, expiresAt: null,
      questionnaireCourses: [], _count: { attempts: 0, accessTokens: 0 } })
    expect(source()).toEqual(original)
    expect(db.$queryRaw).toHaveBeenCalledWith(expect.anything(), prototype.id)
    expect(db.$queryRaw.mock.calls.some(([parts]:any)=>parts.join('').includes('FOR UPDATE'))).toBe(true)
    expect(db.compositeAssessment.update.mock.calls[0][0].data).toEqual({ name: input.name, courseId: null, publicEnabled: false,
      opensAt: null, expiresAt: null, trainingFeedbackPolicy: Prisma.DbNull, trainingFeedbackPolicyHash: null,
      trainingPersistencePolicy: Prisma.DbNull, trainingPersistencePolicyHash: null, trainingTimingPolicy: Prisma.DbNull })
    expect(await saveTemplate(actor, input)).toEqual(saved)
    const request = { requestId: randomUUID() }
    const instance = await instantiateTemplate(actor, saved.id, request)
    expect(instance).toMatchObject({ ...cleared, status: 'DRAFT', publishedAt: null, questionnaireCourses: [], _count: { attempts: 0, accessTokens: 0 } })
    expect(instance.id).not.toBe(prototype.id)
    expect((await instantiateTemplate(actor, saved.id, request)).id).toBe(instance.id)
    expect(instance.items[0]).toMatchObject({ formLabel: original.items[0].formLabel, formOptions: original.items[0].formOptions, required: true })
    expect(instance.items[1].cognitiveAssignment).toMatchObject({ resolvedConfigSnapshotEncrypted: 'scientific-stimuli-and-task-timing',
      resolvedReportSnapshotEncrypted: 'scientific-scoring-and-report', resolvedConfigHash: 'config-hash', maxAttempts: 2 })
    expect(source()).toEqual(original)
    await expect(publish(actor, prototype.id, { revision: prototype.revision })).rejects.toMatchObject({ statusCode: 409 })
    await expect(publish(actor, instance.id, { revision: instance.revision })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('keeps all valid delivery policies on an ordinary course-bound copy', async () => {
    const original = structuredClone(source())
    const result = await copy(actor, 'source', { requestId: randomUUID() })
    expect(result).toMatchObject({ trainingFeedbackPolicy: scheduled, trainingFeedbackPolicyHash: canonicalHash(scheduled),
      trainingPersistencePolicy: persistence, trainingPersistencePolicyHash: canonicalHash(persistence), trainingTimingPolicy: timing,
      questionnaireCourses: [{ courseId: course.id }] })
    expect(source()).toEqual(original)
  })

  it.each([immediate, scheduled])('requires new delivery choices, then binds validated policies (%j)', async feedback => {
    const saved = await saveTemplate(actor, savedInput())
    let instance = await instantiateTemplate(actor, saved.id, { requestId: randomUUID() })
    instance = await update(actor, instance.id, metadata(instance, { name: 'New delivery' }))
    expect(instance).toMatchObject(cleared)
    // The UI explicitly sends IMMEDIATE on first Training binding, or the
    // teacher's newly selected schedule. Retention/timing are also explicit.
    instance = await update(actor, instance.id, metadata(instance, { courseIds: [course.id], trainingFeedbackPolicy: feedback,
      trainingPersistencePolicy: persistence, trainingTimingEnabled: true }))
    expect(instance).toMatchObject({ trainingFeedbackPolicy: feedback, trainingFeedbackPolicyHash: canonicalHash(feedback),
      trainingPersistencePolicy: persistence, trainingPersistencePolicyHash: canonicalHash(persistence), trainingTimingPolicy: timing })
    expect(await validateTrainingFeedbackAuthoring(db as any, instance, instance.trainingFeedbackPolicy))
      .toMatchObject({ trainingFeedbackPolicyHash: canonicalHash(feedback) })
    expect(definitions.get(saved.definitionId)).toMatchObject(cleared)
  })

  it.each([[], ['school'], ['foreign']].map(courseIds => [courseIds]))('still rejects ineligible ordinary metadata binding %j', async courseIds => {
    const saved = await saveTemplate(actor, savedInput())
    const instance = await instantiateTemplate(actor, saved.id, { requestId: randomUUID() })
    await expect(update(actor, instance.id, metadata(instance, { courseIds, trainingFeedbackPolicy: scheduled })))
      .rejects.toMatchObject({ statusCode: courseIds[0] === 'foreign' ? 403 : 400 })
    expect(definitions.get(instance.id)).toMatchObject({ ...cleared, questionnaireCourses: [] })
  })

  it.each([{ status: 'PUBLISHED' }, { _count: { attempts: 1, accessTokens: 0 } }, { _count: { attempts: 0, accessTokens: 1 } }])
    ('does not reset a reused copy that is published or already used (%j)', async changed => {
      const input = savedInput()
      const reused = await copy(actor, 'source', { requestId: input.requestId })
      Object.assign(definitions.get(reused.id), changed)
      const before = structuredClone(definitions.get(reused.id)), original = structuredClone(source())
      await expect(saveTemplate(actor, input)).rejects.toMatchObject({ statusCode: 409 })
      expect(definitions.get(reused.id)).toEqual(before)
      expect(source()).toEqual(original)
      expect(templates.size).toBe(0)
      expect(db.questionnaireCourseDelivery.deleteMany).not.toHaveBeenCalled()
    })
})
