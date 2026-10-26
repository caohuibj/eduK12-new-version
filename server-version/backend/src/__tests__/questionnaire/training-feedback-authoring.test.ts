import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const { db, helpers } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(),
  compositeAssessment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  questionnaireCourseDelivery: { deleteMany: vi.fn(), createMany: vi.fn() },
  course: { findMany: vi.fn() }, user: { findUnique: vi.fn() },
}, helpers: { getCompositeForTeacher: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => ({ ...helpers }))
vi.mock('../../modules/composite/final-submit.service', () => ({ ensureCompositeFormSections: vi.fn() }))
import { create, createSchema, editSchema, update, validateTrainingFeedbackAuthoring } from '../../modules/questionnaire-product/service'
const actor = { userId: 'teacher', role: UserRole.TEACHER }
const policy = { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-11-01T10:00:00.000Z' }
const base = () => ({ id: 'publication', name: 'Training', createdBy: actor.userId, productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
  deliveryMode: 'FINAL_ONLY', status: 'DRAFT', revision: 2, questionnaireCourses: [{ courseId: 'course' }], publicEnabled: false,
  trainingFeedbackPolicy: null, trainingFeedbackPolicyHash: null, trainingPersistencePolicy: null, items: [], formSections: [] })
const metadata = () => ({ name: 'Training', courseIds: ['course'], publicEnabled: false, revision: 2 })
let current: any
beforeEach(() => {
  vi.resetAllMocks(); current = base()
  db.$transaction.mockImplementation((run: any) => run(db))
  db.compositeAssessment.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.creationKey ? null : current))
  db.compositeAssessment.create.mockImplementation(({ data }: any) => { current = { ...current, ...data }; return Promise.resolve(current) })
  db.compositeAssessment.update.mockImplementation(({ data }: any) => { for (const [key, value] of Object.entries(data)) current[key] = value === Prisma.DbNull ? null : key === 'revision' ? current.revision + 1 : value; return Promise.resolve(current) })
  db.course.findMany.mockResolvedValue([{ id: 'course', courseType: 'TRAINING_COURSE', isLibrary: false, creatorId: actor.userId }])
  db.$queryRaw.mockResolvedValue([{userId:actor.userId,username:'teacher',role:'TEACHER',accountDomain:'TRAINING',
    platformRole:'STANDARD',tokenVersion:0,isActive:true,isFrozen:false,expiresAt:null,mustChangePassword:false,teacherApproved:true,entryGrants:[]}])
  helpers.getCompositeForTeacher.mockImplementation(() => Promise.resolve(current))
})
describe('Training feedback authoring contract', () => {
  it('defaults newly created eligible Training course questionnaires to immediate', async () => {
    const { revision: _revision, ...input } = metadata()
    await create(actor, { ...input, requestId: '10000000-0000-4000-8000-000000000001', questionnaireType: 'COURSE' })
    expect(current.trainingFeedbackPolicy).toEqual({ schemaVersion: 1, mode: 'IMMEDIATE' })
    expect(current.trainingFeedbackPolicyHash).toBe(canonicalHash(current.trainingFeedbackPolicy))
  })
  it('saves a normalized scheduled policy in the existing locked metadata revision', async () => {
    await update(actor, current.id, { ...metadata(), trainingFeedbackPolicy: { ...policy, releaseAt: '2026-11-01T19:00:00+09:00' } })
    expect(current.trainingFeedbackPolicy).toEqual(policy)
    expect(current.trainingFeedbackPolicyHash).toBe(canonicalHash(policy))
    expect(current.revision).toBe(3)
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), current.id)
  })
  it('preserves historical null on omitted edit and clears draft policy explicitly', async () => {
    await update(actor, current.id, metadata())
    expect(current.trainingFeedbackPolicy).toBeNull()
    expect(current.trainingFeedbackPolicyHash).toBeNull()
    current = { ...base(), trainingFeedbackPolicy: policy, trainingFeedbackPolicyHash: canonicalHash(policy) }
    await update(actor, current.id, { ...metadata(), trainingFeedbackPolicy: null })
    expect(current.trainingFeedbackPolicy).toBeNull()
    expect(current.trainingFeedbackPolicyHash).toBeNull()
  })
  it('preserves configured policy on an unrelated metadata edit', async () => {
    Object.assign(current, { trainingFeedbackPolicy: policy, trainingFeedbackPolicyHash: canonicalHash(policy) })
    await update(actor, current.id, metadata())
    expect(current.trainingFeedbackPolicy).toEqual(policy)
    expect(current.trainingFeedbackPolicyHash).toBe(canonicalHash(policy))
  })
  it.each([{ status: 'PUBLISHED' }, { status: 'ARCHIVED' }, { revision: 1 }, { createdBy: 'other' }])('rejects immutable/stale/unauthorized edits %j', async change => {
    Object.assign(current, change)
    await expect(update(actor, current.id, { ...metadata(), trainingFeedbackPolicy: policy })).rejects.toMatchObject({ statusCode: change.createdBy ? 403 : 409 })
    expect(db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it.each([{}, { schemaVersion: 2, mode: 'IMMEDIATE' }, { schemaVersion: 1, mode: 'MANUAL' },
    { ...policy, releaseAt: '2026-11-01T10:00:00' }, { ...policy, extra: true }, { schemaVersion: 1, mode: 'IMMEDIATE', releaseAt: policy.releaseAt }])('rejects malformed/unsupported policy %j at both metadata schemas', value => {
    expect(editSchema.safeParse({ ...metadata(), trainingFeedbackPolicy: value }).success).toBe(false)
    const { revision: _revision, ...input } = metadata()
    expect(createSchema.safeParse({ ...input, questionnaireType: 'COURSE', requestId: '10000000-0000-4000-8000-000000000001', trainingFeedbackPolicy: value }).success).toBe(false)
  })
  it.each([{ productKind: 'LEGACY_COMPOSITE' }, { questionnaireType: 'GENERAL' }, { deliveryMode: 'LEGACY' },
    { reportPackageKey: 'package' }, { analysisProtocolKey: 'analysis' }, { questionnaireCourses: [] },
    { questionnaireCourses: [{ courseId: 'course' }, { courseId: 'course' }] },
    { publicEnabled: true, questionnaireCourses: [{ courseId: 'a' }, { courseId: 'b' }] }])('rejects explicitly configured nonTraining scope %j', async change => {
    await expect(validateTrainingFeedbackAuthoring(db as any, { ...current, ...change }, policy)).rejects.toMatchObject({ statusCode: 400 })
    expect(db.course.findMany).not.toHaveBeenCalled()
  })
  it('does not opt an ordinary/general/unbound questionnaire into Training by inference', async () => {
    for (const change of [{ questionnaireType: 'GENERAL' }, { questionnaireCourses: [] }])
      expect(await validateTrainingFeedbackAuthoring(db as any, { ...current, ...change }, undefined, true)).toEqual({ trainingFeedbackPolicy: Prisma.DbNull, trainingFeedbackPolicyHash: null })
    db.course.findMany.mockResolvedValue([{ id: 'course', courseType: 'SCHOOL_COURSE', isLibrary: false }])
    expect(await validateTrainingFeedbackAuthoring(db as any, current, undefined, true)).toEqual({ trainingFeedbackPolicy: Prisma.DbNull, trainingFeedbackPolicyHash: null })
    await expect(validateTrainingFeedbackAuthoring(db as any, current, policy)).rejects.toMatchObject({ statusCode: 400 })
  })
  it.each([[], [{ id: 'course', courseType: 'TRAINING_COURSE', isLibrary: true }]].map(value => [value]))('rejects missing or library actual course facts', async facts => {
    db.course.findMany.mockResolvedValue(facts)
    await expect(validateTrainingFeedbackAuthoring(db as any, current, policy)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('requires the actual author to own the Training course unless administrator', async () => {
    db.course.findMany.mockResolvedValue([{ id: 'course', courseType: 'TRAINING_COURSE', isLibrary: false, creatorId: 'other' }])
    await expect(validateTrainingFeedbackAuthoring(db as any, current, policy)).rejects.toMatchObject({ statusCode: 403 })
    db.$queryRaw.mockResolvedValue([{userId:actor.userId,role:'STUDENT',platformRole:'STANDARD',accountDomain:'TRAINING',isActive:true,isFrozen:false,expiresAt:null,
      mustChangePassword:false,entryGrants:[{entry:'TRAINING',version:1}]}])
    expect((await validateTrainingFeedbackAuthoring(db as any, current, policy)).trainingFeedbackPolicyHash).toBe(canonicalHash(policy))
    db.$queryRaw.mockResolvedValue([])
    await expect(validateTrainingFeedbackAuthoring(db as any, current, policy)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows a past preset because completion and generation still gate release', async () => {
    const past = { ...policy, releaseAt: '2020-01-01T00:00:00Z' }
    expect((await validateTrainingFeedbackAuthoring(db as any, current, past)).trainingFeedbackPolicy).toEqual({ ...past, releaseAt: '2020-01-01T00:00:00.000Z' })
  })
})
