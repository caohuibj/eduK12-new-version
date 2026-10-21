import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { config } from '../config'

// Grants refer to one exact stored file. They never authorize other files
// belonging to its owner, public submissions, evidence or course-private data.
export const mediaGrantFilter = (actorId: string) => Prisma.sql`
  ${config.materialGrantsEnabled} AND a.access_scope IN ('PRIVATE','PUBLIC')
  AND EXISTS (SELECT 1 FROM material_grants g WHERE g.teacher_id=${actorId}
    AND g.resource_type::text='MEDIA_ASSET' AND g.resource_id=a.id)
`
export const mediaLibraryFilter = Prisma.sql`
  a.deleted_at IS NULL AND a.access_scope IN ('PRIVATE','PUBLIC','COURSE')
  AND u.account_domain IN ('LEGACY','TRAINING')
  AND (a.mime_type LIKE 'image/%' OR a.mime_type LIKE 'video/%' OR a.mime_type='application/pdf')
  AND NOT EXISTS (SELECT 1 FROM instrument_authorizations e WHERE e.evidence_asset_id=a.id)
  AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.thumbnail_asset_id=a.id OR v.processed_asset_id=a.id)
  AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.original_asset_id=a.id AND v.is_deleted)
  AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.asset_id=a.id AND d.is_deleted)
`
export const hasMediaAssetGrant = async (actorId: string, assetId: string): Promise<boolean> => {
  if (!config.materialGrantsEnabled) return false
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id FROM stored_assets a JOIN users u ON u.id=a.owner_id
    WHERE a.id=${assetId} AND ${mediaLibraryFilter} AND ${mediaGrantFilter(actorId)} LIMIT 1
  `)
  return rows.length === 1
}
