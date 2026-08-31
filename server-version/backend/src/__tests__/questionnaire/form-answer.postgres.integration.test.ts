import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { readContextFormAnswer } from '../../modules/assessment-context'
import { integrationDatabaseUrl } from '../integration/integration-env'

/**
 * Opt-in PostgreSQL coverage for the public questionnaire answer transaction.
 * The fixture is isolated and removed after the suite; no developer database
 * is used unless PR34_INTEGRATION_DATABASE_URL is explicitly supplied.
 */
const DB_URL = integrationDatabaseUrl('PR34_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

type CapturedResponse = {
  statusCode: number
  body: Record<string, unknown> | undefined
}

let prisma: PrismaClient
let publicQuestionnaireController: typeof import('../../controllers/publicQuestionnaireController')['publicQuestionnaireController']
let userId = ''
let questionnaireId = ''
let assessmentId = ''
let sessionId = ''
let firstFormItemId = ''
let secondFormItemId = ''
let contextFormItemId = ''

const invoke = async (
  handler: (req: any, res: any) => Promise<unknown>,
  body: Record<string, unknown> = {},
): Promise<CapturedResponse> => {
  const response: CapturedResponse = { statusCode: 200, body: undefined }
  const res = {
    status: (statusCode: number) => {
      response.statusCode = statusCode
      return res
    },
    json: (body: Record<string, unknown>) => {
      response.body = body
      return body
    },
  }
  await handler({ params: { sessionId }, body }, res)
  return response
}

suite('public questionnaire form answers (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    publicQuestionnaireController = (await import('../../controllers/publicQuestionnaireController')).publicQuestionnaireController

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: { username: `pr26-form-answer-${suffix}`, passwordHash: 'test-only', role: 'STUDENT' },
    })
    userId = user.id

    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `PR26-FORM-${suffix}`,
        name: 'PR26 form answer transaction fixture',
        creatorId: userId,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    questionnaireId = questionnaire.id

    const firstFormItem = await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId,
        type: 'text_input',
        label: 'First answer',
        required: true,
        position: 0,
      },
    })
    firstFormItemId = firstFormItem.id

    const secondFormItem = await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId,
        type: 'text_input',
        label: 'Second answer',
        required: true,
        position: 1,
      },
    })
    secondFormItemId = secondFormItem.id

    const contextFormItem = await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId,
        type: 'single_choice',
        label: 'Sex at birth',
        required: true,
        position: 2,
        options: [{ value: 'female', label: 'Female' }],
        contextKey: 'sexAtBirth',
      },
    })
    contextFormItemId = contextFormItem.id

    sessionId = `pr26-form-session-${suffix}`
    const assessment = await prisma.questionnaireAssessment.create({
      data: { questionnaireId, userId, sessionId, status: 'IN_PROGRESS' },
    })
    assessmentId = assessment.id
  })

  beforeEach(async () => {
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

  it('serializes same-item writes and preserves optimistic concurrency', async () => {
    const [first, second] = await Promise.all([
      invoke(publicQuestionnaireController.submitFormAnswer, {
        formItemId: firstFormItemId,
        value: 'answer A',
        expectedRevision: 0,
      }),
      invoke(publicQuestionnaireController.submitFormAnswer, {
        formItemId: firstFormItemId,
        value: 'answer B',
        expectedRevision: 0,
      }),
    ])

    expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([200, 409])

    const stored = await prisma.questionnaireFormAnswer.findUnique({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: assessmentId,
          formItemId: firstFormItemId,
        },
      },
    })
    expect(stored).toMatchObject({ revision: 1, status: 'ANSWERED' })
    expect(['answer A', 'answer B']).toContain(stored?.value)
  }, 60000)

  it('keeps batch replay idempotent without advancing the answer revision', async () => {
    const first = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [
        { formItemId: firstFormItemId, value: 'batch A', expectedRevision: 0, checkpointId: 'cp-1' },
        { formItemId: secondFormItemId, value: 'batch B', expectedRevision: 0, checkpointId: 'cp-2' },
      ],
    })
    expect(first.statusCode).toBe(200)
    expect(first.body).toMatchObject({ code: 0, data: { saved: 2, acceptedIds: ['cp-1', 'cp-2'] } })

    const replay = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [
        { formItemId: firstFormItemId, value: 'batch A', expectedRevision: 0, checkpointId: 'cp-1-replay' },
      ],
    })
    expect(replay.statusCode).toBe(200)

    const stored = await prisma.questionnaireFormAnswer.findMany({
      where: { questionnaireAssessmentId: assessmentId },
      orderBy: { formItemId: 'asc' },
    })
    expect(stored).toHaveLength(2)
    expect(stored.every((answer) => answer.revision === 1 && answer.status === 'ANSWERED')).toBe(true)
  })

  it('updates the pre-created PENDING row in place and preserves its identity', async () => {
    const pending = await prisma.questionnaireFormAnswer.create({
      data: {
        questionnaireAssessmentId: assessmentId,
        formItemId: firstFormItemId,
        value: null,
        status: 'PENDING',
        revision: 0,
      },
    })

    const first = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [{ formItemId: firstFormItemId, value: 'existing row answer', expectedRevision: 0 }],
    })
    expect(first.statusCode).toBe(200)

    const answered = await prisma.questionnaireFormAnswer.findUnique({
      where: { id: pending.id },
    })
    expect(answered).toMatchObject({
      id: pending.id,
      questionnaireAssessmentId: assessmentId,
      formItemId: firstFormItemId,
      value: 'existing row answer',
      status: 'ANSWERED',
      revision: 1,
    })
    expect(answered?.createdAt).toEqual(pending.createdAt)

    const second = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [{ formItemId: firstFormItemId, value: 'existing row update', expectedRevision: 1 }],
    })
    expect(second.statusCode).toBe(200)

    const updated = await prisma.questionnaireFormAnswer.findUnique({
      where: { id: pending.id },
    })
    expect(updated).toMatchObject({
      id: pending.id,
      value: 'existing row update',
      status: 'ANSWERED',
      revision: 2,
    })
    expect(updated?.createdAt).toEqual(pending.createdAt)

    const assessment = await prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId } })
    expect(assessment?.completedForms).toBe(1)
  })

  it('persists only the final value when one batch repeats an item', async () => {
    const pending = await prisma.questionnaireFormAnswer.create({
      data: {
        questionnaireAssessmentId: assessmentId,
        formItemId: firstFormItemId,
        value: null,
        status: 'PENDING',
        revision: 0,
      },
    })

    const response = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [
        { formItemId: firstFormItemId, value: 'first value', expectedRevision: 0 },
        { formItemId: firstFormItemId, value: 'final value', expectedRevision: 1 },
      ],
    })
    expect(response.statusCode).toBe(200)

    const stored = await prisma.questionnaireFormAnswer.findUnique({ where: { id: pending.id } })
    expect(stored).toMatchObject({
      id: pending.id,
      value: 'final value',
      status: 'ANSWERED',
      revision: 2,
    })
    expect(stored?.createdAt).toEqual(pending.createdAt)

    const assessment = await prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId } })
    expect(assessment?.completedForms).toBe(1)
  })

  it('rejects a stale batch before writing any item in the batch', async () => {
    const initial = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [{ formItemId: firstFormItemId, value: 'original', expectedRevision: 0 }],
    })
    expect(initial.statusCode).toBe(200)

    const stale = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [
        { formItemId: firstFormItemId, value: 'replacement', expectedRevision: 0 },
        { formItemId: secondFormItemId, value: 'must not be persisted', expectedRevision: 0 },
      ],
    })
    expect(stale.statusCode).toBe(409)

    const stored = await prisma.questionnaireFormAnswer.findMany({
      where: { questionnaireAssessmentId: assessmentId },
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      formItemId: firstFormItemId,
      value: 'original',
      status: 'ANSWERED',
      revision: 1,
    })
  })

  it('persists context-bound values encrypted at rest in the bulk path', async () => {
    const response = await invoke(publicQuestionnaireController.submitFormAnswers, {
      answers: [{ formItemId: contextFormItemId, value: 'female', expectedRevision: 0 }],
    })
    expect(response.statusCode).toBe(200)

    const stored = await prisma.questionnaireFormAnswer.findUnique({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: assessmentId,
          formItemId: contextFormItemId,
        },
      },
    })
    expect(stored).toMatchObject({ status: 'ANSWERED', revision: 1 })
    expect(stored?.value).not.toBe('female')
    expect(readContextFormAnswer('sexAtBirth', stored?.value ?? '')).toBe('female')
  })

  it('never completes without the answer when answer and completion race', async () => {
    const [answer, completion] = await Promise.all([
      invoke(publicQuestionnaireController.submitFormAnswer, {
        formItemId: firstFormItemId,
        value: 'race answer',
        expectedRevision: 0,
      }),
      invoke(publicQuestionnaireController.completeAssessment),
    ])

    expect(answer.statusCode).toBe(200)
    expect([200, 409]).toContain(completion.statusCode)

    const [assessment, stored] = await Promise.all([
      prisma.questionnaireAssessment.findUnique({ where: { id: assessmentId } }),
      prisma.questionnaireFormAnswer.findUnique({
        where: {
          questionnaireAssessmentId_formItemId: {
            questionnaireAssessmentId: assessmentId,
            formItemId: firstFormItemId,
          },
        },
      }),
    ])

    expect(stored).toMatchObject({ value: 'race answer', status: 'ANSWERED', revision: 1 })
    if (assessment?.status === 'COMPLETED') {
      expect(completion.statusCode).toBe(200)
    } else {
      expect(assessment?.status).toBe('IN_PROGRESS')
      expect(completion.statusCode).toBe(409)
    }
  }, 60000)
})
