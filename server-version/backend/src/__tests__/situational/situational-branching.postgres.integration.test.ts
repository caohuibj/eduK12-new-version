import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import {
  encryptFrozenSituationalRuntimeSnapshot,
  freezeSituationalRuntimeAtAttemptStart,
} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { getParticipantKey } from '../../modules/assessment-runtime/participant-key'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import type { SituationDefinitionV2 } from '../../modules/situational/situation-branching'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const databaseUrl = integrationDatabaseUrl(
  'SITUATIONAL_BRANCHING_INTEGRATION_DATABASE_URL',
  'V32_3_INTEGRATION_DATABASE_URL',
)
const suite = databaseUrl ? describe : describe.skip

let db: PrismaClient | null = null
let submitSituationalAttemptFinal: typeof import('../../modules/situational/situational-final-submit.service')['submitSituationalAttemptFinal']
let compositeService: typeof import('../../modules/composite/composite.service')

const createdUserIds: string[] = []
const createdCourseIds: string[] = []
const createdCompositeIds: string[] = []
const createdCompositeAttemptIds: string[] = []
const createdSituationalAttemptIds: string[] = []

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const branchingDefinition = (): SituationDefinitionV2 => {
  const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)
  const decision = source.scenes[0]!.channels[0]!
  if (decision.responseType !== 'SINGLE_CHOICE') throw new Error('fixture requires a choice decision channel')
  return {
    ...source,
    schemaVersion: 2,
    sampling: { strategy: 'BRANCH_REACHABLE' },
    flow: {
      strategy: 'BRANCHING_DAG_V1',
      entryNodeKey: 'node-as-01',
      nodes: [
        {
          nodeType: 'SCENE',
          nodeKey: 'node-as-01',
          sceneKey: 'AS-01',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-1',
          stepKey: 'decision',
          transition: {
            type: 'DECISION',
            channelKey: decision.channelKey,
            branches: decision.options.map((option, index) => ({
              optionKey: option.optionKey,
              nextNodeKey: index % 2 === 0 ? 'node-as-02' : 'terminal-early',
            })),
          },
        },
        {
          nodeType: 'SCENE',
          nodeKey: 'node-as-02',
          sceneKey: 'AS-02',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-2',
          stepKey: 'follow-up',
          transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' },
        },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
      ],
    },
  }
}

const createUser = async (label: string): Promise<string> => {
  if (!db) throw new Error('branching integration database is not connected')
  const suffix = `${label}-${randomUUID()}`
  const id = `situational-v2c-user-${suffix}`
  await db.user.create({
    data: { id, username: `situational-v2c-${suffix}`, passwordHash: 'situational-v2c-fixture-only' },
  })
  createdUserIds.push(id)
  return id
}

const createStandaloneV2Attempt = async (userId: string) => {
  if (!db) throw new Error('branching integration database is not connected')
  const snapshot = freezeSituationalRuntimeAtAttemptStart({
    instrumentKey: `sjt-branching-pg-${randomUUID()}`,
    instrumentVersion: '2.0.0',
    definition: branchingDefinition(),
  })
  const row = await db.situationalAttempt.create({
    data: {
      userId,
      participantKey: getParticipantKey(userId),
      instrumentKey: snapshot.instrumentKey,
      instrumentVersion: snapshot.instrumentVersion,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      definitionHash: snapshot.definitionHash,
      compiledRuntimeHash: snapshot.compiledRuntimeHash,
      scorerKey: snapshot.scorerKey,
      scoringVersion: snapshot.scoringVersion,
      frozenAt: new Date(snapshot.frozenAt),
      runtimeSnapshotEncrypted: encryptFrozenSituationalRuntimeSnapshot(snapshot),
      progress: 0,
    },
  })
  createdSituationalAttemptIds.push(row.id)
  return { row, snapshot }
}

const createCompositeFixture = async () => {
  if (!db) throw new Error('branching integration database is not connected')
  const userId = await createUser('bundle')
  const suffix = randomUUID()
  const course = await db.course.create({
    data: {
      title: `Situational V2C course ${suffix}`,
      courseCode: `SITUATIONAL-V2C-${suffix}`,
      status: 'PUBLISHED',
      creatorId: userId,
    },
  })
  createdCourseIds.push(course.id)
  await db.courseStudent.create({ data: { courseId: course.id, studentId: userId, status: 'ACTIVE' } })
  const composite = await db.compositeAssessment.create({
    data: {
      code: `SITUATIONAL-V2C-${suffix}`,
      name: 'Situational V2C Bundle fixture',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: userId,
      maxAttempts: 1,
      publishedAt: new Date(),
    },
  })
  createdCompositeIds.push(composite.id)
  const item = await db.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SITUATIONAL',
      position: 0,
      required: true,
      situationalInstrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      situationalInstrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    },
  })
  const started = await compositeService.startUserAttempt(userId, composite.id)
  createdCompositeAttemptIds.push(started.attempt.id)
  const child = await db.situationalAttempt.findUnique({
    where: {
      compositeAttemptId_compositeItemId: {
        compositeAttemptId: started.attempt.id,
        compositeItemId: item.id,
      },
    },
  })
  if (!child) throw new Error('embedded Situational child is missing')
  createdSituationalAttemptIds.push(child.id)
  return { userId, itemId: item.id, parentId: started.attempt.id, child }
}

suite('Situational V2 branching authoritative PostgreSQL FINAL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    submitSituationalAttemptFinal = (await import('../../modules/situational/situational-final-submit.service')).submitSituationalAttemptFinal
    compositeService = await import('../../modules/composite/composite.service')
  }, 30_000)

  afterAll(async () => {
    if (!db) return
    await db.situationalAttempt.deleteMany({ where: { id: { in: createdSituationalAttemptIds } } })
    await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: createdCompositeAttemptIds } } })
    await db.compositeAssessment.deleteMany({ where: { id: { in: createdCompositeIds } } })
    await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await db.$disconnect()
    db = null
  })

  it('commits only the reachable early-terminal responses and preserves replay idempotency', async () => {
    const userId = await createUser('standalone')
    const { row, snapshot } = await createStandaloneV2Attempt(userId)
    const submissionId = `situational-v2c-submit-${randomUUID()}`
    const input = {
      attemptId: row.id,
      userId,
      submissionId,
      attemptEpoch: 1,
      definitionHash: snapshot.definitionHash,
      instrumentVersion: snapshot.instrumentVersion,
      compiledRuntimeHash: snapshot.compiledRuntimeHash,
      scoringVersion: snapshot.scoringVersion,
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' }],
    }

    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted).toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })
    expect(submitted.result?.quality.status).toBe('interpretable')
    expect(submitted.result?.metrics[0]?.value).toBe(0.5)
    expect(submitted.canonicalResult?.core.unitType).toBe('SITUATIONAL')
    expect(await db!.situationalRawSubmission.findUnique({ where: { attemptId: row.id }, select: { responseCount: true } }))
      .toEqual({ responseCount: 1 })

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(replayed.canonicalResult?.resultHash).toBe(submitted.canonicalResult?.resultHash)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: row.id } })).toBe(1)
  })

  it('rejects off-path and non-terminal V2 FINAL payloads without mutating attempts', async () => {
    const userId = await createUser('reject')
    const offPath = await createStandaloneV2Attempt(userId)
    await expect(submitSituationalAttemptFinal({
      attemptId: offPath.row.id,
      userId,
      submissionId: `situational-v2c-offpath-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: offPath.snapshot.definitionHash,
      instrumentVersion: offPath.snapshot.instrumentVersion,
      compiledRuntimeHash: offPath.snapshot.compiledRuntimeHash,
      scoringVersion: offPath.snapshot.scoringVersion,
      responses: [
        { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
        { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
      ],
    })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    expect(await db!.situationalAttempt.findUnique({ where: { id: offPath.row.id }, select: { status: true, submissionId: true } }))
      .toEqual({ status: 'IN_PROGRESS', submissionId: null })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: offPath.row.id } })).toBe(0)

    const incomplete = await createStandaloneV2Attempt(userId)
    await expect(submitSituationalAttemptFinal({
      attemptId: incomplete.row.id,
      userId,
      submissionId: `situational-v2c-incomplete-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: incomplete.snapshot.definitionHash,
      instrumentVersion: incomplete.snapshot.instrumentVersion,
      compiledRuntimeHash: incomplete.snapshot.compiledRuntimeHash,
      scoringVersion: incomplete.snapshot.scoringVersion,
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' }],
    })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409 })
    expect(await db!.situationalAttempt.findUnique({ where: { id: incomplete.row.id }, select: { status: true, submissionId: true } }))
      .toEqual({ status: 'IN_PROGRESS', submissionId: null })
  })

  it('completes an embedded Bundle child from a V2 frozen graph without exposing raw trajectory in CanonicalUnitResult', async () => {
    const fixture = await createCompositeFixture()
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: fixture.child.instrumentKey,
      instrumentVersion: fixture.child.instrumentVersion,
      definition: branchingDefinition(),
    })
    await db!.situationalAttempt.update({
      where: { id: fixture.child.id },
      data: {
        definitionHash: snapshot.definitionHash,
        compiledRuntimeHash: snapshot.compiledRuntimeHash,
        scorerKey: snapshot.scorerKey,
        scoringVersion: snapshot.scoringVersion,
        frozenAt: new Date(snapshot.frozenAt),
        runtimeSnapshotEncrypted: encryptFrozenSituationalRuntimeSnapshot(snapshot),
      },
    })

    const submissionId = `situational-v2c-bundle-${randomUUID()}`
    const input = {
      attemptId: fixture.child.id,
      userId: fixture.userId,
      submissionId,
      attemptEpoch: fixture.child.attemptEpoch,
      definitionHash: snapshot.definitionHash,
      instrumentVersion: snapshot.instrumentVersion,
      compiledRuntimeHash: snapshot.compiledRuntimeHash,
      scoringVersion: snapshot.scoringVersion,
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' }],
      embedded: {
        compositeAttemptId: fixture.parentId,
        compositeItemId: fixture.itemId,
        compositeSlotKey: compositeItemSlotKey(fixture.itemId, 'SITUATIONAL'),
        userId: fixture.userId,
      },
    }

    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted).toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })
    expect(await db!.compositeAssessmentAttempt.findUnique({
      where: { id: fixture.parentId },
      select: { status: true, progress: true, completedItems: true },
    })).toEqual({ status: 'COMPLETED', progress: 100, completedItems: 1 })

    const slotKey = compositeItemSlotKey(fixture.itemId, 'SITUATIONAL')
    const unitSnapshot = await db!.assessmentUnitSnapshot.findUnique({
      where: {
        compositeAttemptId_attemptEpoch_slotKey: {
          compositeAttemptId: fixture.parentId,
          attemptEpoch: 1,
          slotKey,
        },
      },
    })
    expect(unitSnapshot).toMatchObject({
      unitType: 'SITUATIONAL',
      sourceAttemptId: fixture.child.id,
      sourceSubmissionId: submissionId,
      canonicalResultEncrypted: expect.any(String),
    })
    const canonical = parseCanonicalUnitResultEnvelope(
      decryptUnifiedRuntimePayload<unknown>(unitSnapshot!.canonicalResultEncrypted!),
    )
    expect(canonical.core.unitType).toBe('SITUATIONAL')
    expect(canonical.core.metrics[0]?.value).toBe(0.5)
    expect(JSON.stringify(canonical)).not.toMatch(/sceneKey|nodeKey|terminalNodeKey|optionKey|choiceScores/i)

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: fixture.child.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.parentId, slotKey } })).toBe(1)
  }, 60_000)
})
