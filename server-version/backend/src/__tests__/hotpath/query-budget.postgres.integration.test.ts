import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { resetRuntimeObservabilityForTests } from '../../services/runtimeObservability'
import { freezeCompositeActiveSlotSet, freezeQuestionnaireActiveSlotSet, formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'
import { encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { mapCompositeSection } from '../../modules/composite/final-submit.service'
import { mapQuestionnaireSection } from '../../modules/assessment-runtime/form-section-definition'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { tokenService } from '../../services/tokenService'

/**
 * Work C — Runtime Hot-Path Convergence: Query Budget measurement contracts.
 *
 * The suite is opt-in and runs against a dedicated PostgreSQL database. It
 * observes every Prisma call through a $use middleware and asserts that the
 * hot paths touched by Work C stay within a fixed query budget:
 *
 *   1. Write-time invariant — a newly-created form item (course/general) is
 *      immediately assigned to a FormSection, so GET/start never lazily repair.
 *   2. Write-time invariant — a copied questionnaire sections its items at
 *      copy time, so the copy is never served with orphans.
 *   3. Read-path budget — GET materializes sections exactly once and reuses
 *      the same rows for both list projections (no redundant ensure/repair).
 *   4. Read-path budget — listQuestionnaireContentUnits with pre-materialized
 *      sections performs zero redundant ensure queries.
 *   5. Composite write-time invariant — a new FORM module is immediately
 *      assigned to a CompositeFormSection.
 *   6. Unified attempt-state — the parent composite attempt is read exactly
 *      once and shared by routing, projection and admission.
 *   7. Public read path — getQuestionnaireByToken performs zero redundant
 *      ensure and zero materialization writes.
 *   8. Load-once admission — scale/cognitive delivery reads the child once
 *      and the composite parent once; when the unified attempt-state reader
 *      passes in both the parent and the already-loaded child, neither is
 *      re-read.
 */
const DB_URL = integrationDatabaseUrl(
  'WORKC_QUERY_BUDGET_DATABASE_URL',
  'PR38_INTEGRATION_DATABASE_URL',
  'PR34_INTEGRATION_DATABASE_URL',
)
const suite = DB_URL ? describe : describe.skip

type CapturedResponse = {
  statusCode: number
  body: Record<string, any> | undefined
}

type Handler = (req: any, res: any) => Promise<unknown>

type ObservedPrismaCall = {
  model?: string
  action: string
}

let prisma: PrismaClient
let questionnaireController: typeof import('../../controllers/questionnaireController')['questionnaireController']
let generalQuestionnaireController: typeof import('../../controllers/generalQuestionnaireController')['generalQuestionnaireController']
let publicQuestionnaireController: typeof import('../../controllers/publicQuestionnaireController')['publicQuestionnaireController']
let compositeService: typeof import('../../modules/composite/composite.service')
let formSectionService: typeof import('../../services/questionnaire-form-section.service')
let ensureScaleAdmissionAtDelivery: typeof import('../../modules/scale/scale-admission.service')['ensureScaleAdmissionAtDelivery']
let ensureCognitiveAdmissionAtDelivery: typeof import('../../modules/cognitive/cognitive-admission.service')['ensureCognitiveAdmissionAtDelivery']
let ensureQuestionnaireFormAdmissionAtDelivery: typeof import('../../modules/assessment-runtime/form-admission.service')['ensureQuestionnaireFormAdmissionAtDelivery']
let UNIFIED_SCALE_CHILD_ADMISSION_SELECT: typeof import('../../modules/scale/scale-admission.service')['UNIFIED_SCALE_CHILD_ADMISSION_SELECT']
let UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT: typeof import('../../modules/cognitive/cognitive-admission.service')['UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT']
let createUnifiedCognitiveSessionConfigSnapshot: typeof import('../../modules/cognitive/session.service')['createUnifiedCognitiveSessionConfigSnapshot']
let teacherId = ''
let questionnaireId = ''
let copiedQuestionnaireId = ''
let compositeId = ''
let observedPrismaCalls: ObservedPrismaCall[] = []
const extraQuestionnaireIds: string[] = []

const invoke = async (
  handler: Handler,
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user: Record<string, unknown> = { userId: teacherId, role: 'TEACHER' },
  headers: Record<string, string> = {},
): Promise<CapturedResponse> => {
  const response: CapturedResponse = { statusCode: 200, body: undefined }
  const res = {
    status: (statusCode: number) => {
      response.statusCode = statusCode
      return res
    },
    json: (bodyValue: Record<string, any>) => {
      response.body = bodyValue
      return bodyValue
    },
  }
  await handler({ params, body, user, headers }, res)
  return response
}

const runObserved = async <T>(operation: () => Promise<T>): Promise<{ value: T; calls: ObservedPrismaCall[] }> => {
  observedPrismaCalls = []
  const value = await operation()
  return { value, calls: [...observedPrismaCalls] }
}

const callCount = (calls: ObservedPrismaCall[], model: string, action: string): number => (
  calls.filter((call) => call.model === model && call.action === action).length
)

const anyCall = (calls: ObservedPrismaCall[], model: string, action: string): boolean => (
  callCount(calls, model, action) > 0
)

suite('Work C Query Budget (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    questionnaireController = (await import('../../controllers/questionnaireController')).questionnaireController
    generalQuestionnaireController = (await import('../../controllers/generalQuestionnaireController')).generalQuestionnaireController
    publicQuestionnaireController = (await import('../../controllers/publicQuestionnaireController')).publicQuestionnaireController
    compositeService = await import('../../modules/composite/composite.service')
    formSectionService = await import('../../services/questionnaire-form-section.service')
    ensureScaleAdmissionAtDelivery = (await import('../../modules/scale/scale-admission.service')).ensureScaleAdmissionAtDelivery
    ensureCognitiveAdmissionAtDelivery = (await import('../../modules/cognitive/cognitive-admission.service')).ensureCognitiveAdmissionAtDelivery
    ensureQuestionnaireFormAdmissionAtDelivery = (await import('../../modules/assessment-runtime/form-admission.service')).ensureQuestionnaireFormAdmissionAtDelivery
    UNIFIED_SCALE_CHILD_ADMISSION_SELECT = (await import('../../modules/scale/scale-admission.service')).UNIFIED_SCALE_CHILD_ADMISSION_SELECT
    UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT = (await import('../../modules/cognitive/cognitive-admission.service')).UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT
    createUnifiedCognitiveSessionConfigSnapshot = (await import('../../modules/cognitive/session.service')).createUnifiedCognitiveSessionConfigSnapshot

    prisma.$use(async (params, next) => {
      try {
        return await next(params)
      } finally {
        observedPrismaCalls.push({ model: params.model, action: params.action })
      }
    })

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const teacher = await prisma.user.create({
      data: { username: `workc-qb-teacher-${suffix}`, passwordHash: 'test-only', role: 'TEACHER' },
    })
    teacherId = teacher.id

    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `WORKC-QB-${suffix}`,
        name: 'Work C query budget fixture',
        creatorId: teacherId,
        type: 'COURSE',
        status: 'DRAFT',
        visibility: 'COURSE',
      },
    })
    questionnaireId = questionnaire.id
  })

  afterAll(async () => {
    try {
      if (copiedQuestionnaireId) {
        await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: copiedQuestionnaireId } })
        await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: copiedQuestionnaireId } })
        await prisma.questionnaire.delete({ where: { id: copiedQuestionnaireId } })
      }
      if (questionnaireId) {
        await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: questionnaireId } })
        await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: questionnaireId } })
        await prisma.questionnaire.delete({ where: { id: questionnaireId } })
      }
      if (compositeId) {
        await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: compositeId } })
        await prisma.compositeFormSection.deleteMany({ where: { compositeAssessmentId: compositeId } })
        await prisma.compositeAssessment.delete({ where: { id: compositeId } })
      }
      for (const id of extraQuestionnaireIds) {
        await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: id } })
        await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: id } })
        await prisma.questionnaireAccessToken.deleteMany({ where: { questionnaireId: id } })
        await prisma.questionnaire.deleteMany({ where: { id } })
      }
      if (teacherId) await prisma.user.delete({ where: { id: teacherId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('sections a newly-created form item at write time (no orphan)', async () => {
    resetRuntimeObservabilityForTests()
    const response = await invoke(
      questionnaireController.addFormItem,
      { id: questionnaireId },
      { type: 'text_input', label: 'Work C budget item', required: true, position: 0 },
    )
    expect(response.statusCode).toBe(200)

    const items = await prisma.questionnaireFormItem.findMany({
      where: { questionnaireId },
      select: { id: true, sectionId: true },
    })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => Boolean(item.sectionId))).toBe(true)

    const sections = await prisma.questionnaireFormSection.findMany({ where: { questionnaireId } })
    expect(sections.length).toBeGreaterThan(0)
  })

  it('sections copied form items at write time (copy is never served with orphans)', async () => {
    resetRuntimeObservabilityForTests()
    const response = await invoke(
      questionnaireController.duplicate,
      { id: questionnaireId },
      {},
    )
    expect(response.statusCode).toBe(200)
    copiedQuestionnaireId = response.body?.data?.id
    expect(copiedQuestionnaireId).toBeTruthy()

    const items = await prisma.questionnaireFormItem.findMany({
      where: { questionnaireId: copiedQuestionnaireId },
      select: { id: true, sectionId: true },
    })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => Boolean(item.sectionId))).toBe(true)
  })

  it('GET materializes sections exactly once and reuses the rows for both projections', async () => {
    resetRuntimeObservabilityForTests()
    const { value, calls } = await runObserved(() => invoke(
      questionnaireController.detail,
      { id: questionnaireId },
    ))
    expect(value.statusCode).toBe(200)

    // The write-time invariant means the pure read finds no orphans, so it
    // performs exactly one QuestionnaireFormSection.findMany (materialization).
    // Both list projections must reuse those rows instead of re-running the
    // lazy ensure. The parent questionnaire is read once via findFirst.
    expect(callCount(calls, 'Questionnaire', 'findFirst')).toBe(1)
    expect(callCount(calls, 'QuestionnaireFormSection', 'findMany')).toBe(1)
    expect(callCount(calls, 'QuestionnaireScale', 'findMany')).toBe(1)

    // Regression guard: before Work C the lazy ensure ran once per projection,
    // so QuestionnaireFormSection.findMany appeared 3 times on this path.
    expect(callCount(calls, 'QuestionnaireFormSection', 'findMany')).toBeLessThanOrEqual(1)
  })

  it('listQuestionnaireContentUnits with pre-materialized sections performs no redundant ensure', async () => {
    resetRuntimeObservabilityForTests()
    const sections = await formSectionService.ensureQuestionnaireFormSections(questionnaireId)
    const { value, calls } = await runObserved(() => formSectionService.listQuestionnaireContentUnits(questionnaireId, sections))

    expect(value.length).toBeGreaterThan(0)
    // Passing pre-materialized sections must skip the lazy ensure entirely:
    // no Questionnaire.findUnique and no QuestionnaireFormSection.findMany.
    expect(anyCall(calls, 'Questionnaire', 'findUnique')).toBe(false)
    expect(anyCall(calls, 'QuestionnaireFormSection', 'findMany')).toBe(false)
    expect(callCount(calls, 'QuestionnaireScale', 'findMany')).toBe(1)
  })

  it('sections a new composite FORM module at write time', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const composite = await prisma.compositeAssessment.create({
      data: {
        code: `WORKC-QB-COMP-${suffix}`,
        name: 'Work C composite budget fixture',
        createdBy: teacherId,
        status: 'DRAFT',
      },
    })
    compositeId = composite.id

    const item = await compositeService.addItem(teacherId, 'TEACHER' as any, compositeId, {
      type: 'FORM',
      formType: 'text_input',
      formLabel: 'Work C composite form item',
      required: true,
      position: 0,
    })
    expect(item.type).toBe('FORM')

    const stored = await prisma.compositeAssessmentItem.findUnique({
      where: { id: item.id },
      select: { id: true, formSectionId: true },
    })
    expect(stored?.formSectionId).toBeTruthy()

    const sections = await prisma.compositeFormSection.findMany({ where: { compositeAssessmentId: compositeId } })
    expect(sections.length).toBeGreaterThan(0)
  })

  it('Unified attempt-state loads the parent composite attempt exactly once', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const composite = await prisma.compositeAssessment.create({
      data: {
        code: `WORKC-QB-STATE-${suffix}`,
        name: 'Work C unified state fixture',
        createdBy: teacherId,
        status: 'PUBLISHED',
      },
    })
    const section = await prisma.compositeFormSection.create({
      data: {
        compositeAssessmentId: composite.id,
        title: 'Work C state section',
        position: 0,
        contextSection: false,
      },
    })
    await prisma.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: composite.id,
        type: 'FORM',
        position: 0,
        required: true,
        formType: 'text_input',
        formLabel: 'Work C state answer',
        formSectionId: section.id,
        formSectionPosition: 0,
      },
    })
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: composite.id,
        userId: teacherId,
        participantKey: `workc-qb-state-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    const storedSection = await prisma.compositeFormSection.findUnique({
      where: { id: section.id },
      include: { items: true },
    })
    if (!storedSection) throw new Error('Work C state section fixture is missing')
    const definitionHash = formSectionIdentityHash(mapCompositeSection(storedSection as any))
    const frozen = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [],
      cognitive: [],
      formSections: [{ sectionId: section.id, definitionHash }],
    })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen),
        frozenActiveSlotSetHash: frozen.snapshotHash,
      },
    })

    const { value, calls } = await runObserved(() => compositeService.getAttemptState(attempt.id, { userId: teacherId }))
    expect(value.status).toBe('IN_PROGRESS')
    expect(value.id).toBe(attempt.id)

    // Load-once: routing, projection, and FORM admission all share the single
    // parent read. Before Work C this path read the same composite attempt row
    // up to three times (routing, state projection, admission).
    expect(callCount(calls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(1)

    await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: composite.id } })
    await prisma.compositeFormSection.deleteMany({ where: { compositeAssessmentId: composite.id } })
    await prisma.compositeAssessmentAttempt.delete({ where: { id: attempt.id } })
    await prisma.compositeAssessment.delete({ where: { id: composite.id } })
  })

  it('public questionnaire read path performs no redundant ensure and no materialization writes', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const general = await prisma.questionnaire.create({
      data: {
        code: `WORKC-QB-PUBLIC-${suffix}`,
        name: 'Work C public budget fixture',
        creatorId: teacherId,
        type: 'GENERAL',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    extraQuestionnaireIds.push(general.id)
    // The addFormItem controller only manages COURSE questionnaires, so the
    // GENERAL fixture sections its item directly at write time (the same
    // invariant the controller enforces for course questionnaires).
    await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId: general.id,
        type: 'text_input',
        label: 'Work C public item',
        required: true,
        position: 0,
      },
    })
    await formSectionService.ensureQuestionnaireFormSections(general.id)
    const token = tokenService.generateToken()
    await prisma.questionnaireAccessToken.create({
      data: {
        questionnaireId: general.id,
        tokenHash: tokenService.hashToken(token),
        tokenEncrypted: tokenService.encryptToken(token),
        createdBy: teacherId,
        expiresAt: new Date(Date.now() + 60_000),
        maxUses: 0,
        usedCount: 0,
        isActive: true,
      },
    })

    const { value, calls } = await runObserved(() => invoke(
      publicQuestionnaireController.getQuestionnaireByToken,
      { token },
    ))
    expect(value.statusCode).toBe(200)

    // Token lookup + questionnaire read (formSections included) are the only
    // reads; content units reuse the pre-materialized sections.
    expect(callCount(calls, 'QuestionnaireAccessToken', 'findUnique')).toBe(1)
    expect(callCount(calls, 'Questionnaire', 'findUnique')).toBe(1)
    expect(callCount(calls, 'QuestionnaireScale', 'findMany')).toBe(1)
    // Write-time invariant: the public read path performs zero redundant
    // lazy-ensure and zero materialization writes.
    expect(callCount(calls, 'QuestionnaireFormSection', 'findMany')).toBe(0)
    expect(callCount(calls, 'QuestionnaireFormSection', 'create')).toBe(0)
    expect(callCount(calls, 'QuestionnaireFormSection', 'update')).toBe(0)

    await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: general.id } })
    await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: general.id } })
    await prisma.questionnaireAccessToken.deleteMany({ where: { questionnaireId: general.id } })
    await prisma.questionnaire.delete({ where: { id: general.id } })
  })

  it('scale admission loads the composite parent exactly once (load-once admission)', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const scale = await prisma.scale.create({
      data: {
        code: `workc-qb-scale-${suffix}`,
        name: 'Work C scale fixture',
        creatorId: teacherId,
        status: 'PUBLISHED',
        visibility: 'HIDDEN',
        instrumentClass: 'STANDARD',
        instrumentVersion: '2.0.0',
        definitionHash: 'a'.repeat(64),
        itemCount: 1,
        dimensionCount: 1,
      },
    })
    const composite = await prisma.compositeAssessment.create({
      data: {
        code: `WORKC-QB-SCALE-${suffix}`,
        name: 'Work C scale budget fixture',
        createdBy: teacherId,
        status: 'PUBLISHED',
      },
    })
    const item = await prisma.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: composite.id,
        type: 'SCALE',
        position: 0,
        required: true,
        scaleId: scale.id,
      },
    })
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: composite.id,
        userId: teacherId,
        participantKey: `workc-qb-scale-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    const frozen = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [{
        compositeItemId: item.id,
        code: scale.code,
        instrumentVersion: scale.instrumentVersion,
        sourceDefinitionHash: 'b'.repeat(64),
        compiledRuntimeHash: 'c'.repeat(64),
      }],
      cognitive: [],
      formSections: [],
    })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen),
        frozenActiveSlotSetHash: frozen.snapshotHash,
      },
    })
    const createChild = () => prisma.assessment.create({
      data: {
        scaleId: scale.id,
        userId: teacherId,
        compositeAttemptId: attempt.id,
        compositeItemId: item.id,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
      },
    })

    // Without a passed-in parent, admission reads the child once and the
    // composite parent once.
    const childA = await createChild()
    const { value: first, calls: firstCalls } = await runObserved(() => ensureScaleAdmissionAtDelivery(childA.id))
    expect(first).toBeTruthy()
    expect(callCount(firstCalls, 'Assessment', 'findUnique')).toBe(1)
    expect(callCount(firstCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(1)

    // With the parent passed in (unified attempt-state reader), the parent
    // read is skipped entirely while the child is still read once.
    const parent = await prisma.compositeAssessmentAttempt.findUnique({
      where: { id: attempt.id },
      select: {
        id: true,
        userId: true,
        recoveryTokenHash: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        frozenActiveSlotSetEncrypted: true,
        frozenActiveSlotSetHash: true,
        compositeAssessment: {
          select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
        },
      },
    })
    if (!parent) throw new Error('Work C scale parent fixture is missing')
    const childB = await createChild()
    const { calls: secondCalls } = await runObserved(() => ensureScaleAdmissionAtDelivery(childB.id, parent as any))
    expect(callCount(secondCalls, 'Assessment', 'findUnique')).toBe(1)
    expect(callCount(secondCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(0)

    // With both the parent and the already-loaded child passed in (unified
    // attempt-state reader), neither the parent nor the child is re-read.
    const childC = await prisma.assessment.findUnique({
      where: { id: (await createChild()).id },
      select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
    })
    if (!childC) throw new Error('Work C scale child fixture is missing')
    const { calls: thirdCalls } = await runObserved(() => ensureScaleAdmissionAtDelivery(childC.id, parent as any, childC as any))
    expect(callCount(thirdCalls, 'Assessment', 'findUnique')).toBe(0)
    expect(callCount(thirdCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(0)

    await prisma.assessment.deleteMany({ where: { compositeAttemptId: attempt.id } })
    await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: composite.id } })
    await prisma.compositeAssessmentAttempt.delete({ where: { id: attempt.id } })
    await prisma.compositeAssessment.delete({ where: { id: composite.id } })
    await prisma.scale.delete({ where: { id: scale.id } })
  })

  it('cognitive admission loads the composite parent exactly once (load-once admission)', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const config = await prisma.cognitiveTestConfig.create({
      data: {
        testType: 'fake',
        configVersion: `workc-qb-cog-${suffix}`,
        name: 'Work C cognitive budget fixture',
        config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 } as any,
        status: 'PUBLISHED',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        accessPolicy: 'OPEN',
      },
    })
    const runtimeSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
      testType: config.testType,
      configVersion: config.configVersion,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      config: config.config,
      db: prisma as any,
    })
    const composite = await prisma.compositeAssessment.create({
      data: {
        code: `WORKC-QB-COG-${suffix}`,
        name: 'Work C cognitive budget fixture',
        createdBy: teacherId,
        status: 'PUBLISHED',
      },
    })
    const item = await prisma.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: composite.id,
        type: 'COGNITIVE',
        position: 0,
        required: true,
      },
    })
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: composite.id,
        userId: teacherId,
        participantKey: `workc-qb-cog-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    const frozen = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [],
      cognitive: [{
        compositeItemId: item.id,
        testType: config.testType,
        instrumentVersion: runtimeSnapshot.compiledRuntime.instrumentVersion,
        sourceDefinitionHash: runtimeSnapshot.compiledRuntime.sourceDefinitionHash,
        compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
      }],
      formSections: [],
    })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen),
        frozenActiveSlotSetHash: frozen.snapshotHash,
      },
    })
    const createChild = () => prisma.cognitiveSession.create({
      data: {
        userId: teacherId,
        participantKey: `workc-qb-cog-session-${suffix}`,
        compositeAttemptId: attempt.id,
        compositeItemId: item.id,
        configId: config.id,
        testType: config.testType,
        attemptNo: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
        configVersion: config.configVersion,
        configSnapshotEncrypted: runtimeSnapshot.encrypted,
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
        randomSeed: `workc-qb-cog-seed-${suffix}`,
      },
    })

    const sessionA = await createChild()
    const { value: first, calls: firstCalls } = await runObserved(() => ensureCognitiveAdmissionAtDelivery(sessionA.id))
    expect(first).toBeTruthy()
    expect(callCount(firstCalls, 'CognitiveSession', 'findUnique')).toBe(1)
    expect(callCount(firstCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(1)

    const parent = await prisma.compositeAssessmentAttempt.findUnique({
      where: { id: attempt.id },
      select: {
        id: true,
        userId: true,
        recoveryTokenHash: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        frozenActiveSlotSetEncrypted: true,
        frozenActiveSlotSetHash: true,
        compositeAssessment: {
          select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
        },
      },
    })
    if (!parent) throw new Error('Work C cognitive parent fixture is missing')
    const sessionB = await createChild()
    const { calls: secondCalls } = await runObserved(() => ensureCognitiveAdmissionAtDelivery(sessionB.id, parent as any))
    expect(callCount(secondCalls, 'CognitiveSession', 'findUnique')).toBe(1)
    expect(callCount(secondCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(0)

    // With both the parent and the already-loaded child passed in (unified
    // attempt-state reader), neither the parent nor the child is re-read.
    const sessionC = await prisma.cognitiveSession.findUnique({
      where: { id: (await createChild()).id },
      select: UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT,
    })
    if (!sessionC) throw new Error('Work C cognitive child fixture is missing')
    const { calls: thirdCalls } = await runObserved(() => ensureCognitiveAdmissionAtDelivery(sessionC.id, parent as any, sessionC as any))
    expect(callCount(thirdCalls, 'CognitiveSession', 'findUnique')).toBe(0)
    expect(callCount(thirdCalls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(0)

    await prisma.cognitiveSession.deleteMany({ where: { compositeAttemptId: attempt.id } })
    await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: composite.id } })
    await prisma.compositeAssessmentAttempt.delete({ where: { id: attempt.id } })
    await prisma.compositeAssessment.delete({ where: { id: composite.id } })
    await prisma.cognitiveTestConfig.delete({ where: { id: config.id } })
  })

  it('sections a new GENERAL questionnaire form item at write time (no orphan)', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const general = await prisma.questionnaire.create({
      data: {
        code: `WORKC-QB-GENERAL-${suffix}`,
        name: 'Work C general budget fixture',
        creatorId: teacherId,
        type: 'GENERAL',
        status: 'DRAFT',
        visibility: 'COURSE',
      },
    })
    extraQuestionnaireIds.push(general.id)

    const response = await invoke(
      generalQuestionnaireController.addFormItem,
      { id: general.id },
      { type: 'text_input', label: 'Work C general item', required: true, position: 0 },
    )
    expect(response.statusCode).toBe(200)

    const items = await prisma.questionnaireFormItem.findMany({
      where: { questionnaireId: general.id },
      select: { id: true, sectionId: true },
    })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => Boolean(item.sectionId))).toBe(true)

    const sections = await prisma.questionnaireFormSection.findMany({ where: { questionnaireId: general.id } })
    expect(sections.length).toBeGreaterThan(0)

    await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: general.id } })
    await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: general.id } })
    await prisma.questionnaire.delete({ where: { id: general.id } })
  })

  it('frozen Form admission returns the stored snapshot without re-reading the parent', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `WORKC-QB-FROZEN-${suffix}`,
        name: 'Work C frozen admission fixture',
        creatorId: teacherId,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'COURSE',
      },
    })
    extraQuestionnaireIds.push(questionnaire.id)
    const section = await prisma.questionnaireFormSection.create({
      data: {
        questionnaireId: questionnaire.id,
        title: 'Work C frozen section',
        position: 0,
        contextSection: false,
      },
    })
    await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId: questionnaire.id,
        type: 'text_input',
        label: 'Work C frozen answer',
        required: true,
        position: 0,
        sectionId: section.id,
        sectionPosition: 0,
      },
    })
    const storedSection = await prisma.questionnaireFormSection.findUnique({
      where: { id: section.id },
      include: { items: true },
    })
    if (!storedSection) throw new Error('Work C frozen section fixture is missing')
    // Production hot paths receive the mapped definition (no Prisma metadata),
    // so the frozen slot identity and the admission definition both use it.
    const mappedSection = mapQuestionnaireSection(storedSection as any)
    const definitionHash = formSectionIdentityHash(mappedSection)
    const frozen = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 1,
      scales: [],
      formSections: [{ sectionId: section.id, definitionHash }],
    })
    const assessment = await prisma.questionnaireAssessment.create({
      data: {
        questionnaireId: questionnaire.id,
        userId: teacherId,
        sessionId: `workc-qb-frozen-session-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen),
        frozenActiveSlotSetHash: frozen.snapshotHash,
      },
    })

    // First delivery activates a fresh admission: the heavy parent read runs
    // exactly once and the section attempt is created.
    const { value: first, calls: firstCalls } = await runObserved(() => ensureQuestionnaireFormAdmissionAtDelivery(assessment.id, mappedSection))
    expect(first).toBeTruthy()
    expect(callCount(firstCalls, 'QuestionnaireAssessment', 'findUnique')).toBe(1)

    // Steady-state fast path: the frozen snapshot is returned directly, so the
    // heavy parent read is skipped entirely on every subsequent delivery.
    const { value: second, calls: secondCalls } = await runObserved(() => ensureQuestionnaireFormAdmissionAtDelivery(assessment.id, mappedSection))
    expect(second).toBeTruthy()
    expect(callCount(secondCalls, 'QuestionnaireAssessment', 'findUnique')).toBe(0)

    await prisma.questionnaireFormSectionAttempt.deleteMany({ where: { questionnaireAssessmentId: assessment.id } })
    await prisma.questionnaireAssessment.delete({ where: { id: assessment.id } })
    await prisma.questionnaireFormItem.deleteMany({ where: { questionnaireId: questionnaire.id } })
    await prisma.questionnaireFormSection.deleteMany({ where: { questionnaireId: questionnaire.id } })
    await prisma.questionnaire.delete({ where: { id: questionnaire.id } })
  })

  it('current-unit scale delivery reuses the loaded child (no re-read on unified attempt-state)', async () => {
    resetRuntimeObservabilityForTests()
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const scaleCode = `workc-qb-current-scale-${suffix}`
    const definition = {
      schemaVersion: 2,
      respondentType: 'participant_self_report',
      source: { title: 'Work C current-unit scale', citation: 'query-budget.postgres.integration.test' },
      license: { status: 'self_authored', redistribution: 'allowed' },
      display: { randomizeItems: false },
      responseSets: [{
        key: 'default',
        options: [
          { value: 'no', label: '否', score: 0 },
          { value: 'yes', label: '是', score: 1 },
        ],
      }],
      items: [{
        itemCode: 'workc-qb-current-item-1',
        content: 'Work C current-unit item',
        type: 'single',
        required: true,
        sortOrder: 0,
        responseSetKey: 'default',
        randomizeOptions: false,
      }],
      scoring: {
        scoringVersion: '2.0.0',
        itemRules: [{ itemCode: 'workc-qb-current-item-1', transform: { type: 'identity' } }],
        defaultMissingPolicy: { type: 'complete_required' },
        scores: [{
          key: 'total',
          type: 'total',
          label: '总分',
          direction: 'descriptive',
          canonical: true,
          displayPrecision: 2,
          source: { type: 'items', items: [{ itemCode: 'workc-qb-current-item-1', weight: 1 }], aggregation: 'sum' },
        }],
      },
      report: {
        reportVersion: '2.0.0',
        primaryScoreKeys: ['total'],
        scoreOrder: ['total'],
        interpretations: [{
          scoreKey: 'total',
          headline: '总分',
          source: { type: 'score_only' },
          summary: 'Work C current-unit result',
          bands: [],
          guidance: [],
        }],
        limitations: [],
        disclaimer: 'Work C current-unit fixture only.',
      },
      referencePolicy: { type: 'none' },
    }
    const runtime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: scaleCode,
      instrumentVersion: '2.0.0',
      definition: definition as any,
    })
    const scale = await prisma.scale.create({
      data: {
        code: scaleCode,
        name: 'Work C current-unit scale fixture',
        creatorId: teacherId,
        status: 'PUBLISHED',
        visibility: 'HIDDEN',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '2.0.0',
        definition: definition as any,
        definitionHash: hashScaleDefinition(definition as any),
        itemCount: 1,
        dimensionCount: 1,
      },
    })
    const composite = await prisma.compositeAssessment.create({
      data: {
        code: `WORKC-QB-CURRENT-${suffix}`,
        name: 'Work C current-unit budget fixture',
        createdBy: teacherId,
        status: 'PUBLISHED',
      },
    })
    const item = await prisma.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: composite.id,
        type: 'SCALE',
        position: 0,
        required: true,
        scaleId: scale.id,
      },
    })
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: composite.id,
        userId: teacherId,
        participantKey: `workc-qb-current-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    const frozen = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [{
        compositeItemId: item.id,
        code: scaleCode,
        instrumentVersion: '2.0.0',
        sourceDefinitionHash: runtime.sourceDefinitionHash,
        compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      }],
      cognitive: [],
      formSections: [],
    })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen),
        frozenActiveSlotSetHash: frozen.snapshotHash,
      },
    })
    await prisma.assessment.create({
      data: {
        scaleId: scale.id,
        userId: teacherId,
        compositeAttemptId: attempt.id,
        compositeItemId: item.id,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtime),
        compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      },
    })

    const { value, calls } = await runObserved(() => compositeService.getAttemptState(attempt.id, { userId: teacherId }))
    expect(value.status).toBe('IN_PROGRESS')
    expect(value.currentItem?.type).toBe('SCALE')

    // Load-once completion: the unified attempt-state reader holds the child
    // row (scaleAssessments in the parent select) and passes it to admission,
    // so the current-unit delivery performs zero Assessment.findUnique reads.
    expect(callCount(calls, 'CompositeAssessmentAttempt', 'findUnique')).toBe(1)
    expect(callCount(calls, 'Assessment', 'findUnique')).toBe(0)

    await prisma.assessment.deleteMany({ where: { compositeAttemptId: attempt.id } })
    await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: composite.id } })
    await prisma.compositeAssessmentAttempt.delete({ where: { id: attempt.id } })
    await prisma.compositeAssessment.delete({ where: { id: composite.id } })
    await prisma.scale.delete({ where: { id: scale.id } })
  })
})
