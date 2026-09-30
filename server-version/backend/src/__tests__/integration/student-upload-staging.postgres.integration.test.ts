import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { storeAsset, getLocalAssetPath } from '../../services/assetStorage'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { stageStudentUploadAsset, STUDENT_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_PENDING_ENTITY, cleanupStalePublicUploadAssets } from '../../controllers/checkinController'
const suite = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL') ? describe : describe.skip
suite('student staging concurrency and abandonment', () => {
  const checkinId = randomUUID(), userId = randomUUID(), ids: string[] = [], paths: string[] = []
  afterAll(async () => {
    await prisma.assetReference.deleteMany({ where: { assetId: { in: ids } } })
    await prisma.storedAsset.deleteMany({ where: { id: { in: ids } } })
    for (const path of paths) await fs.rm(path, { force: true })
    await prisma.$disconnect()
  })
  it('admits exactly nine concurrent staged images and reclaims expired abandoned assets', async () => {
    for (let i = 0; i < 10; i++) {
      const row = await storeAsset({ buffer: Buffer.from('test-only-asset'), originalName: 'test.png', mimeType: 'image/png', ownerId: userId, accessScope: 'COURSE', scopeId: checkinId, initialReference: { entityType: STUDENT_UPLOAD_PENDING_ENTITY, entityId: `${checkinId}:${userId}`, field: 'pending' } }); ids.push(row.id); paths.push(getLocalAssetPath(row.objectKey))
    }
    const results = await Promise.allSettled(ids.map(id => prisma.$transaction(tx => stageStudentUploadAsset(tx, checkinId, userId, id))))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(9)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await prisma.assetReference.count({ where: { entityType: STUDENT_UPLOAD_REFERENCE_ENTITY, entityId: `${checkinId}:${userId}` } })).toBe(9)
    // The rejected or process-interrupted pre-staging asset stays tracked for cleanup.
    expect(await prisma.assetReference.count({ where: { entityType: STUDENT_UPLOAD_PENDING_ENTITY, entityId: `${checkinId}:${userId}` } })).toBe(1)
    await prisma.assetReference.updateMany({ where: { assetId: { in: ids } }, data: { createdAt: new Date(0) } })
    await cleanupStalePublicUploadAssets()
    expect(await prisma.assetReference.count({ where: { assetId: { in: ids } } })).toBe(0)
    expect(await prisma.storedAsset.count({ where: { id: { in: ids } } })).toBe(0)
    for (const path of paths) await expect(fs.stat(path)).rejects.toThrow()
  })
})
