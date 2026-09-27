import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportArtifactStatus, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'

const queue = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
}))

vi.mock('../../config/queue', () => ({
  exportQueue: {
    add: queue.add,
    getJob: queue.getJob,
  },
}))

import {
  claimExportBatch,
  enqueueExportJob,
  failExportBatchFinal,
  publishExportBatch,
  releaseExportBatchAttempt,
} from '../../services/exportJobService'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
const createdBatchIds: string[] = []
const createdScaleIds: string[] = []
const createdUserIds: string[] = []

const fixture = async () => {
  const suffix = randomUUID()
  const user = await prisma.user.create({
    data: {
      username: `export-batch-${suffix}`,
      passwordHash: 'test-only',
      role: UserRole.ADMIN,
      nickname: 'Export batch test',
    },
  })
  const scale = await prisma.scale.create({
    data: {
      code: `EXPORT-BATCH-${suffix}`,
      name: 'Export batch test scale',
      creatorId: user.id,
      status: 'PUBLISHED',
      visibility: 'HIDDEN',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '1.0.0',
      definitionHash: 'a'.repeat(64),
      itemCount: 1,
      dimensionCount: 1,
    },
  })
  createdUserIds.push(user.id)
  createdScaleIds.push(scale.id)
  return { user, scale }
}

const request = async (userId: string, scaleId: string, requestKey: string, format: 'csv' | 'sav' = 'csv') => {
  const result = await enqueueExportJob({
    resourceType: 'SCALE',
    resourceId: scaleId,
    createdBy: userId,
    anonymized: true,
    format,
    options: { anonymize: true, minProgress: 100 },
    recordCount: 3,
    requestKey,
  })
  if (!createdBatchIds.includes(result.batchId)) createdBatchIds.push(result.batchId)
  return result
}

suite('durable export batches (real PostgreSQL)', () => {
  beforeEach(() => {
    queue.add.mockReset()
    queue.getJob.mockReset()
    queue.getJob.mockResolvedValue(null)
    queue.add.mockImplementation(async (_payload: unknown, options: { jobId?: string }) => ({ id: options?.jobId }))
  })

  afterAll(async () => {
    if (createdBatchIds.length) {
      await prisma.exportArtifact.deleteMany({ where: { batchId: { in: createdBatchIds } } })
      await prisma.exportBatch.deleteMany({ where: { id: { in: createdBatchIds } } })
    }
    if (createdScaleIds.length) await prisma.scale.deleteMany({ where: { id: { in: createdScaleIds } } })
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await prisma.$disconnect()
  })

  it('survives PostgreSQL commit followed by Redis enqueue failure and replays one accepted intent', async () => {
    const { user, scale } = await fixture()
    const requestKey = `response-loss-${randomUUID()}`
    queue.add.mockRejectedValueOnce(new Error('redis unavailable'))

    const accepted = await request(user.id, scale.id, requestKey)
    expect(accepted.status).toBe(ExportArtifactStatus.PROCESSING)
    expect(await prisma.exportBatch.count({ where: { id: accepted.batchId, status: ExportArtifactStatus.PROCESSING } })).toBe(1)
    expect(await prisma.exportArtifact.count({ where: { batchId: accepted.batchId, status: ExportArtifactStatus.PROCESSING } })).toBe(1)

    const replay = await request(user.id, scale.id, requestKey)
    expect(replay.batchId).toBe(accepted.batchId)
    expect(replay.replayed).toBe(true)
    expect(await prisma.exportBatch.count({ where: { createdBy: user.id, requestKey } })).toBe(1)
    expect(queue.add).toHaveBeenCalledTimes(2)

    await expect(request(user.id, scale.id, requestKey, 'sav')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fences a stale late worker and publishes the winning generation atomically', async () => {
    const { user, scale } = await fixture()
    const batch = await request(user.id, scale.id, `generation-${randomUUID()}`)
    const first = await claimExportBatch(batch.batchId, 'job-first')
    expect(first?.generation).toBe(1)
    const second = await claimExportBatch(batch.batchId, 'job-second')
    expect(second?.generation).toBe(2)

    const artifacts = await prisma.exportArtifact.findMany({ where: { batchId: batch.batchId } })
    expect(await publishExportBatch({
      batchId: batch.batchId,
      generation: first!.generation,
      fieldCount: 4,
      storageKeys: artifacts.map((artifact) => ({ artifactId: artifact.id, storageKey: artifact.storageKey })),
    })).toBe(false)
    expect(await prisma.exportArtifact.count({ where: { batchId: batch.batchId, status: ExportArtifactStatus.READY } })).toBe(0)

    expect(await publishExportBatch({
      batchId: batch.batchId,
      generation: second!.generation,
      fieldCount: 4,
      storageKeys: artifacts.map((artifact) => ({ artifactId: artifact.id, storageKey: artifact.storageKey })),
    })).toBe(true)
    expect(await prisma.exportBatch.findUnique({ where: { id: batch.batchId }, select: { status: true, generation: true } }))
      .toEqual({ status: ExportArtifactStatus.READY, generation: 2 })
    expect(await prisma.exportArtifact.count({ where: { batchId: batch.batchId, status: ExportArtifactStatus.READY } })).toBe(artifacts.length)
  })

  it('keeps non-final failures retryable and makes only the final attempt terminal', async () => {
    const { user, scale } = await fixture()
    const batch = await request(user.id, scale.id, `retry-${randomUUID()}`)
    const first = await claimExportBatch(batch.batchId, 'job-retry')
    await releaseExportBatchAttempt(batch.batchId, first!.generation)
    expect(await prisma.exportBatch.findUnique({ where: { id: batch.batchId }, select: { status: true } }))
      .toEqual({ status: ExportArtifactStatus.PROCESSING })

    const second = await claimExportBatch(batch.batchId, 'job-final')
    expect(await failExportBatchFinal(batch.batchId, second!.generation, 'FORMAT_CRASH')).toBe(true)
    expect(await prisma.exportBatch.findUnique({ where: { id: batch.batchId }, select: { status: true, errorCode: true } }))
      .toEqual({ status: ExportArtifactStatus.FAILED, errorCode: 'FORMAT_CRASH' })
    expect(await prisma.exportArtifact.count({ where: { batchId: batch.batchId, status: ExportArtifactStatus.FAILED } })).toBeGreaterThan(0)
  })
})
