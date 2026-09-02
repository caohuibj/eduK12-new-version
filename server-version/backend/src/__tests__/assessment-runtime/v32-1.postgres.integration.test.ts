import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'

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

  afterAll(async () => {
    if (!db) return
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
})
