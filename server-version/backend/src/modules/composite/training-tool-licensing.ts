import { Prisma } from '@prisma/client'
import { toolLicenseKey, type ToolLicenseFamily } from '../tool-licensing/contracts'
import {
  authorizeToolPublication, isExpandedToolLicensingEnabled, isToolLicensingEnabled, ToolLicenseAccessError,
} from '../tool-licensing/runtime'
import { trainingContentSnapshotSchema } from './training-content-binding'
import { decodeTrainingStandardItemSource } from './training-standard-combination'
import { CompositeServiceError, compositeConflict } from './composite.errors'

type Publication = {
  id: string
  createdBy: string | null
  productKind: string
  questionnaireType?: string | null
  status: string
  items: readonly {
    id: string
    type: string
    scaleId?: string | null
    standardCombinationSource?: unknown
  }[]
}

async function frozenToolKeys(tx: Prisma.TransactionClient, publicationId: string, frozenContent: unknown) {
  const snapshot = trainingContentSnapshotSchema.safeParse(frozenContent)
  if (!snapshot.success || snapshot.data.compositeId !== publicationId)
    throw compositeConflict('发布内容的冻结来源身份无效')
  const candidates = snapshot.data.units.filter(unit =>
    unit.source.libraryEntryId || unit.source.cognitiveProfile || unit.family === 'SJT')
  if (!candidates.length) return []
  const rows = await tx.$queryRaw<Array<{ family: ToolLicenseFamily; key: string | null }>>(Prisma.sql`
    WITH units AS (
      SELECT * FROM (VALUES ${Prisma.join(candidates.map(unit => Prisma.sql`
        (${unit.family}::text,${unit.measurement.releaseId}::text,${unit.measurement.contentHash}::text,
         ${unit.source.id}::text,${unit.source.instrumentKey ?? null}::text)
      `))}) AS source(family,release_id,content_hash,source_id,instrument_key)
    )
    SELECT units.family,CASE units.family
      WHEN 'COGNITIVE' THEN c.test_type
      WHEN 'SJT' THEN CASE WHEN m.scope->>'kind'='PLATFORM' THEN units.instrument_key END
      ELSE m.content_key
    END AS key
    FROM units
    JOIN measurement_content_releases m ON m.id=units.release_id AND m.content_hash=units.content_hash
      AND m.layer='MEASUREMENT' AND m.family=units.family
    LEFT JOIN cognitive_test_configs c ON units.family='COGNITIVE' AND c.id=units.source_id
  `)
  if (rows.length !== candidates.length) throw compositeConflict('发布内容的冻结测量版本已变化')
  return rows.flatMap(row => row.key ? [toolLicenseKey(row.family, row.key)] : [])
}

export async function authorizeTrainingPublishKeys(tx: Prisma.TransactionClient, subjectId: string,
  publicationId: string, toolKeys: readonly string[]) {
  if (!toolKeys.length) return
  try {
    await authorizeToolPublication(tx, { product: 'TRAINING', subjectId, publicationId, toolKeys })
  } catch (error) {
    if (error instanceof ToolLicenseAccessError)
      throw new CompositeServiceError(error.message, error.statusCode)
    throw error
  }
}

/** Use only inside the formal publication transaction. */
export async function authorizeTrainingStandardPublication(tx: Prisma.TransactionClient, publication: Publication, frozenContent?: unknown) {
  if (!isToolLicensingEnabled('TRAINING')) return
  if (publication.productKind !== 'QUESTIONNAIRE' || publication.status !== 'DRAFT'
    || !['COURSE', 'GENERAL'].includes(publication.questionnaireType ?? '')) return
  const keys = new Set<string>()
  for (const item of publication.items) {
    if (item.type !== 'SCALE' || item.standardCombinationSource == null) continue
    if (!publication.createdBy || !item.scaleId) throw compositeConflict('发布量表的冻结来源身份缺失')
    const source = decodeTrainingStandardItemSource(item.standardCombinationSource, {
      compositeId: publication.id, itemId: item.id, scaleId: item.scaleId, ownerId: publication.createdBy,
    })
    keys.add('SCALE:' + source.reference.combination.toolKey)
  }
  if (isExpandedToolLicensingEnabled('TRAINING') && frozenContent !== undefined) {
    for (const key of await frozenToolKeys(tx, publication.id, frozenContent)) keys.add(key)
  }
  if (!keys.size) return
  if (!publication.createdBy) throw compositeConflict('发布内容缺少原作者身份')
  await authorizeTrainingPublishKeys(tx, publication.createdBy, publication.id, [...keys].sort())
}
