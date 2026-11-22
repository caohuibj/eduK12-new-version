import {Prisma} from '@prisma/client'
import {withStartNestedQueryRawLabel} from '../../services/runtimeObservability'
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
  if(!original.length&&!scales.length&&!drafts.length)return
  // Coalesce scales FOR SHARE -> drafts FOR SHARE -> release ancestors ->
  // releases FOR SHARE into one roundtrip with deterministic lock ordering,
  // then check scale_library_emergency_stops in a separate statement so
  // READ COMMITTED takes a fresh snapshot AFTER waiting on any in-flight stop.
  const [resolved]=await withStartNestedQueryRawLabel<Array<{
    seed_ids:string[]
    release_ids:string[]
    truncated:boolean
    locked_release_count:number
  }>>('library_lock_and_ancestors', () => tx.$queryRaw<Array<{
    seed_ids:string[]
    release_ids:string[]
    truncated:boolean
    locked_release_count:number
  }>>(Prisma.sql`WITH RECURSIVE
    locked_scales AS MATERIALIZED (
      SELECT id,measurement_release_id FROM scales
      WHERE cardinality(${scales}::text[])>0 AND id=ANY(${scales}::text[])
      ORDER BY id FOR SHARE
    ),
    locked_drafts AS MATERIALIZED (
      SELECT id FROM survey_instrument_drafts
      WHERE cardinality(${drafts}::text[])>0 AND (SELECT count(*) FROM locked_scales)>=0 AND id=ANY(${drafts}::text[])
      ORDER BY id FOR SHARE
    ),
    seed_ids AS MATERIALIZED (
      SELECT DISTINCT id FROM (
        SELECT unnest(${original}::text[]) AS id
        UNION ALL
        SELECT measurement_release_id AS id FROM locked_scales WHERE measurement_release_id IS NOT NULL
      ) s
    ),
    ancestors AS (
      SELECT id,CASE WHEN provenance->>'authoringRelationship' IN ('ORIGINAL','REVISION','COPY') THEN NULL ELSE source_release_id END AS source_release_id,ARRAY[id] AS path
      FROM measurement_content_releases WHERE id IN (SELECT id FROM seed_ids)
      UNION ALL
      SELECT r.id,CASE WHEN r.provenance->>'authoringRelationship' IN ('ORIGINAL','REVISION','COPY') THEN NULL ELSE r.source_release_id END,a.path||r.id
      FROM measurement_content_releases r JOIN ancestors a ON r.id=a.source_release_id
      WHERE NOT r.id=ANY(a.path) AND cardinality(a.path)<100
    ),
    resolved AS MATERIALIZED (
      SELECT id,bool_or(cardinality(path)>=100 AND source_release_id IS NOT NULL) AS truncated
      FROM ancestors GROUP BY id
    ),
    locked_releases AS MATERIALIZED (
      SELECT id FROM measurement_content_releases
      WHERE (SELECT count(*) FROM locked_drafts)>=0 AND id IN (SELECT id FROM resolved)
      ORDER BY id FOR SHARE
    )
    SELECT
      COALESCE((SELECT array_agg(id ORDER BY id) FROM seed_ids),ARRAY[]::text[]) AS seed_ids,
      COALESCE((SELECT array_agg(id ORDER BY id) FROM resolved),ARRAY[]::text[]) AS release_ids,
      COALESCE((SELECT bool_or(truncated) FROM resolved),false) AS truncated,
      (SELECT count(*)::int FROM locked_releases) AS locked_release_count`))
  const seeds=resolved?.seed_ids??original
  const releases=resolved?.release_ids??[]
  const releaseSet=new Set(releases)
  if(resolved?.truncated||seeds.some(id=>!releaseSet.has(id))||resolved?.locked_release_count!==releases.length)throw new ScaleLibraryError(409,'量表依赖身份不完整')
  if(releases.length>1000)throw new ScaleLibraryError(409,'量表依赖数量超限')
  const rows=await withStartNestedQueryRawLabel<Array<{target_id:string}>>('library_emergency_stops', () => tx.$queryRaw<Array<{target_id:string}>>(Prisma.sql`SELECT target_id FROM scale_library_emergency_stops
    WHERE (target_kind='RELEASE' AND target_id=ANY(${releases}::text[]))
      OR (target_kind='TRAINING_SCALE' AND target_id=ANY(${scales}::text[]))
      OR (target_kind='SURVEY_INSTRUMENT' AND target_id=ANY(${drafts}::text[]))`))
  if(rows.length)throw new ScaleLibraryError(409,'该量表版本已紧急停用，停止新增进入和采集；历史结果保留')
}
