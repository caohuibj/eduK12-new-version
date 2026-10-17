import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { assetStorageKey } from './assetStorageKey'

/** Maintenance-only: callers must verify both remote bodies before binding.
 * No HTTP endpoint accepts a physical storage pointer. IDs/scopes stay intact.
 */
export const shareAssetStorage = async (input: {
  assetId: string; canonicalId: string; canonicalKey: string
  sha256: string; sizeBytes: number; mimeType: string
}): Promise<void> => {
  if (input.assetId === input.canonicalId || !input.canonicalKey.startsWith('assets/')) throw new Error('Invalid sharing plan')
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'eduk12:cos:' + input.canonicalKey}, 0))::text`)
    // Lock logical records as well: compensation/deletion cannot remove a
    // canonical record between validation and pointer installation.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM stored_assets WHERE id IN (${input.assetId}, ${input.canonicalId}) ORDER BY id FOR UPDATE`)
    const rows = await tx.storedAsset.findMany({ where: { id: { in: [input.assetId, input.canonicalId] } } })
    const target = rows.find(a => a.id === input.assetId)
    const canonical = rows.find(a => a.id === input.canonicalId)
    if (!target || !canonical || rows.some(a => a.deletedAt || a.provider !== 'cos'
      || a.sha256 !== input.sha256 || a.sizeBytes !== input.sizeBytes || a.mimeType !== input.mimeType)
      || canonical.storageObjectKey || canonical.objectKey !== input.canonicalKey
      || (target.storageObjectKey && assetStorageKey(target) !== input.canonicalKey)) throw new Error('Sharing plan no longer matches assets')
    await tx.storedAsset.update({ where: { id: target.id }, data: { storageObjectKey: input.canonicalKey } })
  }, { maxWait: 5000, timeout: 10000 })
}
