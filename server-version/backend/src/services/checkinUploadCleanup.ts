import { prisma } from '../config/database'
import { discardUnreferencedAsset } from './assetStorage'
import { resolveCheckinUploadCleanupConfig } from '../config/checkinUploadCleanup'

export const STUDENT_UPLOAD_REFERENCE_ENTITY = 'CheckinStudentUploadSession'
export const STUDENT_UPLOAD_PENDING_ENTITY = 'CheckinStudentUploadPending'
export const PUBLIC_UPLOAD_REFERENCE_ENTITY = 'CheckinUploadSession'
export const PUBLIC_UPLOAD_REFERENCE_FIELD = 'staging'
export const MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION = 9
export const PUBLIC_UPLOAD_STAGING_TTL_MS = 24 * 60 * 60 * 1000

/** One bounded best-effort sweep, called only by maintenance, never an HTTP handler.
 * Existing retirement/reference checks and physical-deletion semantics are unchanged.
 * This is not durable GC: a process exit or failed physical delete can leave an orphan.
 * The bound is per category/per process, not a cluster-wide deletion guarantee.
 */
export const cleanupStalePublicUploadAssets = async (
  batchSize = resolveCheckinUploadCleanupConfig().batchSize,
): Promise<void> => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error('Checkin upload cleanup batch size must be between 1 and 25')
  }
  const now = Date.now()
  const cutoff = new Date(now - PUBLIC_UPLOAD_STAGING_TTL_MS)
  const staleReferences = await prisma.assetReference.findMany({
    where: { entityType: { in: [PUBLIC_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_PENDING_ENTITY] }, createdAt: { lt: cutoff } },
    select: { id: true, asset: { select: { id: true, objectKey: true, provider: true } } },
    orderBy: { createdAt: 'asc' }, take: batchSize,
  })
  if (staleReferences.length) {
    await prisma.assetReference.deleteMany({ where: { id: { in: staleReferences.map(row => row.id) }, createdAt: { lt: cutoff } } })
    for (const row of staleReferences) await discardUnreferencedAsset(row.asset)
  }
  const staleAssets = await prisma.storedAsset.findMany({
    where: { accessScope: 'PUBLIC_CHECKIN', deletedAt: null, createdAt: { lt: cutoff }, references: { none: {} } },
    select: { id: true, objectKey: true, provider: true }, orderBy: { createdAt: 'asc' }, take: batchSize,
  })
  for (const asset of staleAssets) await discardUnreferencedAsset(asset)
}
