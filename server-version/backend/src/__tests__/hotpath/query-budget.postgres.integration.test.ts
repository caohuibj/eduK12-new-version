import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { resetRuntimeObservabilityForTests } from '../../services/runtimeObservability'

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
let compositeService: typeof import('../../modules/composite/composite.service')
let formSectionService: typeof import('../../services/questionnaire-form-section.service')
let teacherId = ''
let questionnaireId = ''
let copiedQuestionnaireId = ''
let compositeId = ''
let observedPrismaCalls: ObservedPrismaCall[] = []

const invoke = async (
  handler: Handler,
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user: Record<string, unknown> = { userId: teacherId, role: 'TEACHER' },
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
  await handler({ params, body, user }, res)
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
    compositeService = await import('../../modules/composite/composite.service')
    formSectionService = await import('../../services/questionnaire-form-section.service')

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

    // The write-time invariant means ensureQuestionnaireFormSections finds no
    // orphans, so it performs exactly one findUnique (read) + one findMany
    // (materialization). Both list projections must reuse those rows instead of
    // re-running the lazy ensure.
    expect(callCount(calls, 'Questionnaire', 'findUnique')).toBe(1)
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
})
