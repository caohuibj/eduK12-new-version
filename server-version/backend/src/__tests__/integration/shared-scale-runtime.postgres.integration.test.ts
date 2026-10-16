import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { scaleDefinitionFor } from './mini-scale-definition'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { createSharedScaleRuntimeStore, sharedScaleArtifactRepositoryForDatabase } from '../../modules/assessment-runtime/shared-scale-runtime'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
const url = integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
suite('shared immutable runtime on isolated PostgreSQL', () => {
  beforeAll(async () => { requireIsolatedReleaseDatabase(url!); db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect() })
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs() })
  it('accepts concurrent first-use versions in different questionnaire orders without a lock cycle', async () => {
    const repo = sharedScaleArtifactRepositoryForDatabase(db), store = createSharedScaleRuntimeStore(repo)
    const a = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'shared-order-a-' + randomUUID(), instrumentVersion: '1', definition: scaleDefinitionFor(3) })
    const b = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'shared-order-b-' + randomUUID(), instrumentVersion: '1', definition: scaleDefinitionFor(5) })
    await Promise.all([[a, b], [b, a]].map(order => db.$transaction(async tx => {
      for (const snapshot of order) await store.save(snapshot, sharedScaleArtifactRepositoryForDatabase(tx))
    }, { timeout: 10_000 })))
  })
  it('rolls back an append, retries with the same hash, and reads after cache loss', async () => {
    const repo = sharedScaleArtifactRepositoryForDatabase(db), store = createSharedScaleRuntimeStore(repo)
    const original = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'shared-pg-' + randomUUID(), instrumentVersion: '1', definition: scaleDefinitionFor(3) })
    let reference: any
    await expect(db.$transaction(async tx => {
      const cipher = await store.save(original, sharedScaleArtifactRepositoryForDatabase(tx))
      reference = decryptUnifiedRuntimePayload(cipher)
      throw new Error('synthetic parent rollback')
    })).rejects.toThrow('parent rollback')
    expect(await repo.find(reference.artifactHash)).toBeNull()
    await db.$transaction(async tx => {
      const cipher = await store.save(original, sharedScaleArtifactRepositoryForDatabase(tx))
      reference = decryptUnifiedRuntimePayload(cipher)
    })
    expect(await repo.find(reference.artifactHash)).not.toBeNull()
    expect(await createSharedScaleRuntimeStore(repo).load(reference)).toEqual(original)
    await expect(db.$executeRaw`UPDATE assessment_runtime_artifacts SET plaintext_bytes=1 WHERE artifact_hash=${reference.artifactHash}`).rejects.toThrow()
    await expect(db.$executeRaw`DELETE FROM assessment_runtime_artifacts WHERE artifact_hash=${reference.artifactHash}`).rejects.toThrow()
  })
})
