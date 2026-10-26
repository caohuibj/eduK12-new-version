import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {MaterialResourceType,Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {assertLibraryAuthority,libraryActor,assertExactTrainingDistributionDelegation} from '../scale-library-governance/authority'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {readCurrentStandardCombination} from './standard-combination-source'
import {standardCombinationPointerSchema} from './standard-combination'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {canonicalHash} from '../assessment-runtime/canonical'
export {standardCombinationPointerSchema} from './standard-combination'

const uuid=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
const issueSchema=z.object({requestId:uuid,userId:uuid,combinationHash:hash,grantId:uuid.optional(),
 expectedGrantVersion:z.number().int().positive().optional(),expectedUseVersion:z.number().int().positive().optional()}).strict()
const revokeSchema=z.object({expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(1000)}).strict()
const positive=z.number().int().positive()
const useAuthority={useGrantId:uuid,useGrantVersion:positive,issuerId:z.string().min(1).max(240)}
// The first branch is byte-compatible with already-frozen delegated references.
export const trainingStandardUseAuthoritySchema=z.union([
 z.object({...useAuthority,authorityGrantId:uuid}).strict(),
 z.object({...useAuthority,authorityEntryGrantId:uuid,authorityEntryGrantVersion:positive}).strict(),
])
const receipt={grantId:uuid,userId:uuid,combinationHash:hash,useVersion:positive,product:z.literal('TRAINING')}
const receiptSchema=z.union([
 z.object({...receipt,authorityGrantId:uuid}).strict(),
 z.object({...receipt,authorityEntryGrantId:uuid,authorityEntryGrantVersion:positive}).strict(),
])
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
type UseRow={id:string;teacher_id:string;resource_id:string;granted_by:string;standard_combination_hash:string;authority_grant_id:string|null;authority_entry_grant_id:string|null;authority_entry_grant_version:number|null;version:number;revoked_at:Date|null}
function deny(message='该精确组合的 Training 使用授权不可用'):never{throw new AdminPermissionError(403,message)}
type AuthorityBinding={authorityGrantId:string}|{authorityEntryGrantId:string;authorityEntryGrantVersion:number}
function binding(value:{authorityGrantId?:string|null;authorityEntryGrantId?:string|null;authorityEntryGrantVersion?:number|null}):AuthorityBinding{
 if(value.authorityGrantId&&!value.authorityEntryGrantId&&value.authorityEntryGrantVersion==null)return {authorityGrantId:value.authorityGrantId}
 if(!value.authorityGrantId&&value.authorityEntryGrantId&&Number.isInteger(value.authorityEntryGrantVersion)&&(value.authorityEntryGrantVersion??0)>0)
  return {authorityEntryGrantId:value.authorityEntryGrantId,authorityEntryGrantVersion:value.authorityEntryGrantVersion!}
 return deny('使用权分配依据不完整或混合')
}
const rowBinding=(row:UseRow)=>binding({authorityGrantId:row.authority_grant_id,authorityEntryGrantId:row.authority_entry_grant_id,authorityEntryGrantVersion:row.authority_entry_grant_version})
const columns=(value:AuthorityBinding)=>'authorityGrantId'in value
 ?{authorityGrantId:value.authorityGrantId,authorityEntryGrantId:null,authorityEntryGrantVersion:null}
 :{authorityGrantId:null,authorityEntryGrantId:value.authorityEntryGrantId,authorityEntryGrantVersion:value.authorityEntryGrantVersion}

export async function assertTrainingStandardRecipient(tx:Prisma.TransactionClient,userId:string){
 const actor=await libraryActor(tx,userId)
 if(actor.role!=='TEACHER'||!actor.teacher_approved||!['TRAINING','LEGACY'].includes(actor.account_domain))deny('需要当前合格的 Training 教师')
 return actor
}

/** One user use per immutable combination, independent of course. Reuses the
 * existing material grant store and 21B's exact C distribution authority. */
export async function assertTrainingStandardUse(tx:Prisma.TransactionClient,input:{userId:string;combination:{releaseId:string;combinationHash:string};
 measurementReleaseId:string;useGrantId?:string;useGrantVersion?:number}){
 await assertTrainingStandardRecipient(tx,input.userId)
 const [header]=await tx.$queryRaw<UseRow[]>(Prisma.sql`SELECT id,teacher_id,resource_id,granted_by,standard_combination_hash,authority_grant_id,authority_entry_grant_id,authority_entry_grant_version,version,revoked_at
 FROM material_grants WHERE teacher_id=${input.userId} AND resource_type='STANDARD_COMBINATION'
 AND resource_id=${input.combination.releaseId} ${input.useGrantId?Prisma.sql`AND id=${input.useGrantId}`:Prisma.empty}`)
 if(!header||header.revoked_at||header.teacher_id!==input.userId||header.resource_id!==input.combination.releaseId||header.standard_combination_hash!==input.combination.combinationHash
  ||input.useGrantVersion!==undefined&&header.version!==input.useGrantVersion)deny()
 const original=rowBinding(header)
 if('authorityEntryGrantId'in original){
  // Never substitute a different/reissued entry role for the recorded basis.
  const current=await assertEntryAdmin(tx,header.granted_by,'TRAINING')
  if(current.grantId!==original.authorityEntryGrantId||current.grantVersion!==original.authorityEntryGrantVersion)deny('入口分配依据已变化')
 }else{
  // This row froze an exact 21B basis. A later entry role does not replace it.
  await assertExactTrainingDistributionDelegation(tx,header.granted_by,input.measurementReleaseId,original.authorityGrantId)
 }
 const [locked]=await tx.$queryRaw<UseRow[]>(Prisma.sql`SELECT id,teacher_id,resource_id,granted_by,standard_combination_hash,authority_grant_id,authority_entry_grant_id,authority_entry_grant_version,version,revoked_at
 FROM material_grants WHERE id=${header.id} FOR SHARE`)
 if(!locked||locked.revoked_at||locked.version!==header.version||locked.teacher_id!==input.userId||locked.resource_id!==input.combination.releaseId
  ||locked.standard_combination_hash!==input.combination.combinationHash||locked.granted_by!==header.granted_by
  ||canonicalHash(rowBinding(locked))!==canonicalHash(original))deny()
 return {useGrantId:locked.id,useGrantVersion:locked.version,issuerId:locked.granted_by,...original}
}

export async function grantTrainingStandardCombinationUse(actorId:string,combinationId:string,raw:unknown){
 const id=uuid.parse(combinationId),input=issueSchema.parse(raw)
 return prisma.$transaction(async tx=>{
  const [header]=await tx.$queryRaw<Array<{tool_key:string;instrument_version:string;measurement_release:{releaseId:string}|null}>>(Prisma.sql`
   SELECT tool_key,snapshot->>'instrumentVersion' AS instrument_version,measurement_release FROM survey_standard_releases WHERE id=${id}`)
  if(!header?.measurement_release)deny()
  await lockInstrumentSourceIdentity(tx,{instrumentKey:header.tool_key,instrumentVersion:header.instrument_version},'READ')
  const authority=await assertLibraryAuthority(tx,actorId,header.measurement_release.releaseId,'material.distribute','TRAINING',input.grantId)
  const selected:AuthorityBinding='entryAuthority'in authority&&authority.entryAuthority
   ?binding({authorityEntryGrantId:authority.entryAuthority.grantId,authorityEntryGrantVersion:authority.entryAuthority.version})
   :binding({authorityGrantId:authority.grantId})
  if(input.expectedGrantVersion!==undefined&&input.expectedGrantVersion!==authority.version)deny('入口分配权限已变化')
  await assertTrainingStandardRecipient(tx,input.userId)
  const source=await readCurrentStandardCombination(tx,{releaseId:id,combinationHash:input.combinationHash})
  if(source.measurement.releaseId!==header.measurement_release.releaseId)deny()
  await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+id,fingerprint:input.combinationHash},'TRAINING')
  await assertScaleLibraryCollectionAllowed(tx,[source.measurement.releaseId])
  // One operation receipt and one versioned use, independent of course. Retrying
  // a previously successful request never reactivates a subsequently revoked use.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'standard-use-request:'+input.requestId}))`)
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'standard-use:'+id+':'+input.userId}))`)
  const prior=await tx.materialGrant.findUnique({where:{teacherId_resourceType_resourceId:{teacherId:input.userId,resourceType:MaterialResourceType.STANDARD_COMBINATION,resourceId:id}}})
  const recorded=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(recorded){
   const receipt=receiptSchema.safeParse(recorded.metadata)
   if(recorded.actorId!==actorId||recorded.resourceId!==id||recorded.action!=='STANDARD_COMBINATION_USE_GRANTED'||!receipt.success
    ||receipt.data.userId!==input.userId||receipt.data.combinationHash!==input.combinationHash||canonicalHash(binding(receipt.data))!==canonicalHash(selected)
    ||prior?.id!==receipt.data.grantId)deny('请求编号已用于其他授权')
   return {id:prior.id,userId:input.userId,combination:{releaseId:id,combinationHash:input.combinationHash},
    version:receipt.data.useVersion,currentVersion:prior.version,revoked:prior.revokedAt!==null,changed:false,replayed:true}
  }
  const request=await tx.materialGrant.findUnique({where:{id:input.requestId}})
  if(request&&request.id!==prior?.id)deny('请求编号已用于其他授权')
  if(prior&&!prior.revokedAt){
   if(prior.grantedBy!==actorId||canonicalHash(binding(prior))!==canonicalHash(selected)||prior.standardCombinationHash!==input.combinationHash)deny('已有使用权不能被其他分配身份接管')
   if(input.expectedUseVersion!==undefined&&input.expectedUseVersion!==prior.version)deny('使用权版本已变化')
  }
  if(prior?.revokedAt&&(input.expectedUseVersion!==prior.version||prior.standardCombinationHash!==input.combinationHash))deny('重新分配须确认已撤销的使用权版本')
  if(!prior&&input.expectedUseVersion!==undefined)deny('使用权版本已变化')
  const use=prior?prior.revokedAt?await tx.materialGrant.update({where:{id:prior.id,version:prior.version,revokedAt:{not:null}},
   data:{revokedAt:null,version:{increment:1},grantedBy:actorId,...columns(selected)}}):prior
   :await tx.materialGrant.create({data:{id:input.requestId,teacherId:input.userId,resourceType:MaterialResourceType.STANDARD_COMBINATION,
    resourceId:id,grantedBy:actorId,...columns(selected),standardCombinationHash:input.combinationHash}})
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:id,action:'STANDARD_COMBINATION_USE_GRANTED',
   metadata:{grantId:use.id,userId:input.userId,combinationHash:input.combinationHash,...selected,useVersion:use.version,product:'TRAINING'}}})
  await assertTrainingStandardUse(tx,{userId:input.userId,combination:{releaseId:id,combinationHash:input.combinationHash},
   measurementReleaseId:source.measurement.releaseId,useGrantId:use.id,useGrantVersion:use.version})
  return {id:use.id,userId:input.userId,combination:{releaseId:id,combinationHash:input.combinationHash},version:use.version,
   currentVersion:use.version,revoked:false,changed:!prior||prior.revokedAt!==null,replayed:false}
 },options)
}

export async function revokeTrainingStandardCombinationUse(actorId:string,useId:string,raw:unknown){
 const input=revokeSchema.parse(raw)
 return prisma.$transaction(async tx=>{
  const id=uuid.parse(useId)
  const actor=await libraryActor(tx,actorId)
  const grant=await tx.materialGrant.findUnique({where:{id}})
  if(!grant||grant.resourceType!==MaterialResourceType.STANDARD_COMBINATION||!actor.systemAdmin&&grant.grantedBy!==actorId)deny()
  const assertRevokeAuthority=async()=>{
   const currentActor=await libraryActor(tx,actorId)
   if(currentActor.systemAdmin)return
   if(grant.grantedBy!==actorId)deny()
   const basis=binding(grant)
   if('authorityEntryGrantId'in basis){
    const current=await assertEntryAdmin(tx,actorId,'TRAINING')
    if(current.grantId!==basis.authorityEntryGrantId||current.grantVersion!==basis.authorityEntryGrantVersion)deny('入口分配依据已变化')
   }else{
    const [source]=await tx.$queryRaw<Array<{combination_hash:string;measurement_release:{releaseId:string}|null}>>(Prisma.sql`
     SELECT combination_hash,measurement_release FROM survey_standard_releases WHERE id=${grant.resourceId} FOR SHARE`)
    if(!source?.measurement_release||source.combination_hash!==grant.standardCombinationHash)deny()
    // Original issuer, original exact root and original measurement only.
    await assertExactTrainingDistributionDelegation(tx,actorId,source.measurement_release.releaseId,basis.authorityGrantId)
   }
  }
  await assertRevokeAuthority()
  const rows=await tx.$queryRaw<Array<{version:number}>>(Prisma.sql`UPDATE material_grants
   SET revoked_at=(clock_timestamp() AT TIME ZONE 'UTC'),version=version+1
   WHERE id=${id} AND version=${input.expectedVersion} AND revoked_at IS NULL RETURNING version`)
  if(!rows[0])throw new AdminPermissionError(409,'使用权已撤销或版本已变化')
  await assertRevokeAuthority()
  await tx.assessmentManagementEvent.create({data:{actorId,resourceId:grant.resourceId,action:'STANDARD_COMBINATION_USE_REVOKED',
   metadata:{grantId:id,userId:grant.teacherId,version:rows[0].version,reason:input.reason}}})
  return {id,version:rows[0].version,revoked:true}
 },options)
}

/** Training's owned-source picker only, not a public/bulk catalog read model.
 * Returns at most 100 currently usable choices, not the first 100 raw grants.
 * Keyset batches keep memory bounded; the existing transaction timeout bounds work.
 * Metadata is a hint; add/publish repeat exact source and current rights checks. */
export async function listTrainingStandardCombinationChoices(userId:string){
 return prisma.$transaction(async tx=>{
  await assertTrainingStandardRecipient(tx,userId)
  const choices=[]
  let cursor:{toolKey:string;releaseId:string;useId:string}|undefined
  const pageSize=100
  while(choices.length<pageSize){
  const rows=await tx.$queryRaw<Array<{id:string;combination_hash:string;title:string;tool_key:string;instrument_version:string;content_version:string;parameters_version:string;report_version:string;scale_id:string;measurement_release:{releaseId:string};use_id:string;use_version:number}>>(Prisma.sql`
   SELECT r.id,r.combination_hash,r.snapshot->>'title' AS title,r.tool_key,r.snapshot->>'instrumentVersion' AS instrument_version,
    r.snapshot#>>'{parts,CONTENT,version}' AS content_version,r.snapshot#>>'{parts,PARAMETERS,version}' AS parameters_version,r.snapshot#>>'{parts,REPORT,version}' AS report_version,
    s.id AS scale_id,r.measurement_release,g.id AS use_id,g.version AS use_version
   FROM material_grants g JOIN survey_standard_releases r ON r.id=g.resource_id AND r.combination_hash=g.standard_combination_hash
   JOIN scales s ON s.code=r.tool_key AND s.instrument_version=r.snapshot->>'instrumentVersion'
   WHERE g.teacher_id=${userId} AND g.resource_type='STANDARD_COMBINATION' AND g.revoked_at IS NULL AND r.state='ONLINE'
    AND s.status='PUBLISHED' AND s.instrument_class='STANDARD' AND s.library_entry_id IS NULL
    ${cursor?Prisma.sql`AND (r.tool_key,r.id,g.id)>(${cursor.toolKey},${cursor.releaseId},${cursor.useId})`:Prisma.empty}
   ORDER BY r.tool_key,r.id,g.id LIMIT 100`)
  for(const row of rows){
   try{await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+row.id,fingerprint:row.combination_hash},'TRAINING');await assertTrainingStandardUse(tx,{userId,combination:{releaseId:row.id,combinationHash:row.combination_hash},measurementReleaseId:row.measurement_release.releaseId,useGrantId:row.use_id,useGrantVersion:row.use_version})}
   catch(e){if(e instanceof AdminPermissionError||(e instanceof Error&&'statusCode'in e&&e.statusCode===403))continue;throw e}
   choices.push({combination:{releaseId:row.id,combinationHash:row.combination_hash},scaleId:row.scale_id,title:row.title,
    toolKey:row.tool_key,instrumentVersion:row.instrument_version,axisVersions:{CONTENT:row.content_version,PARAMETERS:row.parameters_version,REPORT:row.report_version},useGrantId:row.use_id,useGrantVersion:row.use_version})
   if(choices.length===pageSize)break
  }
  if(rows.length<pageSize)break
  const last=rows[rows.length-1]
  cursor={toolKey:last.tool_key,releaseId:last.id,useId:last.use_id}
  }
  return choices
 },options)
}
