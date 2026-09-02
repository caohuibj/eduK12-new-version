import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'

const databaseUrl = integrationDatabaseUrl('V32_1_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip

const fixture = {
  userId: 'v32-1-fixture-user',
  questionnaireId: 'v32-1-fixture-questionnaire',
  questionnaireAssessmentId: 'v32-1-fixture-questionnaire-assessment',
  compositeId: 'v32-1-fixture-composite',
  compositeAttemptId: 'v32-1-fixture-composite-attempt',
  scaleId: 'v32-1-fixture-scale',
  assessmentId: 'v32-1-fixture-unified-assessment',
}

let db: PrismaClient | null = null
let submitScaleAssessmentFinal: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let freezeScaleRuntimeAtAttemptStart: typeof import('../../modules/assessment-runtime/runtime-snapshot')['freezeScaleRuntimeAtAttemptStart']
let encryptFrozenScaleRuntimeSnapshot: typeof import('../../modules/assessment-runtime/runtime-snapshot')['encryptFrozenScaleRuntimeSnapshot']
let submitCognitiveSessionFinal: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinal']
let submitUnifiedCognitiveSessionFinal: typeof import('../../modules/cognitive/unified-final-submit.service')['submitUnifiedCognitiveSessionFinal']
let createUnifiedCognitiveSessionConfigSnapshot: typeof import('../../modules/cognitive/session.service')['createUnifiedCognitiveSessionConfigSnapshot']
let readCognitiveSessionConfig: typeof import('../../modules/cognitive/session.service')['readCognitiveSessionConfig']
let freezeCompositeActiveSlotSet: typeof import('../../modules/assessment-runtime/attempt-runtime')['freezeCompositeActiveSlotSet']
let encryptFrozenActiveSlotSet: typeof import('../../modules/assessment-runtime/slot-set')['encryptFrozenActiveSlotSet']
let submitCompositeFormSectionFinal: typeof import('../../modules/composite/final-submit.service')['submitCompositeFormSectionFinal']
let mapCompositeSection: typeof import('../../modules/composite/final-submit.service')['mapCompositeSection']
let compositeFormSectionDefinitionHash: typeof import('../../modules/composite/final-submit.service')['compositeFormSectionDefinitionHash']

const extraCompositeIds: string[] = []
const extraCompositeAttemptIds: string[] = []
const extraCognitiveConfigIds: string[] = []
const extraCognitiveSessionIds: string[] = []

const fakeCognitiveConfig = {
  trialCount: 3,
  trialDurationMs: 1000,
  allowPractice: false,
  maxRtMs: 60000,
}

const fakeCognitiveTrials = () => Array.from({ length: fakeCognitiveConfig.trialCount }, (_, trialIndex) => (
  createTrialEnvelope({
    trialIndex,
    phase: 'test',
    startedAtPerfMs: trialIndex * 1000,
    endedAtPerfMs: trialIndex * 1000 + 420,
    payload: { correct: trialIndex !== 1, rtMs: 420 },
  })
))

const unifiedScaleDefinition = (): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'V32-1 PostgreSQL fixture', citation: 'v32-1.postgres.integration.test' },
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
    itemCode: 'v32-1-item-1',
    content: 'V32-1 fixture item',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode: 'v32-1-item-1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: { type: 'items', items: [{ itemCode: 'v32-1-item-1', weight: 1 }], aggregation: 'sum' },
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
      summary: 'V32-1 fixture result',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: 'V32-1 fixture only.',
  },
  referencePolicy: { type: 'none' },
})

suite('V32-1 additive PostgreSQL migration and constraints', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    submitScaleAssessmentFinal = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
    const runtimeSnapshot = await import('../../modules/assessment-runtime/runtime-snapshot')
    freezeScaleRuntimeAtAttemptStart = runtimeSnapshot.freezeScaleRuntimeAtAttemptStart
    encryptFrozenScaleRuntimeSnapshot = runtimeSnapshot.encryptFrozenScaleRuntimeSnapshot
    submitCognitiveSessionFinal = (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal
    submitUnifiedCognitiveSessionFinal = (await import('../../modules/cognitive/unified-final-submit.service')).submitUnifiedCognitiveSessionFinal
    const cognitiveSession = await import('../../modules/cognitive/session.service')
    createUnifiedCognitiveSessionConfigSnapshot = cognitiveSession.createUnifiedCognitiveSessionConfigSnapshot
    readCognitiveSessionConfig = cognitiveSession.readCognitiveSessionConfig
    freezeCompositeActiveSlotSet = (await import('../../modules/assessment-runtime/attempt-runtime')).freezeCompositeActiveSlotSet
    encryptFrozenActiveSlotSet = (await import('../../modules/assessment-runtime/slot-set')).encryptFrozenActiveSlotSet
    const compositeFinalSubmit = await import('../../modules/composite/final-submit.service')
    submitCompositeFormSectionFinal = compositeFinalSubmit.submitCompositeFormSectionFinal
    mapCompositeSection = compositeFinalSubmit.mapCompositeSection
    compositeFormSectionDefinitionHash = compositeFinalSubmit.compositeFormSectionDefinitionHash
    const username = `v32-1-${randomUUID()}`
    await db.user.create({
      data: {
        id: fixture.userId,
        username,
        passwordHash: 'v32-1-fixture-only',
      },
    })
    await db.questionnaire.create({
      data: {
        id: fixture.questionnaireId,
        code: `v32-1-${randomUUID()}`,
        name: 'V32-1 fixture questionnaire',
        creatorId: fixture.userId,
      },
    })
    await db.questionnaireAssessment.create({
      data: {
        id: fixture.questionnaireAssessmentId,
        questionnaireId: fixture.questionnaireId,
      },
    })
    await db.compositeAssessment.create({
      data: {
        id: fixture.compositeId,
        code: `v32-1-${randomUUID()}`,
        name: 'V32-1 fixture composite',
        createdBy: fixture.userId,
      },
    })
    await db.compositeAssessmentAttempt.create({
      data: {
        id: fixture.compositeAttemptId,
        compositeAssessmentId: fixture.compositeId,
        participantKey: `v32-1-${randomUUID()}`,
      },
    })
  })

  const createEmbeddedCognitiveFixture = async () => {
    const suffix = randomUUID()
    const composite = await db!.compositeAssessment.create({
      data: {
        id: `v32-1-cognitive-composite-${suffix}`,
        code: `v32-1-cognitive-${suffix}`,
        name: 'V32-1 embedded Cognitive fixture',
        status: 'PUBLISHED',
        createdBy: fixture.userId,
      },
    })
    extraCompositeIds.push(composite.id)
    const attempt = await db!.compositeAssessmentAttempt.create({
      data: {
        id: `v32-1-cognitive-attempt-${suffix}`,
        compositeAssessmentId: composite.id,
        userId: fixture.userId,
        participantKey: `v32-1-cognitive-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    extraCompositeAttemptIds.push(attempt.id)
    const config = await db!.cognitiveTestConfig.create({
      data: {
        id: `v32-1-cognitive-config-${suffix}`,
        testType: 'fake',
        configVersion: `v32-1-${suffix}`,
        name: 'V32-1 fake Cognitive fixture',
        config: fakeCognitiveConfig as Prisma.InputJsonValue,
        status: 'PUBLISHED',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        accessPolicy: 'OPEN',
      },
    })
    extraCognitiveConfigIds.push(config.id)
    const item = await db!.compositeAssessmentItem.create({
      data: {
        id: `v32-1-cognitive-item-${suffix}`,
        compositeAssessmentId: composite.id,
        type: 'COGNITIVE',
        position: 0,
        required: true,
      },
    })
    const runtimeSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
      testType: config.testType,
      configVersion: config.configVersion,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      config: fakeCognitiveConfig,
      db: db as any,
    })
    const storedSnapshot = readCognitiveSessionConfig(runtimeSnapshot.encrypted).snapshot
    if (!storedSnapshot) throw new Error('V32-1 Cognitive runtime snapshot is missing')
    const frozenActiveSlotSet = freezeCompositeActiveSlotSet({
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
    await db!.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozenActiveSlotSet),
        frozenActiveSlotSetHash: frozenActiveSlotSet.snapshotHash,
      },
    })
    const session = await db!.cognitiveSession.create({
      data: {
        id: `v32-1-cognitive-session-${suffix}`,
        userId: fixture.userId,
        participantKey: `v32-1-cognitive-session-participant-${suffix}`,
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
        randomSeed: `v32-1-seed-${suffix}`,
      },
    })
    extraCognitiveSessionIds.push(session.id)
    return {
      composite,
      attempt,
      config,
      item,
      session,
      runtimeSnapshot,
      definitionHash: storedSnapshot.configHash,
      userId: fixture.userId,
    }
  }

  const createUnifiedFormFixture = async () => {
    const suffix = randomUUID()
    const composite = await db!.compositeAssessment.create({
      data: {
        id: `v32-1-form-composite-${suffix}`,
        code: `v32-1-form-${suffix}`,
        name: 'V32-1 unified form fixture',
        status: 'PUBLISHED',
        createdBy: fixture.userId,
      },
    })
    extraCompositeIds.push(composite.id)
    const section = await db!.compositeFormSection.create({
      data: {
        id: `v32-1-form-section-${suffix}`,
        compositeAssessmentId: composite.id,
        title: 'V32-1 form section',
        position: 0,
        contextSection: false,
      },
    })
    const item = await db!.compositeAssessmentItem.create({
      data: {
        id: `v32-1-form-item-${suffix}`,
        compositeAssessmentId: composite.id,
        type: 'FORM',
        position: 0,
        required: true,
        formType: 'text_input',
        formLabel: 'V32-1 form answer',
        formSectionId: section.id,
        formSectionPosition: 0,
      },
    })
    const attempt = await db!.compositeAssessmentAttempt.create({
      data: {
        id: `v32-1-form-attempt-${suffix}`,
        compositeAssessmentId: composite.id,
        userId: fixture.userId,
        participantKey: `v32-1-form-participant-${suffix}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
      },
    })
    extraCompositeAttemptIds.push(attempt.id)
    const storedSection = await db!.compositeFormSection.findUnique({
      where: { id: section.id },
      include: { items: true },
    })
    if (!storedSection) throw new Error('V32-1 form section fixture is missing')
    const mappedSection = mapCompositeSection(storedSection)
    const definitionHash = formSectionIdentityHash(mappedSection)
    const frozenActiveSlotSet = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [],
      cognitive: [],
      formSections: [{ sectionId: section.id, definitionHash }],
    })
    await db!.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozenActiveSlotSet),
        frozenActiveSlotSetHash: frozenActiveSlotSet.snapshotHash,
      },
    })
    return { composite, section, item, attempt, definitionHash, userId: fixture.userId }
  }

  afterAll(async () => {
    if (!db) return
    if (extraCognitiveSessionIds.length) {
      await db.cognitiveSession.deleteMany({ where: { id: { in: extraCognitiveSessionIds } } })
    }
    if (extraCompositeAttemptIds.length) {
      await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: extraCompositeAttemptIds } } })
    }
    if (extraCompositeIds.length) {
      await db.compositeAssessment.deleteMany({ where: { id: { in: extraCompositeIds } } })
    }
    if (extraCognitiveConfigIds.length) {
      await db.cognitiveTestConfig.deleteMany({ where: { id: { in: extraCognitiveConfigIds } } })
    }
    await db.assessmentUnitSnapshot.deleteMany({
      where: {
        OR: [
          { questionnaireAssessmentId: fixture.questionnaireAssessmentId },
          { compositeAttemptId: fixture.compositeAttemptId },
        ],
      },
    })
    await db.compositeAssessmentAttempt.deleteMany({ where: { id: fixture.compositeAttemptId } })
    await db.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
    await db.assessment.deleteMany({ where: { id: fixture.assessmentId } })
    await db.scale.deleteMany({ where: { id: fixture.scaleId } })
    await db.questionnaireAssessment.deleteMany({ where: { id: fixture.questionnaireAssessmentId } })
    await db.questionnaire.deleteMany({ where: { id: fixture.questionnaireId } })
    await db.user.deleteMany({ where: { id: fixture.userId } })
    await db.$disconnect()
    db = null
  })

  it('creates the additive runtime types, columns, indexes, and one-parent check', async () => {
    const columns = await db!.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name IN ('assessments', 'questionnaire_assessments', 'composite_assessment_attempts', 'cognitive_sessions', 'cognitive_raw_submissions', 'assessment_unit_snapshots')
    `)
    const columnNames = columns.map((row) => row.column_name)
    expect(columnNames).toEqual(expect.arrayContaining([
      'runtime_generation',
      'runtime_snapshot_encrypted',
      'compiled_runtime_hash',
      'frozen_active_slot_set_encrypted',
      'frozen_active_slot_set_hash',
      'payload_encrypted',
      'canonical_result_encrypted',
      'collection_facts_encrypted',
    ]))

    const enumRows = await db!.$queryRaw<Array<{ typname: string; enumlabel: string }>>(Prisma.sql`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('RuntimeGeneration', 'AssessmentUnitType', 'AssessmentUnitTerminalState', 'AssessmentUnitPayloadKind')
      ORDER BY t.typname, e.enumsortorder
    `)
    const enumValues = new Map<string, string[]>()
    for (const row of enumRows) enumValues.set(row.typname, [...(enumValues.get(row.typname) ?? []), row.enumlabel])
    expect(enumValues.get('RuntimeGeneration')).toEqual(['LEGACY', 'UNIFIED_V1'])
    expect(enumValues.get('AssessmentUnitType')).toEqual(['SCALE', 'COGNITIVE', 'FORM_SECTION'])
    expect(enumValues.get('AssessmentUnitTerminalState')).toEqual(['COMPLETED', 'SKIPPED', 'NOT_APPLICABLE'])
    expect(enumValues.get('AssessmentUnitPayloadKind')).toEqual(['UNIT_RESULT', 'COLLECTION_FACTS', 'NONE'])

    const checkRows = await db!.$queryRaw<Array<{ definition: string }>>(Prisma.sql`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'assessment_unit_snapshots_one_parent_check'
    `)
    expect(checkRows).toHaveLength(1)
    expect(checkRows[0].definition).toContain('questionnaire_assessment_id')
    expect(checkRows[0].definition).toContain('composite_attempt_id')

    const indexes = await db!.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'assessment_unit_snapshots'
    `)
    expect(indexes.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'assessment_unit_snapshots_questionnaire_slot_key',
      'assessment_unit_snapshots_composite_slot_key',
      'assessment_unit_snapshots_questionnaire_source_key',
      'assessment_unit_snapshots_composite_source_key',
    ]))
  })

  it('rejects zero-parent, two-parent, and duplicate terminal snapshots', async () => {
    const base = {
      attemptEpoch: 1,
      slotKey: 'scale:v32-1',
      unitType: 'SCALE' as const,
      terminalState: 'COMPLETED' as const,
      payloadKind: 'NONE' as const,
      sourceType: 'V32_1_TEST',
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
    }

    await expect(db!.assessmentUnitSnapshot.create({
      data: { ...base, sourceAttemptId: 'zero-parent' },
    })).rejects.toThrow()

    await expect(db!.assessmentUnitSnapshot.create({
      data: {
        ...base,
        sourceAttemptId: 'two-parents',
        questionnaireAssessmentId: fixture.questionnaireAssessmentId,
        compositeAttemptId: fixture.compositeAttemptId,
      },
    })).rejects.toThrow()

    await db!.assessmentUnitSnapshot.create({
      data: {
        ...base,
        sourceAttemptId: 'source-1',
        questionnaireAssessmentId: fixture.questionnaireAssessmentId,
      },
    })

    await expect(db!.assessmentUnitSnapshot.create({
      data: {
        ...base,
        sourceAttemptId: 'source-2',
        questionnaireAssessmentId: fixture.questionnaireAssessmentId,
      },
    })).rejects.toThrow()

    await expect(db!.assessmentUnitSnapshot.create({
      data: {
        ...base,
        slotKey: 'scale:v32-1-other',
        sourceAttemptId: 'source-1',
        questionnaireAssessmentId: fixture.questionnaireAssessmentId,
      },
    })).rejects.toThrow()
  })

  it('runs a unified standalone Scale final submit on real PostgreSQL', async () => {
    const definition = unifiedScaleDefinition()
    const definitionHash = hashScaleDefinition(definition)
    const scale = await db!.scale.create({
      data: {
        id: fixture.scaleId,
        code: 'V32-1-FIXTURE-SCALE',
        name: 'V32-1 fixture scale',
        creatorId: fixture.userId,
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
    const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(db!, {
      instrumentKey: scale.code,
      instrumentVersion: scale.instrumentVersion,
      definition,
    })
    await db!.assessment.create({
      data: {
        id: fixture.assessmentId,
        scaleId: scale.id,
        userId: fixture.userId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot),
        compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: 1,
        progress: 0,
      },
    })

    const input = {
      assessmentId: fixture.assessmentId,
      submissionId: `v32-1-scale-final-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash,
      contextSnapshotHash: null,
      answers: [{ itemCode: 'v32-1-item-1', responseValue: 'yes' }],
      userId: fixture.userId,
    }
    const submitted = await submitScaleAssessmentFinal(input)
    expect(submitted.replayed).toBe(false)
    expect(submitted.assessment).toMatchObject({
      id: fixture.assessmentId,
      status: 'COMPLETED',
      deliveryMode: 'FINAL_ONLY',
      progress: 100,
      submissionId: input.submissionId,
    })

    const row = await db!.assessment.findUnique({ where: { id: fixture.assessmentId } })
    expect(row).toMatchObject({
      status: 'COMPLETED',
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
      submissionId: input.submissionId,
      progress: 100,
    })
    expect(typeof row?.answers).toBe('string')
    expect(typeof row?.result).toBe('string')
    expect(typeof row?.runtimeSnapshotEncrypted).toBe('string')
    expect(await db!.assessmentUnitSnapshot.count({ where: { sourceAttemptId: fixture.assessmentId } })).toBe(0)

    const replayed = await submitScaleAssessmentFinal(input)
    expect(replayed.replayed).toBe(true)
  })

  it('runs an embedded Unified Cognitive final submit and idempotent replay on real PostgreSQL', async () => {
    const fixture = await createEmbeddedCognitiveFixture()
    const input = {
      sessionId: fixture.session.id,
      submissionId: `v32-1-cognitive-final-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      trials: fakeCognitiveTrials(),
    }

    const submitted = await submitCognitiveSessionFinal(fixture.userId, input)
    expect(submitted.replayed).toBe(false)
    expect(submitted.response).toMatchObject({ sessionId: fixture.session.id, status: 'COMPLETED' })

    const [session, parent, rawCount, snapshotCount] = await Promise.all([
      db!.cognitiveSession.findUnique({ where: { id: fixture.session.id } }),
      db!.compositeAssessmentAttempt.findUnique({ where: { id: fixture.attempt.id } }),
      db!.cognitiveRawSubmission.count({ where: { sessionId: fixture.session.id } }),
      db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.attempt.id, sourceAttemptId: fixture.session.id } }),
    ])
    expect(session).toMatchObject({ status: 'COMPLETED', runtimeGeneration: 'UNIFIED_V1', submissionId: input.submissionId })
    expect(parent).toMatchObject({ status: 'COMPLETED', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, progress: 100 })
    expect(rawCount).toBe(1)
    expect(snapshotCount).toBe(1)

    const replayed = await submitCognitiveSessionFinal(fixture.userId, input)
    expect(replayed.replayed).toBe(true)
    expect(await db!.cognitiveRawSubmission.count({ where: { sessionId: fixture.session.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.attempt.id, sourceAttemptId: fixture.session.id } })).toBe(1)
  })

  it('rejects an embedded Unified Cognitive submit after the parent epoch changes and rolls back raw data', async () => {
    const fixture = await createEmbeddedCognitiveFixture()
    const admission = await db!.cognitiveSession.findUnique({
      where: { id: fixture.session.id },
      select: {
        id: true,
        userId: true,
        compositeAttemptId: true,
        compositeItemId: true,
        recoveryTokenHash: true,
        testType: true,
        attemptNo: true,
        status: true,
        deliveryMode: true,
        runtimeGeneration: true,
        compiledRuntimeHash: true,
        configVersion: true,
        configSnapshotEncrypted: true,
        engineVersion: true,
        scoringVersion: true,
        randomSeed: true,
        assignmentId: true,
        resultSnapshotEncrypted: true,
        submissionId: true,
        submissionPayloadHash: true,
        compositeAttempt: {
          select: {
            userId: true,
            recoveryTokenHash: true,
            status: true,
            deliveryMode: true,
            attemptEpoch: true,
            contextSnapshotHash: true,
            frozenActiveSlotSetEncrypted: true,
            frozenActiveSlotSetHash: true,
            compositeAssessment: {
              select: {
                formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } },
              },
            },
          },
        },
      },
    })
    if (!admission) throw new Error('V32-1 Cognitive admission fixture is missing')
    await db!.compositeAssessmentAttempt.update({ where: { id: fixture.attempt.id }, data: { attemptEpoch: 2 } })

    const input = {
      sessionId: fixture.session.id,
      submissionId: `v32-1-cognitive-stale-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      trials: fakeCognitiveTrials(),
      userId: fixture.userId,
    }
    await expect(submitUnifiedCognitiveSessionFinal(input, admission as any)).rejects.toMatchObject({
      code: 'STALE_ATTEMPT',
      statusCode: 409,
    })
    expect(await db!.cognitiveSession.findUnique({ where: { id: fixture.session.id }, select: { status: true, submissionId: true } })).toMatchObject({
      status: 'IN_PROGRESS',
      submissionId: null,
    })
    expect(await db!.cognitiveRawSubmission.count({ where: { sessionId: fixture.session.id } })).toBe(0)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.attempt.id, sourceAttemptId: fixture.session.id } })).toBe(0)
  })

  it('keeps Unified Composite form section completion single-shot under concurrent duplicate submits and replays', async () => {
    const fixture = await createUnifiedFormFixture()
    const input = {
      attemptId: fixture.attempt.id,
      sectionId: fixture.section.id,
      submissionId: `v32-1-form-final-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: fixture.definitionHash,
      contextSnapshotHash: null,
      answers: [{ formItemId: fixture.item.id, value: 'answer' }],
      userId: fixture.userId,
    }
    const outcomes = await Promise.allSettled([
      submitCompositeFormSectionFinal(input),
      submitCompositeFormSectionFinal(input),
    ])
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    for (const outcome of rejected) {
      expect(outcome.reason).toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 409 })
    }
    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true)

    const replayed = await submitCompositeFormSectionFinal(input)
    expect(replayed.replayed).toBe(true)
    const [sectionAttempt, answerCount, snapshotCount] = await Promise.all([
      db!.compositeFormSectionAttempt.findUnique({ where: { attemptId_sectionId: { attemptId: fixture.attempt.id, sectionId: fixture.section.id } } }),
      db!.compositeFormAnswer.count({ where: { attemptId: fixture.attempt.id, itemId: fixture.item.id } }),
      db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.attempt.id, slotKey: `form-section:${fixture.section.id}` } }),
    ])
    expect(sectionAttempt).toMatchObject({ status: 'COMPLETED', submissionId: input.submissionId, attemptEpoch: 1 })
    expect(answerCount).toBe(1)
    expect(snapshotCount).toBe(1)
  })
})
