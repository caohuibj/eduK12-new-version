import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import type { SituationDefinitionV2 } from '../../modules/situational/situation-branching'
import type { SituationPackageV2 } from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const databaseUrl = integrationDatabaseUrl(
  'SITUATIONAL_BRANCHING_INTEGRATION_DATABASE_URL',
  'V32_3_INTEGRATION_DATABASE_URL',
)
const suite = databaseUrl ? describe : describe.skip
const BRANCHING_PACKAGE_KEY = 'sjt-branching-v2c-integration'
const BRANCHING_PACKAGE_VERSION = '2.0.0'

let db: PrismaClient | null = null
let startSituationalAttempt: typeof import('../../modules/situational/situational-runtime.service')['startSituationalAttempt']
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

const branchingPackage = (): SituationPackageV2 => ({
  key: BRANCHING_PACKAGE_KEY,
  instrumentVersion: BRANCHING_PACKAGE_VERSION,
  releaseStatus: 'PUBLISHED',
  scienceMaturity: 'PILOT',
  definition: branchingDefinition(),
  goldenCases: [
    {
      name: 'early-terminal',
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' }],
      expected: {
        quality: 'interpretable',
        metrics: { 'bfi2.assertiveness.behavior': 0.5 },
        metricKeys: ['bfi2.assertiveness.behavior'],
      },
    },
    {
      name: 'full-path',
      responses: [
        { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
        { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
      ],
      expected: {
        quality: 'interpretable',
        metrics: { 'bfi2.assertiveness.behavior': 1.5 },
        metricKeys: ['bfi2.assertiveness.behavior'],
      },
    },
  ],
})

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

const startStandaloneV2 = async (userId: string) => {
  const started = await startSituationalAttempt(userId, {
    instrumentKey: BRANCHING_PACKAGE_KEY,
    instrumentVersion: BRANCHING_PACKAGE_VERSION,
  })
  createdSituationalAttemptIds.push(started.attemptId)
  expect(started.instrument.definition.schemaVersion).toBe(2)
  expect(started.instrument.sampling).toEqual({ strategy: 'BRANCH_REACHABLE' })
  return started
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
      situationalInstrumentKey: BRANCHING_PACKAGE_KEY,
      situationalInstrumentVersion: BRANCHING_PACKAGE_VERSION,
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
    const v2Package = branchingPackage()
    vi.doMock('../../modules/situational/situation-package.registry', async () => {
      const actual = await vi.importActual<typeof import('../../modules/situational/situation-package.registry')>('../../modules/situational/situation-package.registry')
      return {
        ...actual,
        listSituationPackages: () => [...actual.listSituationPackages(), v2Package],
        getSituationPackage: (key: string, version: string) => (
          key === v2Package.key && version === v2Package.instrumentVersion
            ? v2Package
            : actual.getSituationPackage(key, version)
        ),
      }
    })
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    const runtime = await import('../../modules/situational/situational-runtime.service')
    startSituationalAttempt = runtime.startSituationalAttempt
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
    vi.doUnmock('../../modules/situational/situation-package.registry')
  })

  it('admits V2 normally, commits only reachable early-terminal responses, and preserves replay idempotency', async () => {
    const userId = await createUser('standalone')
    const started = await startStandaloneV2(userId)
    const submissionId = `situational-v2c-submit-${randomUUID()}`
    const input = {
      attemptId: started.attemptId,
      userId,
      submissionId,
      attemptEpoch: started.attempt.attemptEpoch,
      definitionHash: started.instrument.definitionHash,
      instrumentVersion: started.instrument.version,
      compiledRuntimeHash: started.instrument.compiledRuntimeHash,
      scoringVersion: started.instrument.scoringVersion,
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' }],
    }

    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted).toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })
    expect(submitted.result?.quality.status).toBe('interpretable')
    expect(submitted.result?.metrics[0]?.value).toBe(0.5)
    expect(submitted.canonicalResult?.core.unitType).toBe('SITUATIONAL')
    expect(await db!.situationalRawSubmission.findUnique({ where: { attemptId: started.attemptId }, select: { responseCount: true } }))
      .toEqual({ responseCount: 1 })

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(replayed.canonicalResult?.resultHash).toBe(submitted.canonicalResult?.resultHash)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: started.attemptId } })).toBe(1)
  })

  it('rejects off-path and non-terminal V2 FINAL payloads without mutating attempts', async () => {
    const offPathUserId = await createUser('offpath')
    const offPath = await startStandaloneV2(offPathUserId)
    await expect(submitSituationalAttemptFinal({
      attemptId: offPath.attemptId,
      userId: offPathUserId,
      submissionId: `situational-v2c-offpath-${randomUUID()}`,
      attemptEpoch: offPath.attempt.attemptEpoch,
      definitionHash: offPath.instrument.definitionHash,
      instrumentVersion: offPath.instrument.version,
      compiledRuntimeHash: offPath.instrument.compiledRuntimeHash,
      scoringVersion: offPath.instrument.scoringVersion,
      responses: [
        { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
        { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
      ],
    })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    expect(await db!.situationalAttempt.findUnique({ where: { id: offPath.attemptId }, select: { status: true, submissionId: true } }))
      .toEqual({ status: 'IN_PROGRESS', submissionId: null })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: offPath.attemptId } })).toBe(0)

    const incompleteUserId = await createUser('incomplete')
    const incomplete = await startStandaloneV2(incompleteUserId)
    await expect(submitSituationalAttemptFinal({
      attemptId: incomplete.attemptId,
      userId: incompleteUserId,
      submissionId: `situational-v2c-incomplete-${randomUUID()}`,
      attemptEpoch: incomplete.attempt.attemptEpoch,
      definitionHash: incomplete.instrument.definitionHash,
      instrumentVersion: incomplete.instrument.version,
      compiledRuntimeHash: incomplete.instrument.compiledRuntimeHash,
      scoringVersion: incomplete.instrument.scoringVersion,
      responses: [{ sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' }],
    })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409 })
    expect(await db!.situationalAttempt.findUnique({ where: { id: incomplete.attemptId }, select: { status: true, submissionId: true } }))
      .toEqual({ status: 'IN_PROGRESS', submissionId: null })
  })

  it('completes a normally admitted V2 embedded Bundle child without exposing raw trajectory in CanonicalUnitResult', async () => {
    const fixture = await createCompositeFixture()
    const submissionId = `situational-v2c-bundle-${randomUUID()}`
    const input = {
      attemptId: fixture.child.id,
      userId: fixture.userId,
      submissionId,
      attemptEpoch: fixture.child.attemptEpoch,
      definitionHash: fixture.child.definitionHash,
      instrumentVersion: fixture.child.instrumentVersion,
      compiledRuntimeHash: fixture.child.compiledRuntimeHash,
      scoringVersion: fixture.child.scoringVersion,
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
