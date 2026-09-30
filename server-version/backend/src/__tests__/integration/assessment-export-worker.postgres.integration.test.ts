import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
const suite = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL') ? describe : describe.skip
suite('real assessment export worker process', () => {
  let userId: string, cognitiveId: string, compositeId: string
  const batches: string[] = [], paths: string[] = []
  let queues: typeof import('../../config/queue'), processor: typeof import('../../workers/exportProcessor')
  afterAll(async () => {
    processor?.stopExportProcessingRecovery()
    await queues?.closeQueues(true)
    await prisma.exportArtifact.deleteMany({ where: { batchId: { in: batches } } })
    await prisma.exportBatch.deleteMany({ where: { id: { in: batches } } })
    if (cognitiveId) await prisma.cognitiveAssignment.delete({ where: { id: cognitiveId } })
    if (compositeId) await prisma.compositeAssessment.delete({ where: { id: compositeId } })
    if (userId) await prisma.user.delete({ where: { id: userId } })
    for (const path of paths) await fs.rm(path, { force: true })
    await prisma.$disconnect()
  })
  it('publishes real generation-bound files, replays lost responses, and denies revoked workers', async () => {
    queues = await import('../../config/queue'); processor = await import('../../workers/exportProcessor')
    const { enqueueExportJob } = await import('../../services/exportJobService')
    const { resolveAssessmentExport } = await import('../../services/assessmentExportArtifact')
    const { resolveCompositeExportProjectionBinding } = await import('../../modules/composite/composite-export-projection')
    userId = (await prisma.user.create({ data: { username: `worker-export-${randomUUID()}`, passwordHash: 'test-only', role: 'ADMIN' } })).id
    const config = await prisma.cognitiveTestConfig.findUniqueOrThrow({ where: { testType_configVersion: { testType: 'fake', configVersion: '1.0.0' } } })
    cognitiveId = (await prisma.cognitiveAssignment.create({ data: { title: 'worker snapshot', configId: config.id, createdBy: userId } })).id
    compositeId = (await prisma.compositeAssessment.create({ data: { name: 'worker snapshot', code: randomUUID(), createdBy: userId } })).id
    for (const type of ['COGNITIVE', 'COMPOSITE'] as const) {
      const id = type === 'COGNITIVE' ? cognitiveId : compositeId
      const projectionFingerprint = type === 'COGNITIVE' ? 'cognitive-frozen-export-v1' : (await resolveCompositeExportProjectionBinding(id)).fingerprint
      const request = { resourceType: type, resourceId: id, createdBy: userId, anonymized: true, format: 'csv', recordCount: 0,
        requestKey: randomUUID(), options: { anonymize: true, detail: 'summary' as const, creatorRole: 'ADMIN' as const, projectionFingerprint } }
      const batch = await enqueueExportJob(request); batches.push(batch.batchId)
      expect((await enqueueExportJob(request)).batchId).toBe(batch.batchId)
      const job = await queues.exportQueue.getJob(`export-${batch.batchId}`)
      await job!.finished()
      const artifact = await prisma.exportArtifact.findUniqueOrThrow({ where: { id: batch.artifacts[0].id } })
      expect(artifact.status).toBe('READY'); expect(artifact.storageKey).toContain('__generation_1')
      const filePath = await resolveAssessmentExport({ resourceType: type, resourceId: id, actor: { userId, role: 'ADMIN' }, fileName: artifact.storageKey, projectionFingerprint })
      expect(filePath).toBeTruthy(); paths.push(filePath!)
      expect((await fs.stat(filePath!)).size).toBeGreaterThan(0)
    }
    await prisma.user.update({ where: { id: userId }, data: { isFrozen: true } })
    const denied = await enqueueExportJob({ resourceType: 'COGNITIVE', resourceId: cognitiveId, createdBy: userId, anonymized: true,
      format: 'csv', recordCount: 0, requestKey: randomUUID(), options: { anonymize: true, detail: 'summary', creatorRole: 'ADMIN', projectionFingerprint: 'cognitive-frozen-export-v1' } })
    batches.push(denied.batchId)
    const job = await queues.exportQueue.getJob(`export-${denied.batchId}`)
    await expect(job!.finished()).rejects.toThrow()
    expect((await prisma.exportArtifact.findUniqueOrThrow({ where: { id: denied.artifacts[0].id } })).status).toBe('FAILED')
  }, 60000)
})
