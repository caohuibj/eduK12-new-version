import {catalogDiscoveryRecords,discoveryJoin,discoverySqlFilter,discoveryFacets} from '../survey/catalog-discovery'
import {catalogDiscoveryQueryFields,type CatalogClassificationTag} from '../scale/library/catalog-discovery'
import {readApprovedCognitiveProfileArtifact} from './cognitive-profile-approved-source'
import {Prisma} from '@prisma/client'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {libraryActor} from '../scale-library-governance/authority'
import {assertContentAuthority,revokeContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {canonicalHash} from '../assessment-runtime/canonical'
import {cognitiveProfileApprovalReceipt} from './cognitive-profile-approval'
import {loadCognitiveProfileArtifact,type CognitiveProfileArtifact} from './cognitive-profile-artifact'
import {assertPublishedCognitiveArtifactSource,cognitiveProfilePolicyIdentity} from './cognitive-profile-source'
import {selectedConfigurationBindingSchema,readSelectedConfigurationBinding,sealSelectedConfigurationBinding} from './selected-configuration'
import {selectedConfigurationPointer,selectedConfigurationPointerSchema} from './standard-configuration-binding'
const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),revision=z.number().int().positive()
const profile=z.enum(['experience','standard','research'])
export const TRAINING_COGNITIVE_USE_ACTION='TRAINING_COGNITIVE_PROFILE_USE_GRANTED'
export const TRAINING_COGNITIVE_REVOKE_ACTION='TRAINING_COGNITIVE_PROFILE_USE_REVOKED'
export const TRAINING_COGNITIVE_USE_SCOPE='cognitive-profile-configurations'
const replaces=z.object({grantId:id,expectedVersion:revision,reason:z.string().trim().min(1).max(500)}).strict()
export const trainingCognitiveUseInput=z.object({requestId:id,userId:id,artifactHash:hash,configurationName:z.string().trim().min(1).max(120),
 validFrom:z.string().datetime(),expiresAt:z.string().datetime(),replaces:replaces.optional()}).strict()
const requestIntent=trainingCognitiveUseInput.extend({actorId:id,configId:id,profile}).strict()
const supersedes=z.object({selectedBinding:selectedConfigurationPointerSchema,observedVersion:revision,reason:replaces.shape.reason}).strict()
export const trainingCognitiveUseReceipt=z.object({schemaVersion:z.literal(1),userId:id,artifactHash:hash,configurationName:trainingCognitiveUseInput.shape.configurationName,
 selectedBinding:selectedConfigurationBindingSchema,requestIntentHash:hash,requestIntent,selfGrant:z.boolean(),supersedes:supersedes.optional()}).strict()
export const trainingCognitiveTaskBindingSchema=z.object({schemaVersion:z.literal(1),artifactHash:hash,selectedBinding:selectedConfigurationPointerSchema}).strict()
export type TrainingCognitiveTaskBinding=z.infer<typeof trainingCognitiveTaskBindingSchema>
type Tx=Prisma.TransactionClient
type Grant=Prisma.ContentCapabilityGrantGetPayload<{}>
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
function deny(message='原认知精确使用配置不可用'):never{throw new AdminPermissionError(403,message)}
function conflict(message:string):never{throw new AdminPermissionError(409,message)}
const key=(configId:string,artifactHash:string)=>`cognitive-profile:${configId}:${artifactHash}`
async function eligible(tx:Tx,userId:string){
 const actor=await libraryActor(tx,userId)
 if(actor.role!=='TEACHER'||!actor.teacher_approved||!['TRAINING','LEGACY'].includes(actor.account_domain))deny('接收者需要当前合格的 Training 教师身份')
}
function receipt(raw:unknown,grantId:string,configId:string){
 const meta=trainingCognitiveUseReceipt.parse(raw),sealed=readSelectedConfigurationBinding(meta.selectedBinding,{product:'TRAINING',organizationId:null,
  authorizationId:grantId,authorizationRevision:1,recipientId:meta.userId})!
 const {authorization,configuration}=sealed.binding,intent=meta.requestIntent
 if(authorization.kind!=='COGNITIVE_PROFILE_USE'||configuration.kind!=='COGNITIVE_PROFILE'||configuration.configId!==configId
  ||intent.configId!==configId||intent.profile!==configuration.profile||intent.actorId!==authorization.issuerId||intent.userId!==authorization.recipientId
  ||intent.requestId!==grantId||intent.artifactHash!==meta.artifactHash||intent.configurationName!==meta.configurationName
  ||canonicalHash(intent)!==meta.requestIntentHash||authorization.authority.length!==1||authorization.authority[0].kind!=='ENTRY_ADMIN')conflict('原认知配置授权审计身份不完整')
 return meta
}
function grantMatches(g:Grant,meta:z.infer<typeof trainingCognitiveUseReceipt>,configId:string){
 const a=meta.selectedBinding.binding.authorization
 if(g.subjectId!==a.recipientId||g.issuerId!==a.issuerId||g.product!=='TRAINING'||g.scopeKind!=='PLATFORM'||g.scopeId!==TRAINING_COGNITIVE_USE_SCOPE
  ||g.resourceKind!=='material'||canonicalHash(g.resourceKeys)!==canonicalHash([key(configId,meta.artifactHash)])||g.parentGrantId
  ||canonicalHash(g.ancestry)!==canonicalHash([g.id])||canonicalHash(g.capabilities)!==canonicalHash(['material.use'])
  ||g.delegableCapabilities.length||g.remainingDelegationDepth!==0||g.validFrom.getTime()!==new Date(meta.requestIntent.validFrom).getTime()
  ||g.expiresAt.getTime()!==new Date(meta.requestIntent.expiresAt).getTime())conflict('认知配置使用权与原审计不一致')
}
async function original(tx:Tx,grantId:string,configId:string){
 const event=await tx.assessmentManagementEvent.findUnique({where:{id:grantId}})
 if(!event||event.action!==TRAINING_COGNITIVE_USE_ACTION||event.resourceId!==configId)deny()
 const meta=receipt(event.metadata,grantId,configId)
 if(event.actorId!==meta.selectedBinding.binding.authorization.issuerId)conflict('认知配置发行者与原审计不一致')
 return meta
}
export function readApprovedTrainingCognitiveArtifact(tx:Tx,configId:string,rawProfile:unknown,artifactHash:string){
 return readApprovedCognitiveProfileArtifact(tx,configId,rawProfile,artifactHash,'TRAINING')
}

/** Reuses the existing immutable/versioned capability grant store. No mirrored
 * MaterialGrant or new permission table; resourceId-only legacy uses stay put. */
export async function grantTrainingCognitiveProfileUse(actorId:string,configId:string,rawProfile:unknown,raw:unknown){
 id.parse(configId);const selected=profile.parse(rawProfile),input=trainingCognitiveUseInput.parse(raw)
 const from=new Date(input.validFrom),until=new Date(input.expiresAt)
 if(until<=from||input.replaces?.grantId===input.requestId)conflict('授权有效期或替换身份不合法')
 const intent=requestIntent.parse({...input,actorId,configId,profile:selected}),intentHash=canonicalHash(intent)
 return prisma.$transaction(async tx=>{
  const manager=await assertEntryAdmin(tx,actorId,'TRAINING')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'training-cognitive-request:'+input.requestId}))`
  const prior=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(prior){
   if(prior.action!==TRAINING_COGNITIVE_USE_ACTION||prior.resourceId!==configId||prior.actorId!==actorId)conflict('请求编号已用于其他操作')
   const saved=receipt(prior.metadata,input.requestId,configId)
   if(saved.requestIntentHash!==intentHash)conflict('请求编号已用于不同的配置或接收者')
   const grant=await tx.contentCapabilityGrant.findUnique({where:{id:input.requestId}});if(!grant)conflict('原授权记录缺失')
   grantMatches(grant,saved,configId)
   return {id:grant.id,version:grant.version,revoked:grant.revokedAt!==null,replayed:true,changed:false,selectedBinding:selectedConfigurationPointer(saved.selectedBinding)}
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'training-cognitive-recipient:'+input.userId+':'+configId}))`
  await eligible(tx,input.userId)
  const {artifact}=await readApprovedTrainingCognitiveArtifact(tx,configId,selected,input.artifactHash)
  const [{now}]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`
  if(until<=now)conflict('新使用授权已经过期')
  const overlap=await tx.$queryRaw<Array<{id:string;issuer_id:string}>>`SELECT g.id,g.issuer_id FROM content_capability_grants g
   JOIN assessment_management_events e ON e.id=g.id AND e.action=${TRAINING_COGNITIVE_USE_ACTION} AND e.resource_id=${configId}
   WHERE g.subject_id=${input.userId} AND g.product='TRAINING' AND g.scope_kind='PLATFORM' AND g.scope_id=${TRAINING_COGNITIVE_USE_SCOPE}
    AND g.revoked_at IS NULL AND g.valid_from<${until} AND g.expires_at>${from} ORDER BY g.id LIMIT 2 FOR UPDATE OF g`
  if(overlap.length>1)conflict('同工具存在多个交叠配置，请管理员先整理原授权')
  if(overlap.some(g=>g.issuer_id!==actorId))deny('不能接管另一发行者的使用配置')
  if(overlap.length&&input.replaces?.grantId!==overlap[0].id)conflict('已有固定配置，请明确选择原授权和替换原因')
  let previous:z.infer<typeof supersedes>|undefined
  if(input.replaces){
   const meta=await original(tx,input.replaces.grantId,configId)
   const old=await tx.contentCapabilityGrant.findUnique({where:{id:input.replaces.grantId}})
   if(!old)conflict('原授权不存在');grantMatches(old,meta,configId)
   if(old.issuerId!==actorId||old.subjectId!==input.userId)deny('只能替换自己给同一接收者的配置')
   if(old.version!==input.replaces.expectedVersion)conflict('原使用权版本已变化')
   previous={selectedBinding:selectedConfigurationPointer(meta.selectedBinding),observedVersion:old.version,reason:input.replaces.reason}
   if(!old.revokedAt){
    await revokeContentAuthority(tx,{actorId,grantId:old.id,expectedVersion:old.version,reason:input.replaces.reason})
    await tx.assessmentManagementEvent.create({data:{id:randomUUID(),actorId,resourceId:configId,action:TRAINING_COGNITIVE_REVOKE_ACTION,
     metadata:{schemaVersion:1,grantId:old.id,previousVersion:old.version,version:old.version+1,reason:input.replaces.reason,replacementRequestId:input.requestId}}})
   }
  }
  const sealed=sealSelectedConfigurationBinding({product:'TRAINING',configuration:artifact.identity,authorization:{kind:'COGNITIVE_PROFILE_USE',
   id:input.requestId,revision:1,issuerId:actorId,recipientId:input.userId,organizationId:null,
   authority:[{kind:'ENTRY_ADMIN',id:manager.grantId,revision:manager.grantVersion}]}})
  const grant=await tx.contentCapabilityGrant.create({data:{id:input.requestId,subjectId:input.userId,issuerId:actorId,parentGrantId:null,
   product:'TRAINING',scopeKind:'PLATFORM',scopeId:TRAINING_COGNITIVE_USE_SCOPE,resourceKind:'material',resourceKeys:[key(configId,input.artifactHash)],
   capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:from,expiresAt:until,ancestry:[input.requestId]}})
  await tx.assessmentManagementEvent.create({data:{id:grant.id,actorId,resourceId:configId,action:TRAINING_COGNITIVE_USE_ACTION,
   metadata:{schemaVersion:1,userId:input.userId,artifactHash:input.artifactHash,configurationName:input.configurationName,selectedBinding:sealed,
    requestIntentHash:intentHash,requestIntent:intent,selfGrant:actorId===input.userId,...(previous?{supersedes:previous}:{})}}})
  return {id:grant.id,version:grant.version,revoked:false,replayed:false,changed:true,selectedBinding:selectedConfigurationPointer(sealed)}
 },options)
}

export async function readTrainingCognitiveProfileOperation(actorId:string,configId:string,requestId:string){
 id.parse(configId);id.parse(requestId)
 return prisma.$transaction(async tx=>{
  await assertEntryAdmin(tx,actorId,'TRAINING')
  const event=await tx.assessmentManagementEvent.findUnique({where:{id:requestId}})
  if(!event||event.actorId!==actorId||event.resourceId!==configId)return null
  if(event.action===TRAINING_COGNITIVE_REVOKE_ACTION){
   const raw=z.object({schemaVersion:z.literal(1),grantId:id,previousVersion:revision,version:revision,reason:z.string(),requestIntentHash:hash,
    requestIntent:trainingCognitiveRevokeInput.extend({actorId:id,configId:id,grantId:id}).strict()}).strict().safeParse(event.metadata)
   // Automatic replacement revoke has no independently submitted requestId.
   if(!raw.success)return null
   const meta=raw.data,intent=meta.requestIntent
   if(intent.requestId!==requestId||intent.actorId!==actorId||intent.configId!==configId||intent.grantId!==meta.grantId
    ||intent.expectedVersion!==meta.previousVersion||meta.version!==meta.previousVersion+1||intent.reason!==meta.reason||canonicalHash(intent)!==meta.requestIntentHash)conflict('原撤销审计身份不一致')
   const source=await original(tx,meta.grantId,configId),grant=await tx.contentCapabilityGrant.findUnique({where:{id:meta.grantId}})
   if(!grant||grant.issuerId!==actorId)deny();grantMatches(grant,source,configId)
   return {kind:'REVOKE' as const,request:{requestId,expectedVersion:intent.expectedVersion,reason:intent.reason},grantId:intent.grantId,
    grant:{id:grant.id,version:grant.version,revokedAt:grant.revokedAt}}
  }
  if(event.action!==TRAINING_COGNITIVE_USE_ACTION)return null
  const meta=receipt(event.metadata,requestId,configId),grant=await tx.contentCapabilityGrant.findUnique({where:{id:requestId}})
  if(!grant)conflict('原使用权记录缺失');grantMatches(grant,meta,configId)
  const {actorId:_,configId:_config,profile:selected,...request}=meta.requestIntent
  return {kind:'ISSUE' as const,profile:selected,request,grant:{id:grant.id,version:grant.version,revokedAt:grant.revokedAt},
   selectedBinding:selectedConfigurationPointer(meta.selectedBinding),configurationName:meta.configurationName,supersedes:meta.supersedes??null}
 },options)
}

export const trainingCognitiveRevokeInput=z.object({requestId:id,expectedVersion:revision,reason:z.string().trim().min(1).max(500)}).strict()
export async function revokeTrainingCognitiveProfileUse(actorId:string,configId:string,grantId:string,raw:unknown){
 id.parse(configId);id.parse(grantId);const input=trainingCognitiveRevokeInput.parse(raw),intent={actorId,configId,grantId,...input},intentHash=canonicalHash(intent)
 return prisma.$transaction(async tx=>{
  await assertEntryAdmin(tx,actorId,'TRAINING')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'training-cognitive-request:'+input.requestId}))`
  const previous=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  const meta=await original(tx,grantId,configId)
  if(meta.selectedBinding.binding.authorization.issuerId!==actorId)deny('只能撤销自己发行的认知配置')
  if(previous){
   const saved=previous.metadata as {requestIntentHash?:string;grantId?:string;version?:number}|null
   if(previous.actorId!==actorId||previous.resourceId!==configId||previous.action!==TRAINING_COGNITIVE_REVOKE_ACTION
    ||saved?.requestIntentHash!==intentHash||saved.grantId!==grantId)conflict('请求编号已用于不同的撤销意图')
   const current=await tx.contentCapabilityGrant.findUnique({where:{id:grantId}});if(!current)conflict('原授权记录缺失')
   grantMatches(current,meta,configId)
   return {id:grantId,version:current.version,revoked:current.revokedAt!==null,replayed:true,changed:false}
  }
  const current=await tx.contentCapabilityGrant.findUnique({where:{id:grantId}});if(!current)conflict('原授权记录缺失')
  grantMatches(current,meta,configId)
  try{await revokeContentAuthority(tx,{actorId,grantId,expectedVersion:input.expectedVersion,reason:input.reason})}catch(error){
   if(error instanceof ContentAuthorityError)conflict('原授权已经撤销或版本已变化');throw error
  }
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:configId,action:TRAINING_COGNITIVE_REVOKE_ACTION,
   metadata:{schemaVersion:1,grantId,previousVersion:input.expectedVersion,version:input.expectedVersion+1,reason:input.reason,requestIntentHash:intentHash,requestIntent:intent}}})
  return {id:grantId,version:input.expectedVersion+1,revoked:true,replayed:false,changed:true}
 },options)
}

export function readTrainingCognitiveTaskBinding(courseSnapshot:unknown):TrainingCognitiveTaskBinding|null{
 const raw=courseSnapshot&&typeof courseSnapshot==='object'&&!Array.isArray(courseSnapshot)
  ?(courseSnapshot as Record<string,unknown>).selectedCognitiveProfile:undefined
 return raw===undefined?null:trainingCognitiveTaskBindingSchema.parse(raw)
}
export async function hasTrainingCognitiveProfileHistory(tx:Pick<Tx,'$queryRaw'>,userId:string,configId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_management_events
  WHERE action=${TRAINING_COGNITIVE_USE_ACTION} AND resource_id=${configId} AND metadata->>'userId'=${userId} LIMIT 1`
 return rows.length>0
}
type DirectoryHeader={authorizationMode:'PRECISE';available:boolean;unavailableReason:string|null;fixedProfile:z.infer<typeof profile>|null;
 configurationName:string|null;selectedBinding:z.infer<typeof selectedConfigurationPointerSchema>|null}
/** Current hints only. One bounded query, no profile-body decrypt/compiler. */
export async function listTrainingCognitiveProfileHeaders(tx:Pick<Tx,'$queryRaw'>,userId:string){
 const rows=await tx.$queryRaw<Array<{configId:string;choices:Array<{id:string;metadata:unknown;available:boolean}>}>>`WITH configs AS (
  SELECT DISTINCT resource_id FROM assessment_management_events WHERE action=${TRAINING_COGNITIVE_USE_ACTION} AND metadata->>'userId'=${userId} LIMIT 101)
 SELECT configs.resource_id AS "configId",COALESCE((SELECT jsonb_agg(h) FROM (
  SELECT g.id,e.metadata,COALESCE(g.version=1 AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
   AND g.resource_kind='material' AND g.capabilities=ARRAY['material.use']::text[] AND g.delegable_capabilities=ARRAY[]::text[] AND g.remaining_delegation_depth=0
   AND g.resource_keys=ARRAY['cognitive-profile:'||configs.resource_id||':'||(e.metadata->>'artifactHash')]::text[]
   AND g.issuer_id=e.metadata#>>'{selectedBinding,binding,authorization,issuerId}'
   AND u.role='TEACHER' AND u.teacher_approved AND u.account_domain IN ('TRAINING','LEGACY') AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
   AND manager.platform_role='STANDARD' AND manager.account_domain IN ('TRAINING','LEGACY') AND manager.is_active AND NOT manager.is_frozen AND NOT manager.must_change_password AND (manager.expires_at IS NULL OR manager.expires_at>clock_timestamp())
   AND basis.entry='TRAINING' AND basis.user_id=g.issuer_id AND basis.revoked_at IS NULL AND basis.version::text=e.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}'
   AND p.decision='APPROVED' AND NOT p.paused AND c.status='PUBLISHED' AND m.status='PUBLISHED' AND m.family='COGNITIVE' AND m.layer='MEASUREMENT'
   AND m.id=e.metadata#>>'{selectedBinding,binding,configuration,measurement,releaseId}' AND m.content_hash=e.metadata#>>'{selectedBinding,binding,configuration,measurement,contentHash}',false) AS available
  FROM assessment_management_events e JOIN content_capability_grants g ON g.id=e.id JOIN users u ON u.id=g.subject_id
   JOIN users manager ON manager.id=g.issuer_id LEFT JOIN admin_entry_grants basis ON basis.id=e.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}'
   LEFT JOIN survey_tool_policies p ON p.product='TRAINING' AND p.resource_key='cognitive-profile:'||configs.resource_id||':'||(e.metadata#>>'{selectedBinding,binding,configuration,profile}') AND p.fingerprint=e.metadata->>'artifactHash'
   LEFT JOIN cognitive_test_configs c ON c.id=configs.resource_id LEFT JOIN measurement_content_releases m ON m.id=c.measurement_release_id
  WHERE e.action=${TRAINING_COGNITIVE_USE_ACTION} AND e.resource_id=configs.resource_id AND e.metadata->>'userId'=${userId}
   AND g.subject_id=${userId} AND g.product='TRAINING' AND g.scope_kind='PLATFORM' AND g.scope_id=${TRAINING_COGNITIVE_USE_SCOPE}
   AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC' LIMIT 2
 ) h),'[]'::jsonb) AS choices FROM configs`
 if(rows.length>100)conflict('固定认知配置超出目录范围，请管理员整理后重试')
 const headers=new Map<string,DirectoryHeader>()
 for(const row of rows){
  const unavailable:DirectoryHeader={authorizationMode:'PRECISE',available:false,unavailableReason:'管理员固定的认知配置已经失效',fixedProfile:null,configurationName:null,selectedBinding:null}
  if(row.choices.length!==1){headers.set(row.configId,{...unavailable,unavailableReason:row.choices.length?'同工具存在多个固定配置，请管理员明确默认配置':unavailable.unavailableReason});continue}
  const choice=row.choices[0]
  try{
   const meta=receipt(choice.metadata,choice.id,row.configId),identity=meta.selectedBinding.binding.configuration
   if(identity.kind!=='COGNITIVE_PROFILE')throw Error('Invalid identity')
   headers.set(row.configId,{authorizationMode:'PRECISE',available:choice.available,unavailableReason:choice.available?null:'原配置、批准范围或发行管理依据已经失效',
    fixedProfile:identity.profile,configurationName:meta.configurationName,selectedBinding:selectedConfigurationPointer(meta.selectedBinding)})
  }catch{headers.set(row.configId,{...unavailable,unavailableReason:'原固定配置身份不完整，请管理员核对'})}
 }
 return headers
}
export async function listTrainingCognitiveProfileConfigurations(actorId:string,raw:unknown){
 const input=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(120).default(''),...catalogDiscoveryQueryFields}).strict().parse(raw),size=25,records=catalogDiscoveryRecords()
 return prisma.$transaction(async tx=>{
  await assertEntryAdmin(tx,actorId,'TRAINING')
  const rows=await tx.$queryRaw<Array<{configId:string;title:string;artifactHash:string;configuration:unknown;sourceAvailable:boolean;classificationTags:CatalogClassificationTag[]}>>(Prisma.sql`SELECT DISTINCT COALESCE(discovery.tags,'[]'::jsonb) AS "classificationTags",c.id AS "configId",c.name AS title,p.fingerprint AS "artifactHash",
   e.metadata->'configuration' AS configuration,(c.status='PUBLISHED' AND m.status='PUBLISHED' AND m.family='COGNITIVE' AND m.layer='MEASUREMENT' AND t.template_hash IS NOT NULL) AS "sourceAvailable"
   FROM survey_tool_policies p JOIN assessment_management_events e ON e.action='COGNITIVE_PROFILE_APPROVED' AND e.metadata->>'artifactHash'=p.fingerprint AND e.metadata->>'artifactFormatVersion'='2'
    JOIN cognitive_test_configs c ON c.id=e.resource_id AND p.resource_key='cognitive-profile:'||c.id||':'||(e.metadata#>>'{configuration,profile}')
    LEFT JOIN measurement_content_releases m ON m.id=c.measurement_release_id AND m.id=e.metadata#>>'{configuration,measurement,releaseId}' AND m.content_hash=e.metadata#>>'{configuration,measurement,contentHash}'
    LEFT JOIN assessment_public_templates t ON t.template_hash=p.fingerprint AND t.template_kind='COGNITIVE_PROFILE_CONFIGURATION'
   ${discoveryJoin(records,{kind:Prisma.sql`'COGNITIVE'`,key:Prisma.sql`c.test_type`,version:Prisma.sql`NULL`,engine:Prisma.sql`c.engine_version`,scoring:Prisma.sql`c.scoring_version`})}
   WHERE ${discoverySqlFilter([Prisma.sql`c.name`,Prisma.sql`c.test_type`],{...input,keyword:[input.q,input.keyword].filter(Boolean).join(' ')})} AND p.product='TRAINING' AND p.decision='APPROVED' AND NOT p.paused
   ORDER BY c.id,p.fingerprint LIMIT ${size+1} OFFSET ${(input.page-1)*size}`)
  const conflicts=new Set(rows.filter((r,i)=>rows.some((other,j)=>i!==j&&r.configId===other.configId&&r.artifactHash===other.artifactHash)).map(r=>r.artifactHash))
  return {page:input.page,hasMore:rows.length>size,tagFacets:discoveryFacets(records,'COGNITIVE'),list:rows.slice(0,size).map(row=>{
   const identity=cognitiveProfileApprovalReceipt.shape.configuration.parse(row.configuration),available=Boolean(row.sourceAvailable&&!conflicts.has(row.artifactHash))
   return {configId:row.configId,title:row.title,artifactHash:row.artifactHash,profile:identity.profile,configuration:identity,classificationTags:row.classificationTags,
    available,unavailableReason:available?null:'已批准来源或原审批证据不可用，请管理员核对'}
  })}
 },options)
}
/** Typed source identity is independent of current permission. Lifecycle true
 * is only for NEW draft/publish/START, never historical reports/resume. */
export async function loadPinnedTrainingCognitiveProfile(tx:Tx,pin:TrainingCognitiveTaskBinding,context:{userId:string;configId:string},lifecycle:boolean){
 const meta=await original(tx,pin.selectedBinding.authorizationId,context.configId)
 const sealed=readSelectedConfigurationBinding(meta.selectedBinding,{product:'TRAINING',recipientId:context.userId,organizationId:null,
  authorizationId:pin.selectedBinding.authorizationId,authorizationRevision:pin.selectedBinding.authorizationRevision})!
 if(canonicalHash(selectedConfigurationPointer(sealed))!==canonicalHash(pin.selectedBinding)||meta.artifactHash!==pin.artifactHash)deny('原精确 profile 指针不一致')
 const identity=sealed.binding.configuration;if(identity.kind!=='COGNITIVE_PROFILE')deny()
 const artifact=await loadCognitiveProfileArtifact(pin.artifactHash,identity)
 if(lifecycle){
  await eligible(tx,context.userId)
  const g=await tx.contentCapabilityGrant.findUnique({where:{id:pin.selectedBinding.authorizationId}});if(!g)deny();grantMatches(g,meta,context.configId)
  let current:Awaited<ReturnType<typeof assertContentAuthority>>
  try{current=await assertContentAuthority(tx,{actorId:context.userId,grantId:g.id,capability:'material.use',scope:{product:'TRAINING',scopeKind:'PLATFORM',
   scopeId:TRAINING_COGNITIVE_USE_SCOPE,resourceKind:'material',resourceKeys:[key(context.configId,pin.artifactHash)]}})}catch(error){
    if(error instanceof ContentAuthorityError)deny('原认知配置使用权已失效');throw error
  }
  if(current.version!==pin.selectedBinding.authorizationRevision)deny('原使用权已撤销或修订')
  const manager=await assertEntryAdmin(tx,g.issuerId,'TRAINING'),basis=sealed.binding.authorization.authority[0]
  if(manager.grantId!==basis.id||manager.grantVersion!==basis.revision)deny('原发行入口管理依据已变化')
  await assertPublishedCognitiveArtifactSource(tx,artifact)
  await assertToolEntryPolicy(tx,cognitiveProfilePolicyIdentity(context.configId,identity.profile,pin.artifactHash),'TRAINING')
 }
 return {artifact,selectedBinding:sealed,configurationName:meta.configurationName}
}
/** A resourceId-only/OPEN/ADMIN path cannot erase existing precise history. */
export async function resolveTrainingCognitiveProfileForNewTask(tx:Tx,userId:string,configId:string,expected?:z.infer<typeof selectedConfigurationPointerSchema>){
 if(!await hasTrainingCognitiveProfileHistory(tx,userId,configId)){
  if(expected)deny('没有与该指针对应的精确授权');return null
 }
 const rows=await tx.$queryRaw<Array<{id:string;metadata:unknown}>>`SELECT g.id,e.metadata FROM assessment_management_events e
  JOIN content_capability_grants g ON g.id=e.id WHERE e.action=${TRAINING_COGNITIVE_USE_ACTION} AND e.resource_id=${configId} AND e.metadata->>'userId'=${userId}
   AND g.subject_id=${userId} AND g.product='TRAINING' AND g.scope_kind='PLATFORM' AND g.scope_id=${TRAINING_COGNITIVE_USE_SCOPE}
   AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC' LIMIT 2`
 if(rows.length!==1)deny(rows.length?'同工具有多个可用配置，请管理员明确默认配置':'管理员固定的认知配置已失效，请联系管理员')
 const meta=receipt(rows[0].metadata,rows[0].id,configId),pointer=selectedConfigurationPointer(meta.selectedBinding)
 if(expected&&canonicalHash(expected)!==canonicalHash(pointer))deny('不能替换管理员选定的 profile')
 const pin=trainingCognitiveTaskBindingSchema.parse({schemaVersion:1,artifactHash:meta.artifactHash,selectedBinding:pointer})
 return {...await loadPinnedTrainingCognitiveProfile(tx,pin,{userId,configId},true),pin}
}

/** Management metadata only: no executable-body decrypt on recipient lists. */
export async function listTrainingCognitiveProfileUses(actorId:string,configId:string,raw:unknown){
 id.parse(configId);const {userId}=z.object({userId:id}).strict().parse(raw)
 return prisma.$transaction(async tx=>{
  await assertEntryAdmin(tx,actorId,'TRAINING')
  const rows=await tx.$queryRaw<Array<{id:string;metadata:unknown}>>`SELECT e.id,e.metadata FROM assessment_management_events e
   WHERE e.action=${TRAINING_COGNITIVE_USE_ACTION} AND e.resource_id=${configId} AND e.metadata->>'userId'=${userId}
   ORDER BY e.created_at DESC,e.id DESC LIMIT 51`
  const grants=await tx.contentCapabilityGrant.findMany({where:{id:{in:rows.map(row=>row.id)}}})
  return {hasMore:rows.length>50,list:rows.slice(0,50).map(row=>{
   const meta=receipt(row.metadata,row.id,configId),grant=grants.find(g=>g.id===row.id)
   if(!grant)conflict('原认知配置使用权缺失');grantMatches(grant,meta,configId)
   return {id:grant.id,version:grant.version,userId,issuerId:grant.issuerId,configurationName:meta.configurationName,
    profile:meta.requestIntent.profile,artifactHash:meta.artifactHash,selectedBinding:selectedConfigurationPointer(meta.selectedBinding),
    validFrom:grant.validFrom,expiresAt:grant.expiresAt,revokedAt:grant.revokedAt,canManage:grant.issuerId===actorId}
  })}
 },options)
}
export async function previewTrainingCognitiveProfile(actorId:string,configId:string,selected:unknown,raw:unknown){
 const {artifactHash}=z.object({artifactHash:hash}).strict().parse(raw)
 return prisma.$transaction(async tx=>{
  await assertEntryAdmin(tx,actorId,'TRAINING')
  const {artifact}=await readApprovedTrainingCognitiveArtifact(tx,configId,selected,artifactHash)
  const report=artifact.resolvedReport
  return {artifactHash,configuration:artifact.identity,reportStyle:{title:report.reportDefinition.title??'本次任务表现报告',
   profile:artifact.identity.profile,caveats:report.reportCaveats??[],disclaimer:report.reportDefinition.disclaimer??'',
   headline:report.reportDefinition.primaryMetrics.map(key=>({key,label:(report.metricDefinitions[key] as {label?:string})?.label??key})),
   detail:report.reportDefinition.secondaryMetrics.map(key=>({key,label:(report.metricDefinitions[key] as {label?:string})?.label??key}))}}
 },options)
}
