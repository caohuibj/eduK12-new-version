import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import type {PrivateToolContext} from './private-tool.contracts'
import {assertLibraryResourcesAuthority} from '../scale-library-governance/authority'
import {ScaleLibraryError} from '../scale-library-governance/contracts'
import {AdminPermissionError} from '../admin-permissions/service'
import {ContentAuthorityError} from '../measurement-content/content-authority'

export const educationLibraryCatalogQuery=z.object({cursor:z.string().guid().optional(),q:z.string().trim().max(160).optional()}).strict()
type Header={entryId:string;releaseId:string;contentHash:string;snapshotHash:string;title:string;sourceProduct:string;version:string;
 language:string|null;dependencies:Array<{releaseId:string;contentHash:string;layer:string;version:string}>}
type Grant={id:string;entryId:string;releaseId:string;issuerId:string;authorityGrantId:string|null;version:number;scopeKind:'USER'|'ORGANIZATION'}

/** Already-authorized education author only, in this same transaction. Existing
 * USER/ORGANIZATION U stays independent from the issuer's D. This read-only seam
 * does not hold an organization lock, create runtime resources, or grant use. */
export async function readEducationLibrarySourceUses(tx:Prisma.TransactionClient,c:PrivateToolContext,entryIds:readonly string[]){
 const ids=[...new Set(entryIds)];if(!ids.length)return new Map<string,Grant>()
 if(ids.length>128)throw new ScaleLibraryError(400,'共用量表来源范围过大')
 const rows=await tx.$queryRaw<Grant[]>(Prisma.sql`SELECT g.id,g.entry_id AS "entryId",e.release_id AS "releaseId",g.issuer_id AS "issuerId",
  g.authority_grant_id AS "authorityGrantId",g.version,g.scope_kind AS "scopeKind"
  FROM scale_library_use_grants g JOIN scale_library_entries e ON e.id=g.entry_id AND e.status='ACTIVE'
  JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
  JOIN measurement_content_releases m ON m.id=e.release_id AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
  WHERE g.entry_id IN (${Prisma.join(ids)}) AND g.product=${c.entry} AND g.organization_id=${c.organizationId} AND g.status='ACTIVE'
   AND ((g.scope_kind='USER' AND g.user_id=${c.principal.userId}) OR (g.scope_kind='ORGANIZATION' AND g.user_id IS NULL))
  ORDER BY g.issuer_id,g.authority_grant_id NULLS FIRST,g.entry_id,g.id`)
 const groups=new Map<string,Grant[]>()
 for(const row of rows){const key=JSON.stringify([row.issuerId,row.authorityGrantId]),group=groups.get(key)??[];group.push(row);groups.set(key,group)}
 const allowed=new Map<string,Grant>()
 for(const group of groups.values()){
  const first=group[0]
  try{
   await assertLibraryResourcesAuthority(tx,first.issuerId,[...new Set(group.map(row=>row.releaseId))],'material.distribute',c.entry,first.authorityGrantId??undefined)
   for(const row of group)if(!allowed.has(row.entryId))allowed.set(row.entryId,row)
  }catch(error){
   // A second independent U remains eligible. Do not hide infrastructure or
   // integrity failures behind a permissive fallback or a stale cached grant.
   if(!(error instanceof ContentAuthorityError)&&!((error instanceof ScaleLibraryError||error instanceof AdminPermissionError)&&error.statusCode===403))throw error
  }
 }
 return allowed
}

/** Bounded original-library metadata, never the workflow-only registered Scale
 * catalog. Original questions, scoring/P/R bodies, media and source-owner data
 * are absent. Discovery itself does not materialize a Scale or Composite. */
export async function listEducationLibrarySources(c:PrivateToolContext,raw:unknown){
 const input=educationLibraryCatalogQuery.parse(raw)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const rows=await tx.$queryRaw<Header[]>(Prisma.sql`SELECT e.id AS "entryId",e.release_id AS "releaseId",m.content_hash AS "contentHash",
   s.snapshot_hash AS "snapshotHash",s.snapshot->>'title' AS title,s.product AS "sourceProduct",m.version,
   s.snapshot#>>'{compiledDefinition,versionAxes,locale}' AS language,
   (SELECT COALESCE(jsonb_agg(jsonb_build_object('releaseId',dep.id,'contentHash',dep.content_hash,'layer',dep.layer,'version',dep.version) ORDER BY dep.id),'[]')
    FROM measurement_content_releases dep WHERE dep.id=ANY(s.dependency_release_ids)) AS dependencies
   FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
   JOIN measurement_content_releases m ON m.id=e.release_id AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
   WHERE e.status='ACTIVE' AND (${input.cursor??null}::text IS NULL OR e.id>${input.cursor??null})
    AND (${input.q??''}='' OR strpos(lower(s.snapshot->>'title'),lower(${input.q??''}))>0)
    AND EXISTS(SELECT 1 FROM scale_library_use_grants g WHERE g.entry_id=e.id AND g.product=${c.entry}
     AND g.organization_id=${c.organizationId} AND g.status='ACTIVE'
     AND ((g.scope_kind='USER' AND g.user_id=${c.principal.userId}) OR (g.scope_kind='ORGANIZATION' AND g.user_id IS NULL)))
   ORDER BY e.id LIMIT 121`)
  const scanned=rows.slice(0,120),allowed=await readEducationLibrarySourceUses(tx,c,scanned.map(row=>row.entryId))
  const visible=scanned.filter(row=>allowed.has(row.entryId)),selected=visible.slice(0,40)
  const moreVisible=visible.length>40,moreCandidates=rows.length>120
  return {list:selected.map(row=>({catalogKey:`education-library-source:${row.entryId}:${row.snapshotHash}`,kind:'SCALE' as const,
   sourceProvider:'LIBRARY_SCALE' as const,sourceId:row.entryId,contentHash:row.snapshotHash,measurement:{releaseId:row.releaseId,contentHash:row.contentHash},
   title:row.title,sourceProduct:row.sourceProduct,language:row.language,versions:{content:row.version,parameters:row.dependencies.filter(d=>d.layer==='REFERENCE').map(d=>d.version),report:row.dependencies.filter(d=>d.layer==='REPORT').map(d=>d.version)},
   sourceLabel:'获授权共用量表固定版本',canEditOriginal:false,canDistribute:false,allowedActions:[],runtimeStatus:'COMPOSITION_ADAPTER_PENDING',
   unavailableReason:'该来源的普通问卷执行适配正在接入，当前仅展示已获授权的固定版本。'})),
   nextCursor:moreVisible?selected.at(-1)!.entryId:moreCandidates?scanned.at(-1)!.entryId:null}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
