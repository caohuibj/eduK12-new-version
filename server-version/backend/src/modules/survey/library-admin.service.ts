import {assertGovernedOnline} from './governed-tool.service'
import type {StandardRelease} from './standard-triplet.service'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {UserRole} from '../../types'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getScalePackage} from '../scale/scale-package.registry'
import {evaluateScaleProductReadiness} from '../scale/library/product-readiness'
import {readStandardScaleLibraryForActor} from '../scale/library/standard-catalog-reader'
import {standardCatalogRecord,authoredCatalogRecord,type PlatformCatalogRecord} from '../scale-library-governance/unified-catalog-model'
import {loadEntry,entryView,submissionView,type SubmissionRow,readSubmission} from '../scale-library-governance/service'
import {getContentRelease} from '../measurement-content/repository'
import {assertSurveyLibraryManager} from './admin-role'
import {AdminPermissionError} from '../admin-permissions/service'
import {standardPolicyIdentity,readToolPolicy,type PolicyIdentity} from './tool-policy'
const fail=(s:number,m:string):never=>{throw new AdminPermissionError(s,m)}
export type Readiness={ready:boolean;reasons:string[]}
export function standardContentReadiness(key:string,version:string):Readiness{
 const pkg=getScalePackage(key,version)
 if(!pkg)return {ready:false,reasons:['仅有目录资料；尚缺可执行题目、计分与报告的完整精确版本包']}
 const result=evaluateScaleProductReadiness(pkg)
 return {ready:result.ready,reasons:result.blockers.map(issue=>`${issue.stage}：${issue.message}`)}
}
async function decorate(tx:Prisma.TransactionClient,row:PlatformCatalogRecord){
 let identity:PolicyIdentity,content:Readiness
 if(row.origin==='STANDARD_REGISTRY'){
  identity=standardPolicyIdentity(row.exactVersion.instrumentKey,row.exactVersion.instrumentVersion)
  content=standardContentReadiness(row.exactVersion.instrumentKey,row.exactVersion.instrumentVersion)
 }else{
  identity={resourceKey:'release:'+row.exactVersion.releaseId,fingerprint:row.exactVersion.contentHash??''}
  const {submission}=await loadEntry(tx,row.exactVersion.entryId)
  const d=submission.snapshot.compiledDefinition
  const reasons=[]
  if(!d?.items?.length)reasons.push('缺少冻结题目')
  if(!d?.scoring?.scores?.length)reasons.push('缺少冻结计分标准')
  if(!d?.report)reasons.push('缺少冻结报告定义')
  content={ready:!reasons.length,reasons}
 }
 let online:StandardRelease|undefined
 if(row.origin==='STANDARD_REGISTRY'){
  const found=await tx.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE tool_key=${row.exactVersion.instrumentKey} AND snapshot->>'instrumentVersion'=${row.exactVersion.instrumentVersion} AND state='ONLINE' ORDER BY created_at DESC LIMIT 1 FOR SHARE`
  online=found[0]
  if(online){identity={resourceKey:'standard-release:'+online.id,fingerprint:online.combination_hash};content={ready:true,reasons:[]}}
 }
 const saved=await readToolPolicy(tx,identity),policy=online&&saved.version===0?{...saved,decision:'APPROVED' as const,reason:'系统管理员已批准三版本，自动试运行通过'}:saved
 const reasons=[...content.reasons,...(online?[]:row.availability.reasons).filter(reason=>!reason.includes('NOT_EVALUATED')&&!reason.includes('CHECK_REQUIRED'))]
 if(policy.decision!=='APPROVED')reasons.push(policy.decision==='RETURNED'?'Survey 范围审批已退回：'+policy.reason:'尚未通过 Survey 范围审批')
 if(policy.paused)reasons.push('Survey 新增分配与投放已暂停：'+policy.reason)
 // Conservative source gates are deliberately retained. Readiness never grants rights.
 const assignable=content.ready&&!reasons.length
 return {...row,policyIdentity:identity,policy,states:{content,assignment:{ready:assignable,reasons:[...new Set(reasons)]},
  deployment:{ready:false,status:assignable?'REQUIRES_RUNTIME_CHECK':'BLOCKED',reasons:[...new Set([...reasons,'还需研究者持有精确版本授权，并通过冻结发布及个人准入核对'])],requiresRuntimeCheck:true}}}
}
export async function surveyLibraryCatalog(actorId:string,page:number){
 await prisma.$transaction(tx=>assertSurveyLibraryManager(tx,actorId))
 const standard=await readStandardScaleLibraryForActor({userId:actorId,role:UserRole.ADMIN})
 const sorted=standard.entries.slice().sort((a,b)=>`${a.identity.instrumentKey}:${a.identity.instrumentVersion}`.localeCompare(`${b.identity.instrumentKey}:${b.identity.instrumentVersion}`))
 const offset=(page-1)*25,selected=sorted.slice(offset,offset+25)
 return prisma.$transaction(async tx=>{
  await assertSurveyLibraryManager(tx,actorId)
  const list:PlatformCatalogRecord[]=selected.map(row=>standardCatalogRecord(row,'SURVEY'))
  let more=offset+25<sorted.length
  if(list.length<25){
   const entries=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM scale_library_entries ORDER BY created_at DESC,id LIMIT ${26-list.length} OFFSET ${Math.max(0,offset-sorted.length)}`
   for(const e of entries.slice(0,25-list.length)){const {entry,submission}=await loadEntry(tx,e.id);list.push(authoredCatalogRecord(entryView(entry,submission),'SURVEY'))}
   more=entries.length>25-selected.length
  }
  const decorated=[]
  for(const row of list)decorated.push(await decorate(tx,row))
  return {schemaVersion:1,list:decorated,page,pageSize:25,hasMore:more,generatedAt:new Date().toISOString()}
 },{timeout:20000})
}
export async function surveyLibrarySubmissions(actorId:string,page:number){
 return prisma.$transaction(async tx=>{
  await assertSurveyLibraryManager(tx,actorId)
  const rows=await tx.$queryRaw<SubmissionRow[]>`SELECT * FROM scale_library_submissions ORDER BY created_at DESC,id LIMIT 26 OFFSET ${(page-1)*25}`
  const list=[]
  for(const row of rows.slice(0,25)){
   const release=await getContentRelease(tx,row.release_id,true)
   const identity={resourceKey:'release:'+row.release_id,fingerprint:release?.contentHash??row.snapshot_hash}
   list.push({...submissionView(row),policyIdentity:identity,policy:await readToolPolicy(tx,identity)})
  }
  return {list,page,hasMore:rows.length>25}
 })
}
export async function surveySubmissionDetail(actorId:string,id:string){
 return readSubmission(actorId,id,undefined,true)
}
export async function changeSurveyToolPolicy(actorId:string,input:PolicyIdentity&{expectedVersion:number;decision:'APPROVED'|'RETURNED'|'PENDING';paused:boolean;reason:string}){
 return prisma.$transaction(async tx=>{
  await assertSurveyLibraryManager(tx,actorId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-tool:'+input.resourceKey}))`
  let contentReady=false
  if(input.resourceKey.startsWith('governed-release:')){
   await assertGovernedOnline(tx,input.resourceKey.slice(17),input.fingerprint);contentReady=true
  }else if(input.resourceKey.startsWith('standard-release:')){
   const [row]=await tx.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE id=${input.resourceKey.slice(17)} FOR SHARE`
   if(!row||row.combination_hash!==input.fingerprint||row.state!=='ONLINE')fail(409,'三版本组合尚未上线或已停止新增使用')
   contentReady=true
  }else if(input.resourceKey.startsWith('standard:')){
   const sources=(await import('../scale/onboarding/instrument-registry')).listScaleInstrumentSources()
   const source=sources.find(s=>`standard:${s.identity.instrumentKey}:${s.identity.instrumentVersion}`===input.resourceKey)
   if(!source||canonicalHash(source)!==input.fingerprint)fail(409,'精确工具版本已变化')
   contentReady=standardContentReadiness(source!.identity.instrumentKey,source!.identity.instrumentVersion).ready
  }else if(input.resourceKey.startsWith('release:')){
   const id=input.resourceKey.slice(8),release=await getContentRelease(tx,id,true)
   const [submission]=await tx.$queryRaw<SubmissionRow[]>`SELECT * FROM scale_library_submissions WHERE release_id=${id} AND status IN ('SUBMITTED','APPROVED') ORDER BY created_at DESC LIMIT 1 FOR SHARE`
   if(!release||release.contentHash!==input.fingerprint||release.status!=='PUBLISHED'||!submission||canonicalHash(submission.snapshot)!==submission.snapshot_hash)fail(409,'已申请的冻结版本已变化或不可用')
   const d=submission.snapshot.compiledDefinition
   contentReady=Boolean(d?.items?.length&&d?.scoring?.scores?.length&&d?.report)
  }else fail(400,'不支持的工具范围')
  if(input.decision==='APPROVED'&&!contentReady)fail(409,'题目、计分和报告尚未完整，不能批准 Survey 使用范围')
  const current=await readToolPolicy(tx,input)
  if(current.version!==input.expectedVersion)fail(409,'审批状态已变化，请刷新后重试')
  await tx.$executeRaw`INSERT INTO survey_tool_policies(resource_key,fingerprint,decision,paused,reason,reviewed_by)
   VALUES(${input.resourceKey},${input.fingerprint},${input.decision},${input.paused},${input.reason},${actorId})
   ON CONFLICT(resource_key,fingerprint) DO UPDATE SET decision=EXCLUDED.decision,paused=EXCLUDED.paused,
    reason=EXCLUDED.reason,reviewed_by=EXCLUDED.reviewed_by,version=survey_tool_policies.version+1,updated_at=clock_timestamp()`
  await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,action:'SURVEY_TOOL_POLICY_CHANGED',metadata:{...input,scope:'SURVEY_ONLY',preserveExistingAttempts:true}}})
  return readToolPolicy(tx,input)
 })
}
