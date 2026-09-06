import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { freezeQuestionnaireActiveSlotSet, formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'
import { mapQuestionnaireSection } from '../../modules/assessment-runtime/form-section-definition'
import { submitUnifiedQuestionnaireFormSectionFinal } from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

/**
 * O1 coverage for the UNIFIED_V1 questionnaire FINAL strict answer update.
 * The suite is opt-in: it needs a real PostgreSQL to prove the two behaviours
 * mocks cannot — that UPDATE ... FROM (VALUES) touches exactly the pre-created
 * rows, and that a missing pre-created row fails closed with no partial FINAL
 * write left behind.
 */
const DB_URL = integrationDatabaseUrl('PR38_INTEGRATION_DATABASE_URL', 'PR34_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

const ITEM_COUNT = 3

type StrictUpdateFixture = {
  suffix: string
  userId: string
  questionnaireId: string
  sectionId: string
  formItemIds: string[]
  parentId: string
  sectionAttemptId: string
  sectionDefinitionHash: string
}

let db: PrismaClient
// Each case builds an independent fixture; every one is tracked so a shared
// or repeatedly-used integration database never accumulates orphan parents.
const fixtures: StrictUpdateFixture[] = []

const createFixture = async (): Promise<StrictUpdateFixture> => {
  const suffix = randomUUID()
  const fixture: StrictUpdateFixture = {
    suffix,
    userId: `o1-user-${suffix}`,
    questionnaireId: `o1-questionnaire-${suffix}`,
    sectionId: `o1-section-${suffix}`,
    formItemIds: [],
    parentId: `o1-parent-${suffix}`,
    sectionAttemptId: `o1-section-attempt-${suffix}`,
    sectionDefinitionHash: '',
  }

  await db.user.create({ data: { id: fixture.userId, username: `o1-${suffix}`, passwordHash: 'test-only', role: 'STUDENT' } })
  await db.questionnaire.create({
    data: {
      id: fixture.questionnaireId,
      code: `O1-STRICT-${suffix}`,
      name: 'O1 strict form update fixture',
      type: 'GENERAL',
      status: 'PUBLISHED',
      creatorId: fixture.userId,
    },
  })
  await db.questionnaireFormSection.create({
    data: {
      id: fixture.sectionId,
      questionnaireId: fixture.questionnaireId,
      title: 'O1 form section',
      position: 1,
      contextSection: false,
    },
  })
  const items = await Promise.all(Array.from({ length: ITEM_COUNT }, (_, index) => (
    db.questionnaireFormItem.create({
      data: {
        id: `o1-item-${suffix}-${index}`,
        questionnaireId: fixture.questionnaireId,
        sectionId: fixture.sectionId,
        sectionPosition: 0,
        type: 'text_input',
        label: `O1 answer ${index + 1}`,
        position: index,
        required: true,
      },
    })
  )))
  fixture.formItemIds = items.map((item) => item.id)

  const storedSection = await db.questionnaireFormSection.findUniqueOrThrow({
    where: { id: fixture.sectionId },
    include: { items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  fixture.sectionDefinitionHash = formSectionIdentityHash(mapQuestionnaireSection(storedSection))

  const slotSet = freezeQuestionnaireActiveSlotSet({
    attemptEpoch: 1,
    scales: [],
    cognitive: [],
    formSections: [{ sectionId: fixture.sectionId, definitionHash: fixture.sectionDefinitionHash }],
  })
  await db.questionnaireAssessment.create({
    data: {
      id: fixture.parentId,
      questionnaireId: fixture.questionnaireId,
      userId: fixture.userId,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      progress: 0,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
      frozenActiveSlotSetHash: slotSet.snapshotHash,
    },
  })
  await db.questionnaireFormSectionAttempt.create({
    data: {
      id: fixture.sectionAttemptId,
      questionnaireAssessmentId: fixture.parentId,
      sectionId: fixture.sectionId,
      status: 'IN_PROGRESS',
      attemptEpoch: 1,
    },
  })
  fixtures.push(fixture)
  return fixture
}

const preCreatePendingAnswers = async (fixture: StrictUpdateFixture, count: number): Promise<void> => {
  await db.questionnaireFormAnswer.createMany({
    data: fixture.formItemIds.slice(0, count).map((formItemId) => ({
      questionnaireAssessmentId: fixture.parentId,
      formItemId,
      status: 'PENDING' as const,
      revision: 0,
    })),
  })
}

const submitFinal = (fixture: StrictUpdateFixture): Promise<unknown> => submitUnifiedQuestionnaireFormSectionFinal({
  questionnaireAssessmentId: fixture.parentId,
  sectionId: fixture.sectionId,
  submissionId: `o1-submission-${fixture.suffix}`,
  attemptEpoch: 1,
  definitionHash: fixture.sectionDefinitionHash,
  answers: fixture.formItemIds.map((formItemId, index) => ({ formItemId, value: `final-${index}` })),
  userId: fixture.userId,
})

const snapshotCount = (parentId: string): Promise<number> => db.assessmentUnitSnapshot.count({
  where: { questionnaireAssessmentId: parentId },
})

suite('O1 UNIFIED questionnaire FINAL strict answer update (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY ?? 'a'.repeat(64)
    const database = await import('../../config/database')
    db = database.prisma
  })

  afterAll(async () => {
    if (!db) return
    try {
      for (const fixture of fixtures) {
        await db.assessmentUnitSnapshot.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
        await db.questionnaireFormAnswer.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
        await db.questionnaireFormSectionAttempt.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
        await db.questionnaireAssessment.deleteMany({ where: { id: fixture.parentId } })
        await db.questionnaire.deleteMany({ where: { id: fixture.questionnaireId } })
        await db.user.deleteMany({ where: { id: fixture.userId } })
      }
    } finally {
      await db.$disconnect()
    }
  })

  it('updates exactly the pre-created rows, completes the section, and writes one snapshot', async () => {
    const fixture = await createFixture()
    await preCreatePendingAnswers(fixture, ITEM_COUNT)

    const result = await submitFinal(fixture) as { replayed: boolean; sectionAttemptId: string }

    expect(result.replayed).toBe(false)
    expect(result.sectionAttemptId).toBe(fixture.sectionAttemptId)

    const sectionAttempt = await db.questionnaireFormSectionAttempt.findUniqueOrThrow({ where: { id: fixture.sectionAttemptId } })
    expect(sectionAttempt.status).toBe('COMPLETED')
    expect(sectionAttempt.submissionPayloadHash).toBeTruthy()

    const answers = await db.questionnaireFormAnswer.findMany({
      where: { questionnaireAssessmentId: fixture.parentId },
      orderBy: { formItemId: 'asc' },
    })
    expect(answers).toHaveLength(ITEM_COUNT)
    expect(answers.every((answer) => answer.status === 'ANSWERED' && answer.revision === 0)).toBe(true)
    expect(answers.map((answer) => answer.value).sort()).toEqual(['final-0', 'final-1', 'final-2'])

    expect(await snapshotCount(fixture.parentId)).toBe(1)
    const snapshot = await db.assessmentUnitSnapshot.findFirstOrThrow({ where: { questionnaireAssessmentId: fixture.parentId } })
    expect(snapshot).toMatchObject({
      slotKey: `form-section:${fixture.sectionId}`,
      unitType: 'FORM_SECTION',
      terminalState: 'COMPLETED',
      payloadKind: 'COLLECTION_FACTS',
    })
  })

  it('fails closed without partial FINAL writes when a pre-created row is missing', async () => {
    const fixture = await createFixture()
    // Invariant intentionally broken: 2 of 3 pre-created rows exist.
    await preCreatePendingAnswers(fixture, ITEM_COUNT - 1)

    await expect(submitFinal(fixture)).rejects.toMatchObject({
      name: 'InstrumentFinalSubmitError',
      code: 'STALE_ATTEMPT',
      statusCode: 409,
    } as Partial<InstrumentFinalSubmitError>)

    const sectionAttempt = await db.questionnaireFormSectionAttempt.findUniqueOrThrow({ where: { id: fixture.sectionAttemptId } })
    expect(sectionAttempt.status).toBe('IN_PROGRESS')
    expect(sectionAttempt.submissionId).toBeNull()

    const answers = await db.questionnaireFormAnswer.findMany({ where: { questionnaireAssessmentId: fixture.parentId } })
    expect(answers).toHaveLength(ITEM_COUNT - 1)
    expect(answers.every((answer) => answer.status === 'PENDING' && answer.value === null)).toBe(true)

    expect(await snapshotCount(fixture.parentId)).toBe(0)
    const parent = await db.questionnaireAssessment.findUniqueOrThrow({ where: { id: fixture.parentId } })
    expect(parent.status).toBe('IN_PROGRESS')
  })
})
