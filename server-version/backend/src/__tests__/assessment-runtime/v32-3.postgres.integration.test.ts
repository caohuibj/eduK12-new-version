import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { freezeQuestionnaireActiveSlotSet } from '../../modules/assessment-runtime/attempt-runtime'
import { encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'

const databaseUrl = integrationDatabaseUrl('V32_3_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip

const scaleDefinition = (): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'V32-3 PostgreSQL fixture', citation: 'v32-3.postgres.integration.test' },
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
    itemCode: 'v32-3-item-1',
    content: 'V32-3 fixture item',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode: 'v32-3-item-1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: { type: 'items', items: [{ itemCode: 'v32-3-item-1', weight: 1 }], aggregation: 'sum' },
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
      summary: 'V32-3 fixture result',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: 'V32-3 fixture only.',
  },
  referencePolicy: { type: 'none' },
})

let db: PrismaClient | null = null
let submitScaleAssessmentFinal: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let activateScaleAdmission: typeof import('../../modules/scale/scale-admission.service')['activateScaleAdmission']
let UNIFIED_SCALE_CHILD_ADMISSION_SELECT: typeof import('../../modules/scale/scale-admission.service')['UNIFIED_SCALE_CHILD_ADMISSION_SELECT']
let getQuestionnaireFinalAttemptState: typeof import('../../services/questionnaire-form-section.service')['getQuestionnaireFinalAttemptState']

const createdUserIds: string[] = []
const createdScaleIds: string[] = []
const createdAssessmentIds: string[] = []
const createdQuestionnaireIds: string[] = []
const createdParentIds: string[] = []

suite('V32-3 frozen unit admission PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    submitScaleAssessmentFinal = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
    const admission = await import('../../modules/scale/scale-admission.service')
    activateScaleAdmission = admission.activateScaleAdmission
    UNIFIED_SCALE_CHILD_ADMISSION_SELECT = admission.UNIFIED_SCALE_CHILD_ADMISSION_SELECT
    getQuestionnaireFinalAttemptState = (await import('../../services/questionnaire-form-section.service')).getQuestionnaireFinalAttemptState
  }, 30_000)

  afterAll(async () => {
    if (db) {
      await db.assessmentUnitSnapshot.deleteMany({ where: { questionnaireAssessmentId: { in: createdParentIds } } })
      await db.assessment.deleteMany({ where: { id: { in: createdAssessmentIds } } })
      await db.questionnaireAssessment.deleteMany({ where: { id: { in: createdParentIds } } })
      await db.questionnaireScale.deleteMany({ where: { questionnaireId: { in: createdQuestionnaireIds } } })
      await db.questionnaire.deleteMany({ where: { id: { in: createdQuestionnaireIds } } })
      await db.scale.deleteMany({ where: { id: { in: createdScaleIds } } })
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
      await db.$disconnect()
    }
    db = null
  })

  const createUserAndScale = async (suffix: string) => {
    if (!db) throw new Error('V32-3 database is not connected')
    const userId = `v32-3-user-${suffix}`
    const scaleId = `v32-3-scale-${suffix}`
    const definition = scaleDefinition()
    const definitionHash = hashScaleDefinition(definition)
    const scaleCode = `V32-3-SCALE-${suffix}`
    await db.user.create({ data: { id: userId, username: `v32-3-${suffix}`, passwordHash: 'v32-3-fixture-only' } })
    createdUserIds.push(userId)
    const scale = await db.scale.create({
      data: {
        id: scaleId,
        code: scaleCode,
        name: 'V32-3 fixture scale',
        creatorId: userId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '2.0.0',
        definition: definition as Prisma.InputJsonValue,
        definitionHash,
        itemCount: 1,
        dimensionCount: 1,
      },
    })
    createdScaleIds.push(scale.id)
    const runtime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: scale.code,
      instrumentVersion: scale.instrumentVersion,
      definition,
    })
    return { userId, scale, definition, definitionHash, runtime }
  }

  const createQuestionnaireChild = async (suffix: string, deliveryMode: 'FINAL_ONLY' | 'LEGACY' = 'FINAL_ONLY') => {
    const fixture = await createUserAndScale(suffix)
    const questionnaireId = `v32-3-q-${suffix}`
    const questionnaireScaleId = `v32-3-qs-${suffix}`
    const parentId = `v32-3-parent-${suffix}`
    const assessmentId = `v32-3-child-${suffix}`
    await db!.questionnaire.create({
      data: {
        id: questionnaireId,
        code: `v32-3-${suffix}`,
        name: 'V32-3 fixture questionnaire',
        type: 'GENERAL',
        status: 'PUBLISHED',
        creatorId: fixture.userId,
      },
    })
    createdQuestionnaireIds.push(questionnaireId)
    await db!.questionnaireScale.create({
      data: {
        id: questionnaireScaleId,
        questionnaireId,
        scaleId: fixture.scale.id,
        position: 0,
      },
    })
    const slotSet = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 1,
      scales: [{
        questionnaireScaleId,
        code: fixture.scale.code,
        instrumentVersion: fixture.scale.instrumentVersion,
        sourceDefinitionHash: fixture.runtime.sourceDefinitionHash,
        compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
      }],
      formSections: [],
    })
    await db!.questionnaireAssessment.create({
      data: {
        id: parentId,
        questionnaireId,
        userId: fixture.userId,
        status: 'IN_PROGRESS',
        deliveryMode,
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
        frozenActiveSlotSetHash: slotSet.snapshotHash,
      },
    })
    createdParentIds.push(parentId)
    await db!.assessment.create({
      data: {
        id: assessmentId,
        scaleId: fixture.scale.id,
        userId: fixture.userId,
        questionnaireAssessmentId: parentId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(fixture.runtime),
        compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: 1,
        progress: 0,
      },
    })
    createdAssessmentIds.push(assessmentId)
    const child = await db!.assessment.findUnique({
      where: { id: assessmentId },
      select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
    })
    if (!child) throw new Error('V32-3 child fixture is missing')
    return { ...fixture, questionnaireId, questionnaireScaleId, parentId, assessmentId, child }
  }

  it('persists a standalone frozen admission on first submit and reuses it on replay', async () => {
    const suffix = randomUUID()
    const fixture = await createUserAndScale(suffix)
    const assessmentId = `v32-3-standalone-${suffix}`
    await db!.assessment.create({
      data: {
        id: assessmentId,
        scaleId: fixture.scale.id,
        userId: fixture.userId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(fixture.runtime),
        compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: 1,
        progress: 0,
      },
    })
    createdAssessmentIds.push(assessmentId)

    const input = {
      assessmentId,
      submissionId: `v32-3-standalone-${suffix}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' as const }],
      userId: fixture.userId,
    }
    const submitted = await submitScaleAssessmentFinal(input)
    expect(submitted.replayed).toBe(false)

    const stored = await db!.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        status: true,
        frozenAdmissionSnapshotEncrypted: true,
        frozenAdmissionSnapshotHash: true,
      },
    })
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      frozenAdmissionSnapshotHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(stored?.frozenAdmissionSnapshotEncrypted).toEqual(expect.any(String))

    const replayed = await submitScaleAssessmentFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(await db!.assessment.findUnique({
      where: { id: assessmentId },
      select: { frozenAdmissionSnapshotHash: true },
    })).toEqual({ frozenAdmissionSnapshotHash: stored?.frozenAdmissionSnapshotHash })
  })

  it('converges concurrent activate-once writes to a single stored admission hash', async () => {
    const suffix = randomUUID()
    const fixture = await createUserAndScale(suffix)
    const assessmentId = `v32-3-race-${suffix}`
    await db!.assessment.create({
      data: {
        id: assessmentId,
        scaleId: fixture.scale.id,
        userId: fixture.userId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(fixture.runtime),
        compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: 1,
        progress: 0,
      },
    })
    createdAssessmentIds.push(assessmentId)
    const child = await db!.assessment.findUnique({
      where: { id: assessmentId },
      select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
    })
    if (!child) throw new Error('V32-3 race fixture is missing')

    const [first, second] = await Promise.all([
      activateScaleAdmission(child),
      activateScaleAdmission(child),
    ])
    const stored = await db!.assessment.findUnique({
      where: { id: assessmentId },
      select: { frozenAdmissionSnapshotHash: true },
    })
    expect(stored?.frozenAdmissionSnapshotHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.snapshotHash === stored?.frozenAdmissionSnapshotHash
      || second.snapshotHash === stored?.frozenAdmissionSnapshotHash).toBe(true)
    expect(new Set([first.snapshotHash, second.snapshotHash, stored?.frozenAdmissionSnapshotHash]).size).toBeLessThanOrEqual(2)
  })

  it('keeps parent lifecycle on CAS and rejects submit after the parent is no longer in progress', async () => {
    const suffix = randomUUID()
    const fixture = await createQuestionnaireChild(suffix)
    const admission = await activateScaleAdmission(fixture.child)
    expect(admission.parent).toMatchObject({
      kind: 'questionnaire',
      parentId: fixture.parentId,
      slotKey: `scale:${fixture.questionnaireScaleId}`,
      compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
    })

    await db!.questionnaireAssessment.update({
      where: { id: fixture.parentId },
      data: { status: 'COMPLETED' },
    })

    await expect(submitScaleAssessmentFinal({
      assessmentId: fixture.assessmentId,
      submissionId: `v32-3-cas-${suffix}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' }],
      userId: fixture.userId,
    })).rejects.toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 409 })

    expect(await db!.assessment.findUnique({
      where: { id: fixture.assessmentId },
      select: { status: true, submissionId: true, frozenAdmissionSnapshotHash: true },
    })).toMatchObject({
      status: 'IN_PROGRESS',
      submissionId: null,
      frozenAdmissionSnapshotHash: admission.snapshotHash,
    })
  })

  it('hard-rejects a UNIFIED parent that is not FINAL_ONLY before freezing admission', async () => {
    const suffix = randomUUID()
    const fixture = await createQuestionnaireChild(suffix, 'LEGACY')
    await expect(activateScaleAdmission(fixture.child)).rejects.toMatchObject({
      code: 'LEGACY_WRITE_DISABLED',
      statusCode: 410,
    })
    await expect(submitScaleAssessmentFinal({
      assessmentId: fixture.assessmentId,
      submissionId: `v32-3-legacy-${suffix}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' }],
      userId: fixture.userId,
    })).rejects.toMatchObject({ code: 'LEGACY_WRITE_DISABLED', statusCode: 410 })
    expect(await db!.assessment.findUnique({
      where: { id: fixture.assessmentId },
      select: { frozenAdmissionSnapshotHash: true, status: true },
    })).toEqual({ frozenAdmissionSnapshotHash: null, status: 'IN_PROGRESS' })
  })

  it('freezes questionnaire Scale admission when the current unit is delivered', async () => {
    const suffix = randomUUID()
    const fixture = await createQuestionnaireChild(suffix)
    expect(await db!.assessment.findUnique({
      where: { id: fixture.assessmentId },
      select: { frozenAdmissionSnapshotHash: true },
    })).toEqual({ frozenAdmissionSnapshotHash: null })

    const state = await getQuestionnaireFinalAttemptState(fixture.parentId)
    expect(state.currentScale).toMatchObject({
      scaleAssessmentId: fixture.assessmentId,
      definitionHash: fixture.definitionHash,
    })
    const stored = await db!.assessment.findUnique({
      where: { id: fixture.assessmentId },
      select: { frozenAdmissionSnapshotHash: true },
    })
    expect(stored?.frozenAdmissionSnapshotHash).toMatch(/^[0-9a-f]{64}$/)

    const submitted = await submitScaleAssessmentFinal({
      assessmentId: fixture.assessmentId,
      submissionId: `v32-3-delivery-${suffix}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' }],
      userId: fixture.userId,
    })
    expect(submitted.replayed).toBe(false)
    expect(await db!.assessment.findUnique({
      where: { id: fixture.assessmentId },
      select: { status: true, frozenAdmissionSnapshotHash: true },
    })).toMatchObject({
      status: 'COMPLETED',
      frozenAdmissionSnapshotHash: stored?.frozenAdmissionSnapshotHash,
    })
  })

  it('leaves the parent in progress after a non-last child submit and completes it on GET after the last child', async () => {
    const suffix = randomUUID()
    const first = await createQuestionnaireChild(`${suffix}-a`)
    const secondScale = await createUserAndScale(`${suffix}-b`)
    const secondQuestionnaireScaleId = `v32-3-qs-${suffix}-b`
    const secondAssessmentId = `v32-3-child-${suffix}-b`
    await db!.questionnaireScale.create({
      data: {
        id: secondQuestionnaireScaleId,
        questionnaireId: first.questionnaireId,
        scaleId: secondScale.scale.id,
        position: 1,
      },
    })
    const slotSet = freezeQuestionnaireActiveSlotSet({
      attemptEpoch: 1,
      scales: [
        {
          questionnaireScaleId: first.questionnaireScaleId,
          code: first.scale.code,
          instrumentVersion: first.scale.instrumentVersion,
          sourceDefinitionHash: first.runtime.sourceDefinitionHash,
          compiledRuntimeHash: first.runtime.compiledRuntime.compiledRuntimeHash,
        },
        {
          questionnaireScaleId: secondQuestionnaireScaleId,
          code: secondScale.scale.code,
          instrumentVersion: secondScale.scale.instrumentVersion,
          sourceDefinitionHash: secondScale.runtime.sourceDefinitionHash,
          compiledRuntimeHash: secondScale.runtime.compiledRuntime.compiledRuntimeHash,
        },
      ],
      formSections: [],
    })
    await db!.questionnaireAssessment.update({
      where: { id: first.parentId },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
        frozenActiveSlotSetHash: slotSet.snapshotHash,
      },
    })
    await db!.assessment.create({
      data: {
        id: secondAssessmentId,
        scaleId: secondScale.scale.id,
        userId: first.userId,
        questionnaireAssessmentId: first.parentId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(secondScale.runtime),
        compiledRuntimeHash: secondScale.runtime.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: 1,
        progress: 0,
      },
    })
    createdAssessmentIds.push(secondAssessmentId)

    await submitScaleAssessmentFinal({
      assessmentId: first.assessmentId,
      submissionId: `v32-3-first-${suffix}`,
      attemptEpoch: 1,
      definitionHash: first.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' }],
      userId: first.userId,
    })
    expect(await db!.questionnaireAssessment.findUnique({
      where: { id: first.parentId },
      select: { status: true },
    })).toEqual({ status: 'IN_PROGRESS' })
    const afterFirst = await getQuestionnaireFinalAttemptState(first.parentId)
    expect(afterFirst.questionnaireAssessment.status).toBe('IN_PROGRESS')
    expect(afterFirst.completedItems).toBe(1)
    expect(afterFirst.totalItems).toBe(2)

    await submitScaleAssessmentFinal({
      assessmentId: secondAssessmentId,
      submissionId: `v32-3-last-${suffix}`,
      attemptEpoch: 1,
      definitionHash: secondScale.definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-3-item-1', responseValue: 'yes' }],
      userId: first.userId,
    })
    expect(await db!.questionnaireAssessment.findUnique({
      where: { id: first.parentId },
      select: { status: true },
    })).toEqual({ status: 'IN_PROGRESS' })
    const afterLast = await getQuestionnaireFinalAttemptState(first.parentId)
    expect(afterLast.questionnaireAssessment).toMatchObject({ status: 'COMPLETED', progress: 100 })
    expect(await db!.questionnaireAssessment.findUnique({
      where: { id: first.parentId },
      select: { status: true, progress: true },
    })).toEqual({ status: 'COMPLETED', progress: 100 })
  })
})
