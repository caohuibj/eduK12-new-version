import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {libraryActor} from '../scale-library-governance/authority'
import {resolveEducationToolAuthoringContext} from '../education-tools/access'
import {educationPublicSourceKey} from '../education-tools/public-source.identity'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {lockInstrumentSourceIdentity} from './source-identity-lock'
import {lockEducationAssessmentUsers} from '../education-tools/assessment-resource.locks'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {prepareRelease} from '../measurement-content/release'
import {canonicalHash} from '../assessment-runtime/canonical'
import {standardConfigurationIdentity} from './standard-configuration-binding'
import {sealSelectedConfigurationBinding,readSelectedConfigurationBinding} from './selected-configuration'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export type EducationConfigurationScope={product:'SCHOOL'|'TEACHER';organizationId:string}
export const educationStandardUseInput=z.object({requestId:id,userId:id,combinationHash:hash,authorityGrantId:id,
 expectedAuthorityVersion:z.number().int().positive(),validFrom:z.string().datetime(),expiresAt:z.string().datetime()}).strict()
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
const deny:(message:string)=>never=(message)=>{throw new AdminPermissionError(403,message)}
const conflict:(message:string)=>never=(message)=>{throw new AdminPermissionError(409,message)}
const entry=(product:EducationConfigurationScope['product'])=>product==='SCHOOL'?'HUISCHOOL' as const:'HUITEACHER' as const
export const EDUCATION_STANDARD_USE_ACTION='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED'

/** Internal service, not a new permission centre or mounted endpoint. The
 * platform router may expose it only together with typed consumer validation.
 * The issuer is always the authenticated platform manager, not a body field. */
export async function grantEducationStandardConfigurationUse(actorId:string,scope:EducationConfigurationScope,combinationId:string,raw:unknown){
 id.parse(scope.organizationId);id.parse(combinationId)
 if(!['SCHOOL','TEACHER'].includes(scope.product))deny('教育入口不合法')
 const input=educationStandardUseInput.parse(raw),validFrom=new Date(input.validFrom),expiresAt=new Date(input.expiresAt)
 if(expiresAt<=validFrom)conflict('使用授权有效期不合法')
 const intentHash=canonicalHash({schemaVersion:1,actorId,scope,combinationId,...input})
 return prisma.$transaction(async tx=>{
  const [header]=await tx.$queryRaw<Array<{tool_key:string;instrument_version:string}>>(Prisma.sql`
   SELECT tool_key,snapshot->>'instrumentVersion' AS instrument_version FROM survey_standard_releases WHERE id=${combinationId}`)
  if(!header)deny('精确标准组合不存在')
  await lockInstrumentSourceIdentity(tx,{instrumentKey:header.tool_key,instrumentVersion:header.instrument_version},'READ')
  // User before Organization, matching account lifecycle. Never add roles or
  // infer a school account from a Training platform manager's qualification.
  await lockEducationAssessmentUsers(tx,[actorId,input.userId])
  const issuer=await libraryActor(tx,actorId)
  if(issuer.systemAdmin||!['TRAINING','LEGACY'].includes(issuer.account_domain))deny('需要独立的教育平台入口管理身份')
  const manager=await assertEntryAdmin(tx,actorId,entry(scope.product))
  const source=await readCurrentStandardCombination(tx,{releaseId:combinationId,combinationHash:input.combinationHash})
  await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+combinationId,fingerprint:input.combinationHash},scope.product)
  const authority=await assertContentAuthority(tx,{actorId,grantId:input.authorityGrantId,capability:'material.distribute',
   scope:{product:scope.product,scopeKind:'ORGANIZATION',scopeId:scope.organizationId,resourceKind:'material',resourceKeys:[source.measurement.releaseId]}})
  if(authority.version!==input.expectedAuthorityVersion)conflict('精确分发委托已变化')
  const [root]=await tx.$queryRaw<Array<{id:string;parent_grant_id:string|null;valid_from:Date;expires_at:Date;capabilities:string[];delegable_capabilities:string[];remaining_delegation_depth:number}>>(Prisma.sql`
   SELECT id,parent_grant_id,valid_from,expires_at,capabilities,delegable_capabilities,remaining_delegation_depth FROM content_capability_grants WHERE id=${authority.grantId} FOR SHARE`)
  if(!root||root.parent_grant_id||root.capabilities.length!==1||root.capabilities[0]!=='material.distribute'||root.delegable_capabilities.length||root.remaining_delegation_depth!==0)
   deny('需要系统明确给出的不可转委托精确分发依据')
  if(validFrom<root.valid_from||expiresAt>root.expires_at)conflict('使用授权有效期不能超过精确分发委托')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${scope.organizationId} FOR SHARE`)
  const recipient=await resolveEducationToolAuthoringContext({principal:{userId:input.userId,accountDomain:'SCHOOL'},entry:scope.product,organizationId:scope.organizationId},tx)
  if(!recipient)deny(scope.product==='SCHOOL'?'接收者需要本校当前心理教师资格':'接收者需要本校当前 Teacher 产品管理员资格')
  const scale=await tx.scale.findUnique({where:{code:header.tool_key}})
  if(!scale||scale.status!=='PUBLISHED'||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId||scale.instrumentVersion!==header.instrument_version)
   conflict('精确原生量表尚未装载或发布')
  const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:source.measurement.version,instrumentVersion:scale.instrumentVersion,
   definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:source.measurement.scope}))
  if(installed.contentHash!==source.measurement.contentHash)conflict('已装载题本与批准组合不一致')
  await assertScaleLibraryCollectionAllowed(tx,[source.measurement.releaseId],[scale.id])
  const sealed=sealSelectedConfigurationBinding({product:scope.product,configuration:standardConfigurationIdentity(source),authorization:{
   kind:'EDUCATION_SOURCE_USE',id:input.requestId,revision:1,issuerId:actorId,recipientId:input.userId,organizationId:scope.organizationId,
   authority:[{kind:'ENTRY_ADMIN',id:manager.grantId,revision:manager.grantVersion},{kind:'CONTENT_DELEGATION',id:authority.grantId,revision:authority.version}],
  }})
  const resourceKey=educationPublicSourceKey({kind:'STANDARD_SCALE',id:combinationId,hash:input.combinationHash})
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'education-standard-use:'+input.requestId}))`
  const previous=await tx.contentCapabilityGrant.findUnique({where:{id:input.requestId}})
  const audit=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(previous||audit){
   const metadata=audit?.metadata as {requestIntentHash?:string;selectedBinding?:unknown}|undefined
   if(!previous||!audit||audit.actorId!==actorId||audit.resourceId!==combinationId||audit.action!==EDUCATION_STANDARD_USE_ACTION
    ||metadata?.requestIntentHash!==intentHash||canonicalHash(metadata.selectedBinding??null)!==canonicalHash(sealed)
    ||previous.subjectId!==input.userId||previous.issuerId!==actorId||previous.product!==scope.product||previous.scopeId!==scope.organizationId
    ||previous.scopeKind!=='ORGANIZATION'||previous.resourceKind!=='material'||canonicalHash(previous.resourceKeys)!==canonicalHash([resourceKey])
    ||canonicalHash(previous.capabilities)!==canonicalHash(['material.use'])||previous.validFrom.getTime()!==validFrom.getTime()||previous.expiresAt.getTime()!==expiresAt.getTime())
    conflict('请求编号已用于不同的授权意图')
   return {id:previous.id,version:previous.version,revoked:previous.revokedAt!==null,changed:false,replayed:true,bindingHash:sealed.bindingHash}
  }
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`
  if(!clock||expiresAt<=clock.now||issuer.expires_at&&issuer.expires_at<=clock.now)deny('账号或使用授权已过期')
  // Same retained root-use contract as the existing public-source consumers;
  // the independent distribution and entry basis is recorded in T1, not made
  // into an invalid material.distribute -> material.use capability ancestor.
  await tx.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
   (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
   VALUES(${input.requestId},${input.userId},${actorId},${scope.product},'ORGANIZATION',${scope.organizationId},'material',${[resourceKey]}::text[],
    ARRAY['material.use']::text[],ARRAY[]::text[],0,(${validFrom}::timestamptz AT TIME ZONE 'UTC'),(${expiresAt}::timestamptz AT TIME ZONE 'UTC'),${[input.requestId]}::text[])`)
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:combinationId,action:EDUCATION_STANDARD_USE_ACTION,
   metadata:{schemaVersion:1,selectedBinding:sealed,requestIntentHash:intentHash,selfGrant:actorId===input.userId}}})
  // Final current checks after all waits. Recipient membership is protected by
  // Organization; manager/account/source/delegation locks remain held to commit.
  await assertEntryAdmin(tx,actorId,entry(scope.product))
  if(!await resolveEducationToolAuthoringContext({principal:{userId:input.userId,accountDomain:'SCHOOL'},entry:scope.product,organizationId:scope.organizationId},tx))deny('接收者当前资格已变化')
  return {id:input.requestId,version:1,revoked:false,changed:true,replayed:false,bindingHash:sealed.bindingHash}
 },options)
}

/** Historical identity read only; callers still need their existing data ACL.
 * Current use and original manager/delegation validation are separate. */
export function readEducationStandardUseBinding(metadata:unknown,expected:{id:string;issuerId:string;recipientId:string;scope:EducationConfigurationScope;resourceKey:string}){
 const value=z.object({schemaVersion:z.literal(1),selectedBinding:z.unknown(),requestIntentHash:hash,selfGrant:z.boolean()}).strict().parse(metadata)
 const sealed=readSelectedConfigurationBinding(value.selectedBinding,{product:expected.scope.product,recipientId:expected.recipientId,organizationId:expected.scope.organizationId,
  authorizationId:expected.id,authorizationRevision:1})
 if(!sealed||sealed.binding.authorization.kind!=='EDUCATION_SOURCE_USE'||sealed.binding.authorization.issuerId!==expected.issuerId
  ||sealed.binding.configuration.kind!=='STANDARD_COMBINATION'||sealed.binding.authorization.authority.length!==2
  ||sealed.binding.authorization.authority[0].kind!=='ENTRY_ADMIN'||sealed.binding.authorization.authority[1].kind!=='CONTENT_DELEGATION'
  ||value.selfGrant!==(expected.issuerId===expected.recipientId))conflict('教育精确使用配置证据不完整')
 const c=sealed.binding.configuration
 if(educationPublicSourceKey({kind:'STANDARD_SCALE',id:c.combinationId,hash:c.combinationHash})!==expected.resourceKey)conflict('教育精确配置来源不一致')
 return sealed
}
