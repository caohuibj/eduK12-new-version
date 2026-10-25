import {assertGovernedEntryAllowed} from './governed-tool.service'
import {assertFrozenPackageAdmissions} from './governed-package.service'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getScaleInstrumentSource} from '../scale/onboarding/instrument-registry'
import {AdminPermissionError} from '../admin-permissions/service'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {ResearchFrozenPublication} from './publication.service'
export type PolicyIdentity={resourceKey:string;fingerprint:string}
export type ToolPolicy={decision:'PENDING'|'APPROVED'|'RETURNED';paused:boolean;version:number;reason:string}
export const standardPolicyIdentity=(key:string,version:string):PolicyIdentity=>({resourceKey:`standard:${key}:${version}`,
 fingerprint:canonicalHash(getScaleInstrumentSource(key,version)??{key,version,missing:true})})
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
export async function assertSurveyToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,requireApproval:boolean){
 const policy=await readToolPolicy(tx,identity,true)
 if(policy.paused)throw new AdminPermissionError(409,'该精确版本已暂停 Survey 的新增分配与投放：'+policy.reason)
 if(requireApproval&&policy.decision!=='APPROVED')throw new AdminPermissionError(409,'该精确版本尚未通过 Survey 范围审批：'+policy.reason)
}
/** New admissions only. Existing attempts, saved FINALs and stored reports never call this gate. */
export async function assertSurveyPublicationNotPaused(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
 await assertFrozenPackageAdmissions(tx,snapshot)
 for(const unit of snapshot.units){
  const p=unit.sourceProvenance,ref=p?.source as CatalogSourceSnapshot['ref']|undefined
  if(!p||!ref)continue
  if(typeof p.surveyToolReleaseId==='string'&&!p.surveyPackage){
   await assertGovernedEntryAllowed(tx,p.surveyToolReleaseId,ref.sourceVersion)
   if(typeof p.sourceGrantId==='string'){const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_tool_grants WHERE id=${p.sourceGrantId} AND status='ACTIVE' FOR SHARE`;if(!rows.length)throw new AdminPermissionError(403,'研究者此精确版本授权已撤销')}
  }
  const identity=await snapshotPolicyIdentity(tx,{ref,provenance:p,definitionDigest:unit.sourceDigest} as CatalogSourceSnapshot)
  await assertSurveyToolPolicy(tx,identity,false)
 }
}
