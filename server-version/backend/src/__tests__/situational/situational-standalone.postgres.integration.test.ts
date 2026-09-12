import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'
import { freezeSituationalRuntimeAtAttemptStart, encryptFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { getParticipantKey } from '../../modules/assessment-runtime/participant-key'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import type { SituationDefinitionV1 } from '../../modules/situational/situation-definition'

const databaseUrl = integrationDatabaseUrl(
  'SITUATIONAL_PRB_INTEGRATION_DATABASE_URL',
  'V32_3_INTEGRATION_DATABASE_URL',
)
const suite = databaseUrl ? describe : describe.skip

let db: PrismaClient | null = null
let startSituationalAttempt: typeof import('../../modules/situational/situational-runtime.service')['startSituationalAttempt']
let resumeSituationalAttempt: typeof import('../../modules/situational/situational-runtime.service')['resumeSituationalAttempt']
let submitSituationalAttemptFinal: typeof import('../../modules/situational/situational-final-submit.service')['submitSituationalAttemptFinal']
let listSituationalHistory: typeof import('../../modules/situational/situational-runtime.service')['listSituationalHistory']

const createdUserIds: string[] = []
const createdAttemptIds: string[] = []

const createUser = async (label: string): Promise<string> => {
  if (!db) throw new Error('Situational PR-B database is not connected')
  const suffix = `${label}-${randomUUID()}`
  const id = `situational-prb-user-${suffix}`
  await db.user.create({
    data: { id, username: `situational-prb-${suffix}`, passwordHash: 'situational-prb-fixture-only' },
  })
  createdUserIds.push(id)
  return id
}

const assertivenessResponses = [
  { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' as const },
  { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'B' as const },
]

const publishedPackages = [
  { ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE, releaseStatus: 'PUBLISHED' as const },
  { ...SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE, releaseStatus: 'PUBLISHED' as const },
]

const sceneCountDefinition = (sceneCount: number): SituationDefinitionV1 => {
  const definition = JSON.parse(JSON.stringify(SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.definition)) as SituationDefinitionV1
  const template = definition.scenes[0]!
  definition.scenes = Array.from({ length: sceneCount }, (_, index) => {
    const sceneKey = `SC-${String(index + 1).padStart(3, '0')}`
    return {
      ...template,
      sceneKey,
      title: `characterization scene ${index + 1}`,
      sortOrder: index,
      stimulus: template.stimulus.type === 'TEXT_V1'
        ? { ...template.stimulus, text: `${template.stimulus.text} (${index + 1})` }
        : template.stimulus,
    }
  })
  definition.scoring.choiceScores = definition.scenes.flatMap((scene) => {
    const channel = scene.channels.find((candidate) => candidate.responseType === 'SINGLE_CHOICE')
    if (!channel || channel.responseType !== 'SINGLE_CHOICE') throw new Error('characterization fixture must contain a choice channel')
    return channel.options.map((option) => ({
      sceneKey: scene.sceneKey,
      channelKey: channel.channelKey,
      optionKey: option.optionKey,
      contribution: option.optionKey === 'A' ? 1 : option.optionKey === 'B' ? 0 : option.optionKey === 'C' ? -0.5 : -1,
    }))
  })
  return definition
}

const sceneCountResponses = (definition: SituationDefinitionV1) => definition.scenes.flatMap((scene) => ([
  { sceneKey: scene.sceneKey, channelKey: 'appraisal', responseValue: 'A' as const },
  { sceneKey: scene.sceneKey, channelKey: 'emotion', responseValue: 50 },
]))

suite('Situational PR-B standalone PostgreSQL runtime', () => {
  beforeAll(async () => {
    // Production registry fixtures remain DRAFT until publication. The real-PG
    // lifecycle tests use the same definitions through a published test view so
    // they exercise participant admission without changing production status.
    vi.doMock('../../modules/situational/situation-package.registry', async () => {
      const actual = await vi.importActual<typeof import('../../modules/situational/situation-package.registry')>('../../modules/situational/situation-package.registry')
      return {
        ...actual,
        listSituationPackages: () => publishedPackages,
        getSituationPackage: (key: string, version: string) => publishedPackages.find((candidate) => candidate.key === key && candidate.instrumentVersion === version),
      }
    })
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    const runtime = await import('../../modules/situational/situational-runtime.service')
    const submit = await import('../../modules/situational/situational-final-submit.service')
    startSituationalAttempt = runtime.startSituationalAttempt
    resumeSituationalAttempt = runtime.resumeSituationalAttempt
    listSituationalHistory = runtime.listSituationalHistory
    submitSituationalAttemptFinal = submit.submitSituationalAttemptFinal
  }, 30_000)

  afterAll(async () => {
    if (!db) return
    await db.situationalAttempt.deleteMany({ where: { id: { in: createdAttemptIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await db.$disconnect()
    db = null
  })

  const finalInput = (attempt: any, responses = assertivenessResponses, submissionId = `situational-prb-submit-${randomUUID()}`) => ({
    attemptId: attempt.attemptId,
    userId: attempt.attempt.userId ?? undefined,
    submissionId,
    attemptEpoch: attempt.attempt.attemptEpoch,
    definitionHash: attempt.instrument.definitionHash,
    instrumentVersion: attempt.instrument.version,
    compiledRuntimeHash: attempt.instrument.compiledRuntimeHash,
    scoringVersion: attempt.instrument.scoringVersion,
    responses,
  })

  it('supports start/resume, one-shot FINAL, replay, result and history without per-answer rows', async () => {
    const userId = await createUser('lifecycle')
    const started = await startSituationalAttempt(userId, {
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })
    createdAttemptIds.push(started.attemptId)
    expect(started.attempt.status).toBe('IN_PROGRESS')

    const startedAgain = await startSituationalAttempt(userId, {
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })
    expect(startedAgain.attemptId).toBe(started.attemptId)
    expect(startedAgain.attempt.definitionHash).toBe(started.attempt.definitionHash)

    const resumed = await resumeSituationalAttempt(started.attemptId, userId)
    expect(resumed.attempt.status).toBe('IN_PROGRESS')
    const submissionId = `situational-prb-submit-${randomUUID()}`
    const submitted = await submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId }, assertivenessResponses, submissionId),
      userId,
    })
    expect(submitted.replayed).toBe(false)
    expect(submitted.attempt.status).toBe('COMPLETED')
    expect(submitted.result?.quality.status).toBe('interpretable')
    expect(submitted.canonicalResult?.core.unitType).toBe('SITUATIONAL')
    expect(submitted.canonicalResult?.core.metrics.map((metric) => metric.key)).toEqual(['bfi2.assertiveness.behavior'])

    const stored = await db!.situationalAttempt.findUnique({
      where: { id: started.attemptId },
      select: { status: true, resultEncrypted: true, canonicalResultEncrypted: true, submissionId: true },
    })
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      submissionId,
      resultEncrypted: expect.any(String),
      canonicalResultEncrypted: expect.any(String),
    })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: started.attemptId } })).toBe(1)

    const replayed = await submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId }, assertivenessResponses, submissionId),
      userId,
    })
    expect(replayed.replayed).toBe(true)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: started.attemptId } })).toBe(1)
    await expect(submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId }, [
        { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
        { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'B' },
      ], submissionId),
      userId,
    })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })

    const history = await listSituationalHistory(userId)
    expect(history.list.some((entry) => entry.attemptId === started.attemptId)).toBe(true)
    expect((await resumeSituationalAttempt(started.attemptId, userId)).canonicalResult?.resultHash)
      .toBe(submitted.canonicalResult?.resultHash)

    const restarted = await startSituationalAttempt(userId, {
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })
    createdAttemptIds.push(restarted.attemptId)
    expect(restarted.attemptId).not.toBe(started.attemptId)
    expect(restarted.attempt.attemptNo).toBe(started.attempt.attemptNo + 1)
  })

  it('rejects cross-user and stale runtime submissions before terminal mutation', async () => {
    const ownerId = await createUser('owner')
    const otherId = await createUser('other')
    const started = await startSituationalAttempt(ownerId, {
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })
    createdAttemptIds.push(started.attemptId)

    await expect(submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId: otherId }),
      userId: otherId,
    })).rejects.toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 403 })
    await expect(submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId: ownerId }),
      userId: ownerId,
      definitionHash: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH' })

    expect(await db!.situationalAttempt.findUnique({ where: { id: started.attemptId }, select: { status: true } }))
      .toEqual({ status: 'IN_PROGRESS' })
  })

  it('accepts continuous range endpoints and converges concurrent FINAL requests', async () => {
    const userId = await createUser('concurrency')
    const started = await startSituationalAttempt(userId, {
      instrumentKey: SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    })
    createdAttemptIds.push(started.attemptId)
    const responses = [
      { sceneKey: 'AN-01', channelKey: 'appraisal', responseValue: 'A' as const },
      { sceneKey: 'AN-01', channelKey: 'emotion', responseValue: 100 },
    ]
    const input = {
      ...finalInput({ ...started, userId }, responses, `situational-prb-race-${randomUUID()}`),
      userId,
    }
    const outcomes = await Promise.all([submitSituationalAttemptFinal(input), submitSituationalAttemptFinal(input)])
    expect(outcomes.map((outcome) => outcome.replayed).sort()).toEqual([false, true])
    expect(outcomes[0]?.result?.metrics.find((metric) => metric.key === 'bfi2.anxiety.emotion')?.value).toBe(100)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: started.attemptId } })).toBe(1)
  })

  it.each([10, 30, 60])('keeps one terminal raw write under %s concurrent FINALs', async (count) => {
    const fixtures = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const userId = await createUser(`load-${count}-${index}`)
      const started = await startSituationalAttempt(userId, {
        instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
        instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      })
      createdAttemptIds.push(started.attemptId)
      return { userId, started }
    }))
    const outcomes = await Promise.all(fixtures.map(({ userId, started }, index) => submitSituationalAttemptFinal({
      ...finalInput({ ...started, userId }, assertivenessResponses, `situational-prb-load-${count}-${index}-${randomUUID()}`),
      userId,
    })))
    expect(outcomes.every((outcome) => outcome.replayed === false)).toBe(true)
    expect(await db!.situationalRawSubmission.count({
      where: { attemptId: { in: fixtures.map(({ started }) => started.attemptId) } },
    })).toBe(count)
  }, 30_000)

  it.each([10, 30, 60])('characterizes one FINAL across %s scenes without per-scene persistence', async (sceneCount) => {
    const userId = await createUser(`scene-count-${sceneCount}`)
    const definition = sceneCountDefinition(sceneCount)
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: `sjt-scene-count-${sceneCount}-${randomUUID()}`,
      instrumentVersion: '1.0.0',
      definition,
    })
    const encryptedSnapshot = encryptFrozenSituationalRuntimeSnapshot(snapshot)
    const attempt = await db!.situationalAttempt.create({
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
        runtimeSnapshotEncrypted: encryptedSnapshot,
        progress: 0,
      },
      select: { id: true },
    })
    createdAttemptIds.push(attempt.id)

    const responses = sceneCountResponses(definition)
    const input = {
      attemptId: attempt.id,
      userId,
      submissionId: `situational-prb-scene-count-${sceneCount}-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: snapshot.definitionHash,
      instrumentVersion: snapshot.instrumentVersion,
      compiledRuntimeHash: snapshot.compiledRuntimeHash,
      scoringVersion: snapshot.scoringVersion,
      responses,
    }
    const expected = scoreSituational(definition, responses)
    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted.replayed).toBe(false)
    expect(submitted.result).toEqual(expected)
    expect(submitted.attempt.status).toBe('COMPLETED')
    expect(submitted.canonicalResult?.core.unitType).toBe('SITUATIONAL')

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(replayed.canonicalResult?.resultHash).toBe(submitted.canonicalResult?.resultHash)

    const stored = await db!.situationalAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true, resultEncrypted: true, canonicalResultEncrypted: true },
    })
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      resultEncrypted: expect.any(String),
      canonicalResultEncrypted: expect.any(String),
    })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: attempt.id } })).toBe(1)
    expect((await db!.situationalRawSubmission.findUnique({ where: { attemptId: attempt.id }, select: { responseCount: true } }))?.responseCount)
      .toBe(sceneCount * 2)
  })
})