import {Prisma} from '@prisma/client'
import {ScaleLibraryError} from './contracts'
/** Lock existing immutable identities, not an absent stop row. Emergency writes
 * touch that existing identity in the same transaction as the stop insert. At
 * SERIALIZABLE an old snapshot receives 40001 instead of missing a committed stop;
 * READ COMMITTED reads the stop after waiting. Keep all locks through collection.
 * FINAL replay returns before this guard; ordinary withdrawal is not a stop. */
export async function assertScaleLibraryCollectionAllowed(tx:Prisma.TransactionClient,releaseIds:readonly string[],scaleIds:readonly string[]=[],surveyDraftIds:readonly string[]=[]){
  const scales=[...new Set(scaleIds.filter(Boolean))].sort(),drafts=[...new Set(surveyDraftIds.filter(Boolean))].sort()
  const original=[...new Set(releaseIds.filter(Boolean))]
  if(original.length+scales.length+drafts.length>200)throw new ScaleLibraryError(409,'量表版本数量超限')
  if(scales.length){const rows=await tx.$queryRaw<Array<{id:string;measurement_release_id:string|null}>>(Prisma.sql`SELECT id,measurement_release_id FROM scales WHERE id=ANY(${scales}::text[]) ORDER BY id FOR SHARE`);original.push(...rows.flatMap(row=>row.measurement_release_id?[row.measurement_release_id]:[]))}
  if(drafts.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM survey_instrument_drafts WHERE id=ANY(${drafts}::text[]) ORDER BY id FOR SHARE`)
  // Include source dependencies without inventing identities for old frozen rows.
  const ancestors=original.length?await tx.$queryRaw<Array<{id:string;truncated:boolean}>>(Prisma.sql`WITH RECURSIVE ancestors AS (
    SELECT id,CASE WHEN provenance->>'authoringRelationship' IN ('ORIGINAL','REVISION','COPY') THEN NULL ELSE source_release_id END AS source_release_id,ARRAY[id] AS path FROM measurement_content_releases WHERE id=ANY(${original}::text[])
    UNION ALL SELECT r.id,CASE WHEN r.provenance->>'authoringRelationship' IN ('ORIGINAL','REVISION','COPY') THEN NULL ELSE r.source_release_id END,a.path||r.id FROM measurement_content_releases r JOIN ancestors a ON r.id=a.source_release_id
      WHERE NOT r.id=ANY(a.path) AND cardinality(a.path)<100
  ) SELECT id,bool_or(cardinality(path)>=100 AND source_release_id IS NOT NULL) AS truncated FROM ancestors GROUP BY id ORDER BY id`):[]
  const releases=ancestors.map(r=>r.id)
  if(ancestors.some(r=>r.truncated)||original.some(id=>!releases.includes(id)))throw new ScaleLibraryError(409,'量表依赖身份不完整')
  if(releases.length>1000)throw new ScaleLibraryError(409,'量表依赖数量超限')
  if(releases.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM measurement_content_releases WHERE id=ANY(${releases}::text[]) ORDER BY id FOR SHARE`)
  const rows=await tx.$queryRaw<Array<{target_id:string}>>(Prisma.sql`SELECT target_id FROM scale_library_emergency_stops
    WHERE (target_kind='RELEASE' AND target_id=ANY(${releases}::text[]))
      OR (target_kind='TRAINING_SCALE' AND target_id=ANY(${scales}::text[]))
      OR (target_kind='SURVEY_INSTRUMENT' AND target_id=ANY(${drafts}::text[]))`)
  if(rows.length)throw new ScaleLibraryError(409,'该量表版本已紧急停用，停止新增进入和采集；历史结果保留')
}
