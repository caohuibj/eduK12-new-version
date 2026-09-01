import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { resetRuntimeObservabilityForTests, runtimeMetricLines } from '../../services/runtimeObservability'

/**
 * PR38 coverage for the authenticated Questionnaire form-answer batch path.
 * The suite is opt-in and uses only a uniquely prefixed fixture so it can
 * share the retained PR37 PostgreSQL container without touching old data.
 */
const DB_URL = integrationDatabaseUrl('PR38_INTEGRATION_DATABASE_URL', 'PR34_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

type CapturedResponse = {
  statusCode: number
  body: Record<string, any> | undefined
}

type Handler = (req: any, res: any) => Promise<unknown>

type ObservedPrismaCall = {
  model?: string
  action: string
  durationMs: number
}

let prisma: PrismaClient
let questionnaireController: typeof import('../../controllers/questionnaireController')['questionnaireController']
let userId = ''
let questionnaireId = ''
let assessmentId = ''
let formItemIds: string[] = []
let observedPrismaCalls: ObservedPrismaCall[] = []

const invoke = async (
  handler: Handler,
  params: Record<string, string>,
  body: Record<string, unknown> = {},
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
  await handler({
    params,
    body,
    user: { userId, role: 'STUDENT' },
  }, res)
  return response
}

const resetFixture = async (): Promise<void> => {
  await prisma.questionnaireFormAnswer.deleteMany({ where: { questionnaireAssessmentId: assessmentId } })
  await prisma.questionnaireAssessment.update({
    where: { id: assessmentId },
    data: {
      status: 'IN_PROGRESS',
      progress: 0,
      completedScales: 0,
      completedForms: 0,
      completedAt: null,
      totalTime: null,
      aggregateReport: Prisma.DbNull,
      aggregateReportEncrypted: null,
      contextSnapshotEncrypted: null,
      contextSnapshotHash: null,
      contextFrozenAt: null,
    },
  })
  observedPrismaCalls = []
  resetRuntimeObservabilityForTests()
}

const runObserved = async <T>(operation: () => Promise<T>): Promise<{
  value: T
  calls: ObservedPrismaCall[]
  elapsedMs: number
  transactionLatencyMs: number
}> => {
  observedPrismaCalls = []
  const startedAt = process.hrtime.bigint()
  const value = await operation()
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
  const calls = [...observedPrismaCalls]
  const lockIndex = calls.findIndex((call) => call.action === '$queryRaw')
  let commitUpdateIndex = -1
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    if (calls[index].model === 'QuestionnaireAssessment' && calls[index].action === 'updateMany') {
      commitUpdateIndex = index
      break
    }
  }
  const transactionLatencyMs = lockIndex >= 0 && commitUpdateIndex >= lockIndex
    ? calls.slice(lockIndex, commitUpdateIndex + 1).reduce((sum, call) => sum + call.durationMs, 0)
    : 0
  return { value, calls, elapsedMs, transactionLatencyMs }
}

const answersFor = (size: number, valuePrefix = 'answer') => formItemIds.slice(0, size).map((formItemId, index) => ({
  formItemId,
  value: `${valuePrefix}-${index}`,
  expectedRevision: 0,
  checkpointId: `pr38-cp-${valuePrefix}-${index}`,
  checkpointSequence: index + 1,
}))

suite('PR38 Questionnaire form-answer bulk mutation (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    questionnaireController = (await import('../../controllers/questionnaireController')).questionnaireController

    prisma.$use(async (params, next) => {
      const startedAt = process.hrtime.bigint()
      try {
        return await next(params)
      } finally {
        observedPrismaCalls.push({
          model: params.model,
          action: params.action,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        })
      }
    })

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: { username: `pr38-form-bulk-${suffix}`, passwordHash: 'test-only', role: 'STUDENT' },
    })
    userId = user.id

    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `PR38-FORM-BULK-${suffix}`,
        name: 'PR38 form answer bulk mutation fixture',
        creatorId: userId,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'COURSE',
      },
    })
    questionnaireId = questionnaire.id

    const formItems = await Promise.all(Array.from({ length: 10 }, (_, index) => (
      prisma.questionnaireFormItem.create({
        data: {
          questionnaireId,
          type: 'text_input',
          label: `PR38 answer ${index + 1}`,
          required: true,
          position: index,
        },
      })
    )))
    formItemIds = formItems.map((item) => item.id)

    const assessment = await prisma.questionnaireAssessment.create({
      data: { questionnaireId, userId, status: 'IN_PROGRESS' },
    })
    assessmentId = assessment.id
  })

  beforeEach(async () => {
    await resetFixture()
  })

  afterAll(async () => {
    try {
      if (assessmentId) await prisma.questionnaireAssessment.delete({ where: { id: assessmentId } })
      if (questionnaireId) await prisma.questionnaire.delete({ where: { id: questionnaireId } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('keeps database calls flat and uses one bulk mutation for batch sizes 1, 5, and 10', async () => {
    const queryCounts: number[] = []
    const transactionLatencies: number[] = []

    for (const size of [1, 5, 10]) {
      await resetFixture()
      const metrics = await runObserved(() => invoke(
        questionnaireController.saveFormAnswers,
        { assessmentId },
        { answers: answersFor(size, `size-${size}`) },
      ))

      expect(metrics.value.statusCode).toBe(200)
      expect(metrics.value.body).toMatchObject({ code: 0, data: { saved: size } })
      expect(metrics.calls.filter((call) => call.action === 'executeRaw')).toHaveLength(1)
      expect(metrics.calls.filter((call) => call.model === 'QuestionnaireFormAnswer' && call.action === 'upsert')).toHaveLength(0)
      expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(metrics.transactionLatencyMs).toBeGreaterThanOrEqual(0)
      queryCounts.push(metrics.calls.length)
      transactionLatencies.push(metrics.transactionLatencyMs)

      const stored = await prisma.questionnaireFormAnswer.findMany({
        where: { questionnaireAssessmentId: assessmentId },
      })
      expect(stored).toHaveLength(size)
      expect(stored.every((answer) => answer.revision === 1 && answer.status === 'ANSWERED')).toBe(true)
    }

    expect(new Set(queryCounts).size).toBe(1)
    expect(transactionLatencies.every((latency) => Number.isFinite(latency))).toBe(true)
  })

  it('checks assessment ownership before exposing form-item membership', async () => {
    const otherUser = await prisma.user.create({
      data: {
        username: `pr38-form-bulk-foreign-${Date.now()}`,
        passwordHash: 'test-only',
        role: 'STUDENT',
      },
    })
    const foreignAssessment = await prisma.questionnaireAssessment.create({
      data: { questionnaireId, userId: otherUser.id, status: 'IN_PROGRESS' },
    })

    try {
      const response = await invoke(
        questionnaireController.saveFormAnswers,
        { assessmentId: foreignAssessment.id },
        { answers: [{ formItemId: 'pr38-not-a-form-item', value: 'must-not-probe' }] },
      )
      expect(response.statusCode).toBe(403)
    } finally {
      await prisma.questionnaireAssessment.delete({ where: { id: foreignAssessment.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
    }
  })

  it('keeps identical replay idempotent and persists duplicate item input once', async () => {
    const first = await invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      { answers: answersFor(2, 'replay') },
    )
    expect(first.statusCode).toBe(200)

    const replay = await runObserved(() => invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      { answers: answersFor(2, 'replay') },
    ))
    expect(replay.value.statusCode).toBe(200)
    expect(replay.calls.filter((call) => call.action === 'executeRaw')).toHaveLength(0)

    await resetFixture()
    const duplicate = await invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      {
        answers: [
          { formItemId: formItemIds[0], value: 'first', expectedRevision: 0 },
          { formItemId: formItemIds[0], value: 'final', expectedRevision: 1 },
        ],
      },
    )
    expect(duplicate.statusCode).toBe(200)

    const stored = await prisma.questionnaireFormAnswer.findUnique({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: assessmentId,
          formItemId: formItemIds[0],
        },
      },
    })
    expect(stored).toMatchObject({ value: 'final', status: 'ANSWERED', revision: 2 })
  })

  it('rejects a stale batch atomically before the bulk mutation', async () => {
    const initial = await invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      { answers: [{ formItemId: formItemIds[0], value: 'original', expectedRevision: 0 }] },
    )
    expect(initial.statusCode).toBe(200)

    const stale = await runObserved(() => invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      {
        answers: [
          { formItemId: formItemIds[0], value: 'replacement', expectedRevision: 0 },
          { formItemId: formItemIds[1], value: 'must-not-persist', expectedRevision: 0 },
        ],
      },
    ))
    expect(stale.value.statusCode).toBe(409)
    expect(stale.calls.filter((call) => call.action === 'executeRaw')).toHaveLength(0)

    const stored = await prisma.questionnaireFormAnswer.findMany({
      where: { questionnaireAssessmentId: assessmentId },
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ formItemId: formItemIds[0], value: 'original', revision: 1 })
  })

  it('serializes concurrent answer writers on the assessment row without Serializable retries', async () => {
    const [first, second] = await Promise.all([
      invoke(
        questionnaireController.saveFormAnswers,
        { assessmentId },
        { answers: [{ formItemId: formItemIds[0], value: 'writer-a', expectedRevision: 0 }] },
      ),
      invoke(
        questionnaireController.saveFormAnswers,
        { assessmentId },
        { answers: [{ formItemId: formItemIds[0], value: 'writer-b', expectedRevision: 0 }] },
      ),
    ])

    expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([200, 409])
    const stored = await prisma.questionnaireFormAnswer.findUnique({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: assessmentId,
          formItemId: formItemIds[0],
        },
      },
    })
    expect(stored).toMatchObject({ revision: 1, status: 'ANSWERED' })
    expect(['writer-a', 'writer-b']).toContain(stored?.value)
    expect(runtimeMetricLines().some((line) => line.startsWith('ptool_serializable_attempts_total{'))).toBe(false)
  })

  it('does not complete when an answer and completion race', async () => {
    const [answer, completion] = await Promise.all([
      invoke(
        questionnaireController.saveFormAnswers,
        { assessmentId },
        { answers: [{ formItemId: formItemIds[0], value: 'race-answer', expectedRevision: 0 }] },
      ),
      invoke(questionnaireController.completeAssessment, { id: assessmentId }),
    ])

    expect(answer.statusCode).toBe(200)
    expect(completion.statusCode).toBe(409)
    const assessment = await prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId } })
    expect(assessment?.status).toBe('IN_PROGRESS')
    const stored = await prisma.questionnaireFormAnswer.findUnique({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: assessmentId,
          formItemId: formItemIds[0],
        },
      },
    })
    expect(stored).toMatchObject({ value: 'race-answer', status: 'ANSWERED', revision: 1 })
  })

  it('keeps completion terminal predicate correct after all bulk answers are saved', async () => {
    const saved = await invoke(
      questionnaireController.saveFormAnswers,
      { assessmentId },
      { answers: answersFor(10, 'complete') },
    )
    expect(saved.statusCode).toBe(200)

    const completion = await invoke(questionnaireController.completeAssessment, { id: assessmentId })
    expect(completion.statusCode).toBe(200)
    const assessment = await prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId } })
    expect(assessment).toMatchObject({ status: 'COMPLETED', progress: 100, completedForms: 10 })
  })
})
