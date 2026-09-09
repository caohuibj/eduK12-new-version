import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import {
  SITUATIONAL_STATIC_VISUAL_E2E_ASSETS,
  SJT_STATIC_VISUAL_E2E_GOLDEN_CASES,
  SJT_STATIC_VISUAL_E2E_PACKAGE,
} from '../../modules/situational/packages/sjt-static-visual-e2e-fixture'

const databaseUrl = integrationDatabaseUrl(
  'SITUATIONAL_MEDIA_INTEGRATION_DATABASE_URL',
  'V32_3_INTEGRATION_DATABASE_URL',
)
const suite = databaseUrl ? describe : describe.skip

let db: PrismaClient | null = null
let startSituationalAttempt: typeof import('../../modules/situational/situational-runtime.service')['startSituationalAttempt']
let submitSituationalAttemptFinal: typeof import('../../modules/situational/situational-final-submit.service')['submitSituationalAttemptFinal']
let userId = ''
let attemptId = ''

const assetIds = Object.values(SITUATIONAL_STATIC_VISUAL_E2E_ASSETS).map((asset) => asset.assetId)

suite('Assessment media frozen retention on real PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE = 'true'

    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()

    const suffix = randomUUID()
    userId = `assessment-media-retention-user-${suffix}`
    await db.user.create({
      data: {
        id: userId,
        username: `assessment-media-retention-${suffix}`,
        passwordHash: 'assessment-media-retention-fixture-only',
      },
    })

    for (const asset of Object.values(SITUATIONAL_STATIC_VISUAL_E2E_ASSETS)) {
      await db.storedAsset.upsert({
        where: { id: asset.assetId },
        update: {
          objectKey: `assessment-media-retention/${suffix}/${asset.assetId}.png`,
          provider: 'local',
          mimeType: asset.mimeType,
          sizeBytes: 1,
          sha256: asset.contentHash,
          originalName: `${asset.assetId}.png`,
          accessScope: 'PRIVATE',
          scopeId: null,
          deletedAt: null,
        },
        create: {
          id: asset.assetId,
          objectKey: `assessment-media-retention/${suffix}/${asset.assetId}.png`,
          provider: 'local',
          mimeType: asset.mimeType,
          sizeBytes: 1,
          sha256: asset.contentHash,
          originalName: `${asset.assetId}.png`,
          accessScope: 'PRIVATE',
        },
      })
    }

    const runtime = await import('../../modules/situational/situational-runtime.service')
    const submit = await import('../../modules/situational/situational-final-submit.service')
    startSituationalAttempt = runtime.startSituationalAttempt
    submitSituationalAttemptFinal = submit.submitSituationalAttemptFinal
  }, 30_000)

  afterAll(async () => {
    if (!db) return
    if (attemptId) {
      await db.assetReference.deleteMany({
        where: {
          entityType: 'AssessmentFrozenRuntime',
          entityId: `SITUATIONAL:${attemptId}`,
          field: 'media',
        },
      })
      await db.situationalAttempt.deleteMany({ where: { id: attemptId } })
    }
    await db.storedAsset.deleteMany({ where: { id: { in: assetIds } } })
    if (userId) await db.user.deleteMany({ where: { id: userId } })
    await db.$disconnect()
    db = null
    delete process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE
  })

  it('retains frozen visual bytes through ordinary deletion gates and FINAL completion', async () => {
    if (!db) throw new Error('integration database is not connected')

    const started = await startSituationalAttempt(userId, {
      instrumentKey: SJT_STATIC_VISUAL_E2E_PACKAGE.key,
      instrumentVersion: SJT_STATIC_VISUAL_E2E_PACKAGE.instrumentVersion,
    })
    attemptId = started.attempt.id

    const retainedBeforeFinal = await db.assetReference.findMany({
      where: {
        entityType: 'AssessmentFrozenRuntime',
        entityId: `SITUATIONAL:${attemptId}`,
        field: 'media',
      },
      select: { assetId: true },
    })
    expect(retainedBeforeFinal.map((reference) => reference.assetId).sort()).toEqual([...assetIds].sort())

    const deletion = await db.storedAsset.updateMany({
      where: {
        id: assetIds[0]!,
        references: { none: {} },
      },
      data: { deletedAt: new Date() },
    })
    expect(deletion.count).toBe(0)

    const golden = SJT_STATIC_VISUAL_E2E_GOLDEN_CASES[0]!
    const completed = await submitSituationalAttemptFinal({
      attemptId,
      userId,
      submissionId: `assessment-media-final-${randomUUID()}`,
      attemptEpoch: started.attempt.attemptEpoch,
      definitionHash: started.attempt.definitionHash,
      instrumentVersion: started.attempt.instrumentVersion,
      compiledRuntimeHash: started.attempt.compiledRuntimeHash,
      scoringVersion: started.attempt.scoringVersion,
      responses: golden.responses,
    })
    expect(completed.attempt.status).toBe('COMPLETED')

    const retainedAfterFinal = await db.assetReference.findMany({
      where: {
        entityType: 'AssessmentFrozenRuntime',
        entityId: `SITUATIONAL:${attemptId}`,
        field: 'media',
      },
      select: { assetId: true },
    })
    expect(retainedAfterFinal.map((reference) => reference.assetId).sort()).toEqual([...assetIds].sort())
  }, 30_000)
})