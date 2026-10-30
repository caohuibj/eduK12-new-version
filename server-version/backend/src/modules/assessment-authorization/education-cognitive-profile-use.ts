import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {libraryActor} from '../scale-library-governance/authority'
import {resolveEducationToolAuthoringContext} from '../education-tools/access'
import {lockEducationAssessmentUsers} from '../education-tools/assessment-resource.locks'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {readApprovedCognitiveProfileArtifact} from './cognitive-profile-approved-source'
import {canonicalHash} from '../assessment-runtime/canonical'
import {sealSelectedConfigurationBinding} from './selected-configuration'
import {selectedConfigurationPointer} from './standard-configuration-binding'
import {educationPublicSourceKey} from '../education-tools/public-source.identity'
import {educationStandardUseInput,EDUCATION_STANDARD_USE_ACTION,readEducationStandardUseBinding,type EducationConfigurationScope} from './education-standard-use'
const hash=z.string().regex(/^[a-f0-9]{64}$/),profile=z.enum(['experience','standard','research'])
export const educationCognitiveProfileUseInput=educationStandardUseInput.omit({combinationHash:true}).extend({artifactHash:hash,configurationName:z.string().trim().min(1).max(120)}).strict()
function fail(status:number,message:string):never{throw new AdminPermissionError(status,message)}
/** Same organization root-use ledger and entry/delegation chain as scales.
 * The system delegation names the exact immutable global M; profile approval
 * and this use revision further narrow it to one verified artifact, never OPEN.
 * Kept internal until consumers and the normal platform adapter are connected. */
export async function grantEducationCognitiveProfileUse(actorId:string,scope:EducationConfigurationScope,configId:string,rawProfile:unknown,raw:unknown){
 z.string().guid().parse(configId);z.string().guid().parse(scope.organizationId);z.enum(['SCHOOL','TEACHER']).parse(scope.product)
 const selected=profile.parse(rawProfile),input=educationCognitiveProfileUseInput.parse(raw),validFrom=new Date(input.validFrom),expiresAt=new Date(input.expiresAt)
 if(expiresAt<=validFrom||input.replaces?.grantId===input.requestId)fail(409,'新配置有效期或替换身份不合法')
 const intentHash=canonicalHash({schemaVersion:1,actorId,scope,configId,profile:selected,...input})
 return prisma.$transaction(async tx=>{
  await lockEducationAssessmentUsers(tx,[actorId,input.userId])
  const issuer=await libraryActor(tx,actorId)
  if(issuer.systemAdmin||!['TRAINING','LEGACY'].includes(issuer.account_domain))fail(403,'需要独立的教育平台入口管理身份')
  const manager=await assertEntryAdmin(tx,actorId,scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'education-profile-request:'+input.requestId}))`
  const prior=await tx.contentCapabilityGrant.findUnique({where:{id:input.requestId}}),event=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(prior||event){
   const meta=event?.metadata as {requestIntentHash?:string}|undefined
   if(!prior||!event||event.action!==EDUCATION_STANDARD_USE_ACTION||event.actorId!==actorId||event.resourceId!==configId||meta?.requestIntentHash!==intentHash
    ||prior.subjectId!==input.userId||prior.issuerId!==actorId||prior.product!==scope.product||prior.scopeId!==scope.organizationId||prior.scopeKind!=='ORGANIZATION'||prior.resourceKind!=='material'||prior.resourceKeys.length!==1
    ||canonicalHash(prior.capabilities)!==canonicalHash(['material.use'])||prior.validFrom.getTime()!==validFrom.getTime()||prior.expiresAt.getTime()!==expiresAt.getTime())fail(409,'原请求编号已用于其他完整授权意图')
   const binding=readEducationStandardUseBinding(event.metadata,{id:prior.id,issuerId:actorId,recipientId:input.userId,scope,resourceKey:prior.resourceKeys[0]})
   return {id:prior.id,version:prior.version,revoked:prior.revokedAt!==null,replayed:true,changed:false,bindingHash:binding.bindingHash}
  }
  const {artifact}=await readApprovedCognitiveProfileArtifact(tx,configId,selected,input.artifactHash,scope.product)
  const authority=await assertContentAuthority(tx,{actorId,grantId:input.authorityGrantId,capability:'material.distribute',scope:{product:scope.product,scopeKind:'ORGANIZATION',scopeId:scope.organizationId,resourceKind:'material',resourceKeys:[artifact.identity.measurement.releaseId]}})
  if(authority.version!==input.expectedAuthorityVersion)fail(409,'精确分发委托已变化')
  const [root]=await tx.$queryRaw<Array<{parent_grant_id:string|null;valid_from:Date;expires_at:Date;capabilities:string[];delegable_capabilities:string[];remaining_delegation_depth:number}>>`SELECT parent_grant_id,valid_from,expires_at,capabilities,delegable_capabilities,remaining_delegation_depth FROM content_capability_grants WHERE id=${authority.grantId} FOR SHARE`
  if(!root||root.parent_grant_id||canonicalHash(root.capabilities)!==canonicalHash(['material.distribute'])||root.delegable_capabilities.length||root.remaining_delegation_depth!==0)fail(403,'需要系统明确给出的不可转委托精确分发依据')
  if(validFrom<root.valid_from||expiresAt>root.expires_at)fail(409,'使用授权有效期不能超过精确分发委托')
  await tx.$queryRaw`SELECT id FROM organizations WHERE id=${scope.organizationId} FOR SHARE`
  const recipient=await resolveEducationToolAuthoringContext({principal:{userId:input.userId,accountDomain:'SCHOOL'},entry:scope.product,organizationId:scope.organizationId},tx)
  if(!recipient)fail(403,scope.product==='SCHOOL'?'接收者需要本校当前心理教师资格':'接收者需要本校当前 Teacher 产品管理员资格')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'education-profile-recipient:'+scope.product+':'+scope.organizationId+':'+input.userId+':'+configId}))`
  const active=await tx.$queryRaw<Array<{id:string;issuer_id:string;version:number;metadata:unknown;resource_keys:string[]}>>`SELECT g.id,g.issuer_id,g.version,e.metadata,g.resource_keys FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id AND e.action=${EDUCATION_STANDARD_USE_ACTION}
   WHERE g.subject_id=${input.userId} AND g.product=${scope.product} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${scope.organizationId}
    AND e.metadata#>>'{selectedBinding,binding,configuration,configId}'=${configId} AND g.revoked_at IS NULL
    AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC' ORDER BY g.id LIMIT 2 FOR UPDATE OF g`
  if(active.length>1)fail(409,'同工具存在多个原使用配置，请管理员明确处理')
  const old=active[0]
  if(old&&old.issuer_id!==actorId)fail(403,'不能接管另一发行者的认知使用配置')
  if(old?.id!==input.replaces?.grantId)fail(409,'请明确原授权修订和替换原因')
  let supersedes:{selectedBinding:ReturnType<typeof selectedConfigurationPointer>;reason:string}|undefined
  if(input.replaces){
   if(!old||old.version!==input.replaces.expectedVersion||old.resource_keys.length!==1)fail(409,'原配置授权已经变化')
   const original=readEducationStandardUseBinding(old.metadata,{id:old.id,issuerId:actorId,recipientId:input.userId,scope,resourceKey:old.resource_keys[0]})
   if(original.binding.configuration.kind!=='COGNITIVE_PROFILE'||original.binding.configuration.configId!==configId||original.binding.authorization.revision!==old.version)fail(409,'原配置身份不匹配')
   supersedes={selectedBinding:selectedConfigurationPointer(original),reason:input.replaces.reason}
  }
  const sealed=sealSelectedConfigurationBinding({product:scope.product,configuration:artifact.identity,authorization:{kind:'EDUCATION_SOURCE_USE',id:input.requestId,revision:1,issuerId:actorId,recipientId:input.userId,organizationId:scope.organizationId,
   authority:[{kind:'ENTRY_ADMIN',id:manager.grantId,revision:manager.grantVersion},{kind:'CONTENT_DELEGATION',id:authority.grantId,revision:authority.version}]}})
  const key=educationPublicSourceKey({kind:'COGNITIVE_PROFILE',id:configId,hash:input.artifactHash}),[clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`
  if(!clock||expiresAt<=clock.now||issuer.expires_at&&issuer.expires_at<=clock.now)fail(403,'账号或使用授权已过期')
  await tx.$executeRaw`INSERT INTO content_capability_grants(id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
   VALUES(${input.requestId},${input.userId},${actorId},${scope.product},'ORGANIZATION',${scope.organizationId},'material',${[key]}::text[],ARRAY['material.use']::text[],ARRAY[]::text[],0,(${validFrom}::timestamptz AT TIME ZONE 'UTC'),(${expiresAt}::timestamptz AT TIME ZONE 'UTC'),${[input.requestId]}::text[])`
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:configId,action:EDUCATION_STANDARD_USE_ACTION,metadata:{schemaVersion:1,selectedBinding:sealed,requestIntentHash:intentHash,selfGrant:actorId===input.userId,configurationName:input.configurationName,artifactHash:input.artifactHash,...(supersedes?{supersedes}:{})}}})
  if(supersedes){
   await tx.$executeRaw`UPDATE content_capability_grants SET revoked_at=clock_timestamp() AT TIME ZONE 'UTC',revoked_by=${actorId},revoke_reason=${'由新固定配置授权 '+input.requestId+' 替换：'+supersedes.reason},version=version+1 WHERE id=${supersedes.selectedBinding.authorizationId}`
   await tx.assessmentManagementEvent.create({data:{id:randomUUID(),actorId,resourceId:configId,action:'EDUCATION_COGNITIVE_PROFILE_USE_REPLACED',metadata:{scope,previous:supersedes.selectedBinding,next:selectedConfigurationPointer(sealed),reason:supersedes.reason}}})
  }
  await assertEntryAdmin(tx,actorId,scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER')
  if(!await resolveEducationToolAuthoringContext({principal:{userId:input.userId,accountDomain:'SCHOOL'},entry:scope.product,organizationId:scope.organizationId},tx))fail(403,'接收者当前资格已变化')
  return {id:input.requestId,version:1,revoked:false,changed:true,replayed:false,bindingHash:sealed.bindingHash}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000})
}
