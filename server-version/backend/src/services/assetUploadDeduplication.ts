import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { config } from '../config'
import { cos, deleteFromCOS } from '../utils/cos'
import { assetStorageKey } from './assetStorageKey'

const objectMetadataMatches = (key: string, sha256: string, size: number, mimeType: string): Promise<boolean> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('COS duplicate validation unavailable')), 3000)
  try {
    cos.headObject({ Bucket: config.cosBucket!, Region: config.cosRegion!, Key: key }, (error, result) => {
      clearTimeout(timer)
      if (error) { if (error.statusCode === 404) return resolve(false); return reject(new Error('COS duplicate validation unavailable')) }
      const headers = (result.headers || {}) as Record<string, string | number | undefined>
      const digest = headers['x-cos-meta-sha256']
      const type = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      resolve(Number(headers['content-length']) === size && (!digest || digest === sha256)
        && (!type || type === mimeType.toLowerCase()))
    })
  } catch { clearTimeout(timer); reject(new Error('COS duplicate validation unavailable')) }
})

/** Existing content can be registered without a second COS upload.
 * First uploads use an owned unique key before the final registration transaction.
 * Only registration is serialized: no video transfer holds a database lease.
 * Every caller gets a new logical identity and its own authorization fields.
 */
export const registerCOSAssetUpload = async (data: Prisma.StoredAssetCreateInput, mode: 'reuse-only' | 'uploaded' = 'uploaded') => {
  if (data.provider !== 'cos' || !data.id || !/^assets\/[A-Za-z0-9_.-]+$/.test(data.objectKey)
    || !/^[a-f0-9]{64}$/.test(data.sha256) || data.storageObjectKey) throw new Error('Invalid COS upload registration')
  return prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'eduk12:asset-content:' + data.sha256 + ':' + data.sizeBytes + ':' + data.mimeType}, 0))::text`)
    const candidate = await tx.storedAsset.findFirst({
      where: { provider: 'cos', sha256: data.sha256, sizeBytes: data.sizeBytes, mimeType: data.mimeType, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }) || await tx.storedAsset.findFirst({
      where: { provider: 'cos', sha256: data.sha256, sizeBytes: data.sizeBytes, mimeType: data.mimeType, deletedAt: { not: null } },
      orderBy: [{ deletedAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    })
    let sharedKey: string | null = null
    if (candidate) {
      const key = assetStorageKey(candidate)
      if (/^assets\/[A-Za-z0-9_./-]+$/.test(key) && !key.includes('..') && key !== data.objectKey) {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'eduk12:cos:' + key}, 0))::text`)
        await tx.$queryRaw(Prisma.sql`SELECT id FROM stored_assets WHERE id = ${candidate.id} FOR UPDATE`)
        const current = await tx.storedAsset.findUnique({ where: { id: candidate.id } })
        if (current && current.provider === 'cos' && current.sha256 === data.sha256
          && current.sizeBytes === data.sizeBytes && current.mimeType === data.mimeType
          && assetStorageKey(current) === key && await objectMetadataMatches(key, data.sha256, data.sizeBytes, data.mimeType)) sharedKey = key
      }
    }
    if (mode === 'reuse-only' && !sharedKey) return null
    return tx.storedAsset.create({ data: { ...data, storageObjectKey: sharedKey, duplicateCleanupPending: Boolean(sharedKey && mode === 'uploaded') } })
  }, { maxWait: 3000, timeout: 10000 })
}

/** A failed delete never fails an already committed logical upload. The marker
 * and original key form a durable, bounded retry intent; no Redis-only queue.
 */
export const cleanupAssetUploadDuplicate = async (assetId: string): Promise<boolean> => {
  try {
    const asset = await prisma.storedAsset.findUnique({ where: { id: assetId } })
    if (!asset || !asset.duplicateCleanupPending) return true
    if (asset.provider !== 'cos' || !asset.storageObjectKey || asset.storageObjectKey === asset.objectKey
      || !/^assets\/[A-Za-z0-9_.-]+$/.test(asset.objectKey)) return false
    await deleteFromCOS(asset.objectKey)
    await prisma.storedAsset.updateMany({
      where: { id: asset.id, objectKey: asset.objectKey, storageObjectKey: asset.storageObjectKey, duplicateCleanupPending: true },
      data: { duplicateCleanupPending: false },
    })
    return true
  } catch { return false }
}

export const cleanupPendingAssetUploads = async () => {
  // Literal predicate keeps the partial retry index usable for generic plans.
  const assets = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM stored_assets WHERE provider = 'cos' AND duplicate_cleanup_pending = true
    ORDER BY updated_at ASC, id ASC LIMIT 4
  `)
  let cleaned = 0
  for (const asset of assets) if (await cleanupAssetUploadDuplicate(asset.id)) cleaned++
  return { selected: assets.length, cleaned, pending: assets.length - cleaned }
}
