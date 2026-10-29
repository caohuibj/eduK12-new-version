import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {canonicalHash} from '../assessment-runtime/canonical'
import {lockEducationAssessmentUsers} from '../education-tools/assessment-resource.locks'
import {assertEducationConfigurationManager} from './education-standard-management'
import {EDUCATION_STANDARD_USE_ACTION,readEducationStandardUseBinding,type EducationConfigurationScope} from './education-standard-use'

const id=z.string().guid()
export const educationStandardRevokeInput=z.object({requestId:id,expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(500)}).strict()
export const EDUCATION_STANDARD_REVOKE_ACTION='EDUCATION_STANDARD_CONFIGURATION_USE_REVOKED'
/** Reduces only this manager's original exact school/source use. A source or
 * original distribution withdrawal must not prevent clean-up or rewrite T1. */
export async function revokeEducationStandardConfigurationUse(actorId:string,scope:EducationConfigurationScope,combinationId:string,grantId:string,raw:unknown){
 id.parse(combinationId);id.parse(grantId);const input=educationStandardRevokeInput.parse(raw)
 const intentHash=canonicalHash({schemaVersion:1,actorId,scope,combinationId,grantId,...input})
 return prisma.$transaction(async tx=>{
  await lockEducationAssessmentUsers(tx,[actorId])
  await assertEducationConfigurationManager(tx,actorId,scope)
  const header=await tx.contentCapabilityGrant.findFirst({where:{id:grantId,issuerId:actorId,product:scope.product,scopeKind:'ORGANIZATION',scopeId:scope.organizationId},select:{subjectId:true}})
  if(!header)throw new AdminPermissionError(404,'未找到本管理范围内的原配置授权')
  await lockEducationAssessmentUsers(tx,[header.subjectId])
  const [row]=await tx.$queryRaw<Array<{id:string;subject_id:string;version:number;revoked_at:Date|null;resource_keys:string[]}>>(Prisma.sql`
   SELECT id,subject_id,version,revoked_at,resource_keys FROM content_capability_grants
   WHERE id=${grantId} AND issuer_id=${actorId} AND product=${scope.product} AND scope_kind='ORGANIZATION' AND scope_id=${scope.organizationId}
    AND resource_kind='material' AND capabilities=ARRAY['material.use']::text[] AND parent_grant_id IS NULL AND ancestry=ARRAY[id]::text[]
    AND remaining_delegation_depth=0 AND delegable_capabilities=ARRAY[]::text[] FOR UPDATE`)
  const original=await tx.assessmentManagementEvent.findUnique({where:{id:grantId}})
  if(!row||row.resource_keys.length!==1||!original||original.actorId!==actorId||original.action!==EDUCATION_STANDARD_USE_ACTION||original.resourceId!==combinationId)
   throw new AdminPermissionError(409,'原精确配置授权身份不完整')
  const selected=readEducationStandardUseBinding(original.metadata,{id:grantId,issuerId:actorId,recipientId:row.subject_id,scope,resourceKey:row.resource_keys[0]})
  if(selected.binding.configuration.kind!=='STANDARD_COMBINATION'||selected.binding.configuration.combinationId!==combinationId)
   throw new AdminPermissionError(409,'原配置来源与撤销目标不一致')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'education-standard-revoke:'+input.requestId}))`
  const previous=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(previous){
   const metadata=previous.metadata as {requestIntentHash?:string;grantId?:string}
   if(previous.actorId!==actorId||previous.action!==EDUCATION_STANDARD_REVOKE_ACTION||previous.resourceId!==combinationId
    ||metadata?.requestIntentHash!==intentHash||metadata.grantId!==grantId||!row.revoked_at||row.version!==input.expectedVersion+1)
    throw new AdminPermissionError(409,'请求编号已用于不同的撤销意图')
   return {id:grantId,version:row.version,revoked:true,changed:false,replayed:true}
  }
  if(row.revoked_at||row.version!==input.expectedVersion)throw new AdminPermissionError(409,'配置授权已变化，请重新读取')
  await tx.$executeRaw`UPDATE content_capability_grants SET revoked_at=clock_timestamp() AT TIME ZONE 'UTC',revoked_by=${actorId},revoke_reason=${input.reason},version=version+1 WHERE id=${grantId}`
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:combinationId,action:EDUCATION_STANDARD_REVOKE_ACTION,
   metadata:{schemaVersion:1,grantId,requestIntentHash:intentHash,previousVersion:input.expectedVersion,version:input.expectedVersion+1,reason:input.reason,scope}}})
  await assertEducationConfigurationManager(tx,actorId,scope)
  return {id:grantId,version:input.expectedVersion+1,revoked:true,changed:true,replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000})
}
