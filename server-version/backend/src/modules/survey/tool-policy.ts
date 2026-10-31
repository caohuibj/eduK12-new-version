import {isSurveyCognitiveProfileRef,surveyCognitiveProfilePolicy,assertSurveyCognitiveProfileSourceCurrent} from './cognitive-profile.source'
import {assertGovernedEntryAllowed} from './governed-tool.service'
import {assertFrozenPackageAdmissions} from './governed-package.service'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getScaleInstrumentSource} from '../scale/onboarding/instrument-registry'
import {scaleSourcePolicyIdentity} from '../scale/onboarding/source-snapshot'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {assertSjtEntryDistributionAuthority,sjtEntryDistributionReceiptSchema,SjtEntryAuthorityError} from '../situational/entry-authority'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {ResearchFrozenPublication} from './publication.service'
export type {ToolEntryProduct,PolicyIdentity,ToolPolicy} from '../assessment-governance/tool-entry-policy'
export {readToolPolicy,readToolPolicies,exactToolEntryProducts,approveToolEntryPolicies,assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {readToolPolicy,type PolicyIdentity} from '../assessment-governance/tool-entry-policy'
import {readFrozenSurveyStandardUses,assertSurveyStandardUseAuthority} from '../assessment-authorization/survey-standard-use'
export const standardPolicyIdentity=(key:string,version:string):PolicyIdentity=>{
 const source=getScaleInstrumentSource(key,version)
 return source?scaleSourcePolicyIdentity(source):{resourceKey:`standard:${key}:${version}`,fingerprint:canonicalHash({key,version,missing:true})}
}
export async function snapshotPolicyIdentity(tx:Prisma.TransactionClient,snapshot:CatalogSourceSnapshot):Promise<PolicyIdentity>{
 if(isSurveyCognitiveProfileRef(snapshot.ref))return surveyCognitiveProfilePolicy(snapshot)
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
export async function assertSurveyToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,requireApproval:boolean){
 const policy=await readToolPolicy(tx,identity,true)
 if(policy.paused)throw new AdminPermissionError(409,'该精确版本已暂停 Survey 分配和新作答准入：'+policy.reason)
 if(policy.decision==='RETURNED')throw new AdminPermissionError(409,'该精确版本的 Survey 准入已撤回：'+policy.reason)
 if(requireApproval&&policy.decision!=='APPROVED')throw new AdminPermissionError(409,'该精确版本尚未通过 Survey 范围审批：'+policy.reason)
}
/** Fresh new-parent admission only. Frozen execution and report/data authority
 * have separate boundaries; never call this on an existing Attempt's writes. */
export async function assertSurveyPublicationNotPaused(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
 await assertFrozenPackageAdmissions(tx,snapshot)
 const typedUses=await readFrozenSurveyStandardUses(tx,snapshot.projectId,snapshot.units)
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
    catch(error){if(error instanceof SjtEntryAuthorityError)throw new AdminPermissionError(403,'此情境工具的精确来源分发授权已失效，停止新入场；已入场作答按原冻结规则完成');throw error}
    checkedSjtAuthorities.add(key)
   }
  }
  if(typeof p.sourceGrantId==='string'){
   if(!typedUses.ids.has(p.sourceGrantId)){
    const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_tool_grants WHERE id=${p.sourceGrantId} AND status='ACTIVE' FOR SHARE`
    if(!rows.length)throw new AdminPermissionError(403,'研究者此精确版本授权已撤销，停止新入场；已入场作答按原冻结规则完成')
   }
  }else if(!p.surveyPackage){
   // Pre-ref publications can use their original immutable sourced-draft FK.
   // Never search for a newer grant or silently substitute an exact version.
   const grants=await tx.$queryRaw<Array<{id:string}>>`SELECT g.id FROM survey_instrument_drafts d JOIN survey_tool_grants g ON g.id=d.catalog_grant_id
    JOIN survey_projects project ON project.id=d.project_id AND project.owner_user_id=g.user_id
    WHERE d.id=${unit.draftId} AND d.project_id=${snapshot.projectId} AND g.status='ACTIVE'
      AND g.snapshot->'ref'=${JSON.stringify(ref)}::jsonb AND g.snapshot->>'definitionDigest'=${unit.sourceDigest} FOR SHARE OF d,g,project`
   if(!grants.length)throw new AdminPermissionError(403,'冻结工具的原精确授权已不可用，停止新入场；已入场作答按原冻结规则完成')
  }
  if(governed){
   // The strict governed check already locked the identical policy/hash and
   // required APPROVED. Keep the source grant check above in this transaction.
   continue
  }
  if(isSurveyCognitiveProfileRef(ref)){
   try{await assertSurveyCognitiveProfileSourceCurrent(tx,{ref,provenance:p})}catch(error){if(error instanceof AdminPermissionError)throw error;throw new AdminPermissionError(409,error instanceof Error?error.message:'原精确认知来源不可用')}
  }
  if(typeof p.surveyStandardReleaseId==='string'){
   const [release]=await tx.$queryRaw<Array<{state:string;combination_hash:string}>>`SELECT state,combination_hash FROM survey_standard_releases WHERE id=${p.surveyStandardReleaseId} FOR SHARE`
   if(release?.state!=='ONLINE'||release.combination_hash!==ref.sourceVersion)throw new AdminPermissionError(409,'冻结批准组合已撤下，停止新入场；已入场作答按原冻结规则完成')
  }
  const identity=await snapshotPolicyIdentity(tx,{ref,provenance:p,definitionDigest:unit.sourceDigest} as CatalogSourceSnapshot)
  await assertSurveyToolPolicy(tx,identity,false)
 }
 // Check the original issuer's current expiry AFTER later source/policy waits.
 await assertSurveyStandardUseAuthority(tx,typedUses.rows)
}
