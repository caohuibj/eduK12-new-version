import {assertGovernedEntryAllowed} from './governed-tool.service'
import {assertFrozenPackageAdmissions} from './governed-package.service'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getScaleInstrumentSource} from '../scale/onboarding/instrument-registry'
import {snapshotScaleInstrumentSource} from '../scale/onboarding/source-snapshot'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {assertSjtEntryDistributionAuthority,sjtEntryDistributionReceiptSchema,SjtEntryAuthorityError} from '../situational/entry-authority'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {ResearchFrozenPublication} from './publication.service'
export type PolicyIdentity={resourceKey:string;fingerprint:string}
export type ToolPolicy={decision:'PENDING'|'APPROVED'|'RETURNED';paused:boolean;version:number;reason:string}
export const standardPolicyIdentity=(key:string,version:string):PolicyIdentity=>{
 const source=getScaleInstrumentSource(key,version)
 return {resourceKey:`standard:${key}:${version}`,fingerprint:canonicalHash(source?snapshotScaleInstrumentSource(source):{key,version,missing:true})}
}
export async function snapshotPolicyIdentity(tx:Prisma.TransactionClient,snapshot:CatalogSourceSnapshot):Promise<PolicyIdentity>{
 const governed=snapshot.provenance.surveyToolReleaseId
 if(typeof governed==='string')return {resourceKey:'governed-release:'+governed,fingerprint:snapshot.ref.sourceVersion}
 const approved=snapshot.provenance.surveyStandardReleaseId
 if(typeof approved==='string')return {resourceKey:'standard-release:'+approved,fingerprint:snapshot.ref.sourceVersion}
 const entryId=snapshot.provenance.libraryEntryId
 if(typeof entryId==='string'){
  const release=snapshot.provenance.sourceMeasurementRelease as {contentHash?:string}|undefined
  return {resourceKey:'release:'+String((snapshot.provenance.sourceMeasurementRelease as {releaseId?:string}|undefined)?.releaseId??entryId),fingerprint:release?.contentHash??snapshot.definitionDigest}
 }
 if(snapshot.ref.kind==='SCALE'){
  const [scale]=await tx.$queryRaw<Array<{code:string;instrument_version:string}>>`SELECT code,instrument_version FROM scales WHERE id=${snapshot.ref.sourceId}`
  if(scale)return standardPolicyIdentity(scale.code,scale.instrument_version)
 }
 return {resourceKey:`${snapshot.ref.kind}:${snapshot.ref.sourceId}:${snapshot.ref.sourceVersion}`,fingerprint:snapshot.definitionDigest}
}
export async function readToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,lock=false):Promise<ToolPolicy>{
 if(lock)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-tool:'+identity.resourceKey}))`
 const rows=await tx.$queryRaw<ToolPolicy[]>(Prisma.sql`SELECT decision,paused,version,reason FROM survey_tool_policies
  WHERE resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint} ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`)
 return rows[0]??{decision:'PENDING',paused:false,version:0,reason:'尚未进行 Survey 范围审批'}
}
/** Current list hints only, never an authority cache or an action proof. */
export async function readToolPolicies(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[]){
 if(!identities.length)return new Map<string,ToolPolicy>()
 const rows=await tx.$queryRaw<Array<ToolPolicy&{resource_key:string;fingerprint:string}>>(Prisma.sql`SELECT resource_key,fingerprint,decision,paused,version,reason FROM survey_tool_policies WHERE (resource_key,fingerprint) IN (${Prisma.join(identities.map(i=>Prisma.sql`(${i.resourceKey},${i.fingerprint})`))})`)
 return new Map(identities.map(i=>[i.resourceKey+':'+i.fingerprint,rows.find(r=>r.resource_key===i.resourceKey&&r.fingerprint===i.fingerprint)??{decision:'PENDING' as const,paused:false,version:0,reason:'尚未进行 Survey 范围审批'}]))
}
export async function assertSurveyToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,requireApproval:boolean){
 const policy=await readToolPolicy(tx,identity,true)
 if(policy.paused)throw new AdminPermissionError(409,'该精确版本已暂停 Survey 分配、准入和后续采集：'+policy.reason)
 if(policy.decision==='RETURNED')throw new AdminPermissionError(409,'该精确版本的 Survey 准入已撤回：'+policy.reason)
 if(requireApproval&&policy.decision!=='APPROVED')throw new AdminPermissionError(409,'该精确版本尚未通过 Survey 范围审批：'+policy.reason)
}
/** Fresh exact authority at new admission AND each subsequent collection write.
 * Saved FINAL receipt replay and historical report reads have separate gates. */
export async function assertSurveyPublicationNotPaused(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
 await assertFrozenPackageAdmissions(tx,snapshot)
 const checkedSjtAuthorities=new Set<string>()
 for(const unit of snapshot.units){
  const p=unit.sourceProvenance,ref=p?.source as CatalogSourceSnapshot['ref']|undefined
  if(!p||!ref)continue
  // Library revocation locks use-grant before tool-grant. Keep that order.
  if(typeof p.libraryEntryId==='string'){
   const [project]=await tx.$queryRaw<Array<{owner_user_id:string}>>`SELECT owner_user_id FROM survey_projects WHERE id=${snapshot.projectId} FOR SHARE`
   if(!project)throw new AdminPermissionError(403,'研究项目不可用')
   await assertLibraryUseGrantCurrent(tx,{entryId:p.libraryEntryId,userId:project.owner_user_id,product:'SURVEY'})
  }
  const governed=typeof p.surveyToolReleaseId==='string'&&!p.surveyPackage
  if(governed)await assertGovernedEntryAllowed(tx,p.surveyToolReleaseId as string,ref.sourceVersion)
  if(ref.kind==='SJT'&&p.sjtEntryAuthority!==undefined){
   const key=canonicalHash(p.sjtEntryAuthority)
   if(!checkedSjtAuthorities.has(key)){
    try{
     const receipt=sjtEntryDistributionReceiptSchema.parse(p.sjtEntryAuthority)
     await assertSjtEntryDistributionAuthority(tx,{actorId:receipt.actorId,releaseId:receipt.releaseId,instrumentVersion:receipt.instrumentVersion,pinned:receipt})
    }
    catch(error){if(error instanceof SjtEntryAuthorityError)throw new AdminPermissionError(403,'此情境工具的精确来源分发授权已失效，停止后续采集；已保存数据保留');throw error}
    checkedSjtAuthorities.add(key)
   }
  }
  if(typeof p.sourceGrantId==='string'){
   const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_tool_grants WHERE id=${p.sourceGrantId} AND status='ACTIVE' FOR SHARE`
   if(!rows.length)throw new AdminPermissionError(403,'研究者此精确版本授权已撤销，停止后续采集；已保存数据保留')
  }else if(!p.surveyPackage){
   // Pre-ref publications can use their original immutable sourced-draft FK.
   // Never search for a newer grant or silently substitute an exact version.
   const grants=await tx.$queryRaw<Array<{id:string}>>`SELECT g.id FROM survey_instrument_drafts d JOIN survey_tool_grants g ON g.id=d.catalog_grant_id
    JOIN survey_projects project ON project.id=d.project_id AND project.owner_user_id=g.user_id
    WHERE d.id=${unit.draftId} AND d.project_id=${snapshot.projectId} AND g.status='ACTIVE'
      AND g.snapshot->'ref'=${JSON.stringify(ref)}::jsonb AND g.snapshot->>'definitionDigest'=${unit.sourceDigest} FOR SHARE OF d,g,project`
   if(!grants.length)throw new AdminPermissionError(403,'冻结工具的原精确授权已不可用，停止后续采集；已保存数据保留')
  }
  if(governed){
   // The strict governed check already locked the identical policy/hash and
   // required APPROVED. Keep the source grant check above in this transaction.
   continue
  }
  if(typeof p.surveyStandardReleaseId==='string'){
   const [release]=await tx.$queryRaw<Array<{state:string;combination_hash:string}>>`SELECT state,combination_hash FROM survey_standard_releases WHERE id=${p.surveyStandardReleaseId} FOR SHARE`
   if(release?.state!=='ONLINE'||release.combination_hash!==ref.sourceVersion)throw new AdminPermissionError(409,'冻结批准组合已撤下，停止后续采集；已保存数据保留')
  }
  const identity=await snapshotPolicyIdentity(tx,{ref,provenance:p,definitionDigest:unit.sourceDigest} as CatalogSourceSnapshot)
  await assertSurveyToolPolicy(tx,identity,false)
 }
}
