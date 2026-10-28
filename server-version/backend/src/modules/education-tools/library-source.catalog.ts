import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {assertLibraryResourcesAuthority} from '../scale-library-governance/authority'
import {ScaleLibraryError} from '../scale-library-governance/contracts'
import {AdminPermissionError} from '../admin-permissions/service'
import {ContentAuthorityError} from '../measurement-content/content-authority'

export const educationLibraryCatalogQuery=z.object({cursor:z.string().guid().optional(),q:z.string().trim().max(160).optional()}).strict()
type Header={entryId:string;releaseId:string;contentHash:string;snapshotHash:string;title:string;sourceProduct:string;version:string;
 language:string|null;nativeReportVersion:string|null;compatible:boolean;dependencies:Array<{releaseId:string;contentHash:string;layer:string;version:string}>}
const libraryHeaderFields=(entry:'SCHOOL'|'TEACHER')=>Prisma.sql`e.id AS "entryId",e.release_id AS "releaseId",m.content_hash AS "contentHash",
 s.snapshot_hash AS "snapshotHash",s.snapshot->>'title' AS title,s.product AS "sourceProduct",m.version,
 s.snapshot#>>'{compiledDefinition,versionAxes,locale}' AS language,s.snapshot#>>'{compiledDefinition,report,reportVersion}' AS "nativeReportVersion",
 (cardinality(s.dependency_release_ids)=0 AND s.snapshot#>>'{compiledDefinition,referencePolicy,type}'='none'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.snapshot#>'{educationApplicability,administrations}') a
   WHERE a->>'population'=${entry==='SCHOOL'?'STUDENT':'TEACHER'} AND a->>'responseMode'='SELF')
  AND NOT EXISTS(SELECT 1 FROM scales installed WHERE installed.library_entry_id=e.id AND installed.status<>'PUBLISHED')
  AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop WHERE stop.target_kind='RELEASE' AND stop.target_id=e.release_id
   OR stop.target_kind='TRAINING_SCALE' AND EXISTS(SELECT 1 FROM scales installed WHERE installed.library_entry_id=e.id AND installed.id=stop.target_id))) AS compatible,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('releaseId',dep.id,'contentHash',dep.content_hash,'layer',dep.layer,'version',dep.version) ORDER BY dep.id),'[]')
  FROM measurement_content_releases dep WHERE dep.id=ANY(s.dependency_release_ids)) AS dependencies`
const projectLibraryHeader=(row:Header)=>({catalogKey:`education-library-source:${row.entryId}:${row.snapshotHash}`,kind:'SCALE' as const,
 sourceProvider:'LIBRARY_SCALE' as const,sourceId:row.entryId,contentHash:row.snapshotHash,measurement:{releaseId:row.releaseId,contentHash:row.contentHash},
 title:row.title,sourceProduct:row.sourceProduct,language:row.language,versions:{content:row.version,
  parameters:row.dependencies.filter(d=>d.layer==='REFERENCE').map(d=>d.version).join('、')||null,
  report:row.dependencies.filter(d=>d.layer==='REPORT').map(d=>d.version).join('、')||row.nativeReportVersion},
 sourceLabel:'获授权共用量表固定版本',canEditOriginal:false as const,canDistribute:false as const,
 allowedActions:row.compatible?['REFERENCE_FIXED_VERSION']:[],runtimeStatus:row.compatible?'COMPOSITION_READY':'COMPOSITION_ADAPTER_UNAVAILABLE',
 ...(!row.compatible?{unavailableReason:'该版本的参考／报告依赖、自评变体或当前停用状态尚不满足本入口普通问卷，原始内容保持不变。'}:{})})

/** Draft reopening resolves only authorized exact headers, not source bodies. */
export async function readEducationLibrarySourceSummaries(tx:Prisma.TransactionClient,c:PrivateToolContext,sources:readonly {versionId:string;contentHash:string}[]){
 const ids=[...new Set(sources.map(source=>source.versionId))]
 const uses=await readEducationLibrarySourceUses(tx,c,ids),visible=ids.filter(id=>uses.has(id))
 if(!visible.length)return []
 const rows=await tx.$queryRaw<Header[]>(Prisma.sql`SELECT ${libraryHeaderFields(c.entry)}
  FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
  JOIN measurement_content_releases m ON m.id=e.release_id AND m.status='PUBLISHED' AND m.layer='MEASUREMENT' AND m.family='SCALE'
  WHERE e.id IN (${Prisma.join(visible)}) AND e.status='ACTIVE' ORDER BY e.id`)
 return rows.filter(row=>sources.some(source=>source.versionId===row.entryId&&source.contentHash===row.snapshotHash)).map(projectLibraryHeader)
}
export type EducationLibrarySourceUse={id:string;entryId:string;releaseId:string;issuerId:string;authorityGrantId:string|null;version:number;scopeKind:'USER'|'ORGANIZATION';expiresAt?:Date|null}

/** Already-authorized education author only, in this same transaction. Existing
 * USER/ORGANIZATION U stays independent from the issuer's D. This read-only seam
 * creates no runtime resources or use grant. The protected-write mode MUST
 * run before any organization lock; its User/root/U locks last to tx commit. */
export async function readEducationLibrarySourceUses(tx:Prisma.TransactionClient,c:PrivateToolContext,entryIds:readonly string[],options:{lockForUse?:boolean}={}){
 const ids=[...new Set(entryIds)];if(!ids.length)return new Map<string,EducationLibrarySourceUse>()
 if(ids.length>128)throw new ScaleLibraryError(400,'共用量表来源范围过大')
 const candidates=Prisma.sql`SELECT g.id,g.entry_id AS "entryId",e.release_id AS "releaseId",g.issuer_id AS "issuerId",
  g.authority_grant_id AS "authorityGrantId",g.version,g.scope_kind AS "scopeKind"
  FROM scale_library_use_grants g JOIN scale_library_entries e ON e.id=g.entry_id AND e.status='ACTIVE'
  JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
  JOIN measurement_content_releases m ON m.id=e.release_id AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
  WHERE g.entry_id IN (${Prisma.join(ids)}) AND g.product=${c.entry} AND g.organization_id=${c.organizationId} AND g.status='ACTIVE'
   AND ((g.scope_kind='USER' AND g.user_id=${c.principal.userId}) OR (g.scope_kind='ORGANIZATION' AND g.user_id IS NULL))
`
 const rows=await tx.$queryRaw<EducationLibrarySourceUse[]>(options.lockForUse?Prisma.sql`
  WITH candidates AS MATERIALIZED (${candidates}),locked_issuers AS MATERIALIZED (
   SELECT u.id FROM users u WHERE u.id IN (
    SELECT "issuerId" FROM candidates UNION SELECT ancestor.subject_id FROM candidates candidate
     JOIN content_capability_grants leaf ON leaf.id=candidate."authorityGrantId"
     JOIN content_capability_grants ancestor ON ancestor.id=ANY(leaf.ancestry)
   ) ORDER BY u.id FOR SHARE OF u
  ) SELECT candidate.* FROM candidates candidate CROSS JOIN (SELECT count(*) FROM locked_issuers) locked
  ORDER BY "issuerId","authorityGrantId" NULLS FIRST,"entryId",id`:
  Prisma.sql`${candidates} ORDER BY g.issuer_id,g.authority_grant_id NULLS FIRST,g.entry_id,g.id`)

 const groups=new Map<string,EducationLibrarySourceUse[]>()
 for(const row of rows){const key=JSON.stringify([row.issuerId,row.authorityGrantId]),group=groups.get(key)??[];group.push(row);groups.set(key,group)}
 const allowed=new Map<string,EducationLibrarySourceUse>(),qualified:EducationLibrarySourceUse[]=[]
 for(const group of groups.values()){
  const first=group[0]
  try{
   await assertLibraryResourcesAuthority(tx,first.issuerId,[...new Set(group.map(row=>row.releaseId))],'material.distribute',c.entry,first.authorityGrantId??undefined)
   qualified.push(...group)
   for(const row of group)if(!allowed.has(row.entryId))allowed.set(row.entryId,row)
  }catch(error){
   // A second independent U remains eligible. Do not hide infrastructure or
   // integrity failures behind a permissive fallback or a stale cached grant.
   if(!(error instanceof ContentAuthorityError)&&!((error instanceof ScaleLibraryError||error instanceof AdminPermissionError)&&error.statusCode===403))throw error
  }
 }
 if(options.lockForUse&&qualified.length){
  // Every possible issuer/ancestor User is already SHARE-locked before any
  // organization mutex. Lock only preselected U rows; a new issuer cannot be
  // substituted during a wait. Current D chains stay held from the batch above.
  const current=await tx.$queryRaw<EducationLibrarySourceUse[]>(Prisma.sql`SELECT g.id,g.entry_id AS "entryId",e.release_id AS "releaseId",
   g.issuer_id AS "issuerId",g.authority_grant_id AS "authorityGrantId",g.version,g.scope_kind AS "scopeKind",
   LEAST(issuer.expires_at,(SELECT min(LEAST(a.expires_at,subject.expires_at)) FROM content_capability_grants leaf
    JOIN content_capability_grants a ON a.id=ANY(leaf.ancestry) JOIN users subject ON subject.id=a.subject_id
    WHERE leaf.id=g.authority_grant_id)) AS "expiresAt"
   FROM scale_library_use_grants g JOIN scale_library_entries e ON e.id=g.entry_id JOIN users issuer ON issuer.id=g.issuer_id
   WHERE g.id IN (${Prisma.join(qualified.map(row=>row.id))}) AND g.product=${c.entry} AND g.organization_id=${c.organizationId} AND g.status='ACTIVE'
    AND ((g.scope_kind='USER' AND g.user_id=${c.principal.userId}) OR (g.scope_kind='ORGANIZATION' AND g.user_id IS NULL))
   ORDER BY g.entry_id,g.id FOR SHARE OF g`)
  allowed.clear()
  for(const row of current)if(!allowed.has(row.entryId))allowed.set(row.entryId,row)
 }
 return allowed
}

/** Current availability only; immutable bodies were verified at sealing. No
 * grant chain, media download or whole-source hash reconstruction belongs here. */
export async function assertEducationLibraryHeaders(tx:Prisma.TransactionClient,sources:readonly {versionId:string;contentHash:string}[],lock=false){
 const ids=[...new Set(sources.map(source=>source.versionId))];if(!ids.length)return
 const rows=await tx.$queryRaw<Array<{id:string;hash:string}>>(Prisma.sql`SELECT e.id,s.snapshot_hash AS hash
  FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
  JOIN measurement_content_releases m ON m.id=e.release_id AND m.status='PUBLISHED'
  WHERE e.id IN (${Prisma.join(ids)}) AND e.status='ACTIVE' ORDER BY e.id ${lock?Prisma.sql`FOR SHARE OF e,s,m`:Prisma.empty}`)
 if(sources.some(source=>!rows.some(row=>row.id===source.versionId&&row.hash===source.contentHash)))privateToolFail('LIBRARY_SOURCE_UNAVAILABLE',409)
}

/** Bounded original-library metadata, never the workflow-only registered Scale
 * catalog. Original questions, scoring/P/R bodies, media and source-owner data
 * are absent. Discovery itself does not materialize a Scale or Composite. */
export async function listEducationLibrarySources(c:PrivateToolContext,raw:unknown){
 const input=educationLibraryCatalogQuery.parse(raw)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const rows=await tx.$queryRaw<Header[]>(Prisma.sql`SELECT ${libraryHeaderFields(c.entry)}
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
  return {list:selected.map(projectLibraryHeader),
   nextCursor:moreVisible?selected.at(-1)!.entryId:moreCandidates?scanned.at(-1)!.entryId:null}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
