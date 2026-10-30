import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {validAdminProof,ADMIN_STEP_UP_SECONDS,type AdminSessionProof} from '../admin-permissions/proof'
import {canonicalHash} from '../assessment-runtime/canonical'
import {publicTemplatesForDatabase} from '../assessment-runtime/public-templates'
import {approveCognitiveProfileEntryPolicies,exactStandardCombinationEntryProducts} from '../assessment-governance/tool-entry-policy'
import {preparePublishedCognitiveProfile,cognitiveProfilePolicyIdentity} from './cognitive-profile-source'
import {saveCognitiveProfileArtifact} from './cognitive-profile-artifact'
import {selectedConfigurationSchema} from './selected-configuration'
const id=z.string().guid(),profile=z.enum(['experience','standard','research']),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const cognitiveProfileApprovalInput=z.object({requestId:id,expectedArtifactHash:hash,
 allowedProducts:z.array(z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])).min(1).max(4),reason:z.string().trim().min(1).max(1000)}).strict()
export const cognitiveProfileApprovalReceipt=z.object({schemaVersion:z.literal(1),requestIntentHash:hash,artifactHash:hash,
 configuration:selectedConfigurationSchema.options[1],allowedProducts:cognitiveProfileApprovalInput.shape.allowedProducts,
 reason:cognitiveProfileApprovalInput.shape.reason}).strict()
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
async function assertSystem(tx:Prisma.TransactionClient,actorId:string,proof?:AdminSessionProof,requireProof=false){
 const [actor]=await tx.$queryRaw<Array<{id:string;tokenVersion:number}>>`SELECT id,token_version AS "tokenVersion" FROM users
  WHERE id=${actorId} AND platform_role='SYSTEM_ADMIN' AND account_domain IN ('TRAINING','LEGACY')
   AND is_active AND NOT is_frozen AND NOT must_change_password AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`
 if(!actor||requireProof&&!proof||proof&&(!validAdminProof(proof,ADMIN_STEP_UP_SECONDS)||proof.tokenVersion!==actor.tokenVersion))
  throw new AdminPermissionError(403,'需要当前独立系统管理员身份及有效的审批会话')
}
export async function previewCognitiveProfileApproval(actorId:string,configId:string,rawProfile:unknown){
 const selected=profile.parse(rawProfile)
 return prisma.$transaction(async tx=>{
  await assertSystem(tx,actorId)
  const source=await preparePublishedCognitiveProfile(tx,id.parse(configId),selected)
  return {configId,profile:selected,title:source.config.name,artifactHash:source.artifactHash,configuration:source.artifact.identity,
   report:source.artifact.resolvedReport,previewOnly:true}
 },options)
}
export async function approveCognitiveProfile(actorId:string,configId:string,rawProfile:unknown,raw:unknown,proof:AdminSessionProof){
 id.parse(configId);const selected=profile.parse(rawProfile),input=cognitiveProfileApprovalInput.parse(raw)
 const products=exactStandardCombinationEntryProducts(input.allowedProducts)
 const intentHash=canonicalHash({actorId,configId,profile:selected,...input,allowedProducts:products})
 return prisma.$transaction(async tx=>{
  await assertSystem(tx,actorId,proof,true)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cognitive-profile-approval:'+input.requestId}))`
  const previous=await tx.assessmentManagementEvent.findUnique({where:{id:input.requestId}})
  if(previous){
   const parsed=cognitiveProfileApprovalReceipt.safeParse(previous.metadata),metadata=parsed.success?parsed.data:null
   if(previous.actorId!==actorId||previous.resourceId!==configId||previous.action!=='COGNITIVE_PROFILE_APPROVED'
    ||!metadata||metadata.requestIntentHash!==intentHash||metadata.artifactHash!==input.expectedArtifactHash
    ||metadata.configuration.configId!==configId||metadata.configuration.profile!==selected)
    throw new AdminPermissionError(409,'请求编号已用于不同的 profile 审批意图')
   return {requestId:input.requestId,artifactHash:metadata.artifactHash,allowedProducts:metadata.allowedProducts,replayed:true,changed:false}
  }
  const source=await preparePublishedCognitiveProfile(tx,configId,selected)
  if(source.artifactHash!==input.expectedArtifactHash)throw new AdminPermissionError(409,'审批预览已变化，请核对精确配置')
  const saved=await saveCognitiveProfileArtifact(source.artifact,publicTemplatesForDatabase(tx))
  await approveCognitiveProfileEntryPolicies(tx,cognitiveProfilePolicyIdentity(configId,selected,saved.artifactHash),products,actorId,input.reason)
  await tx.assessmentManagementEvent.create({data:{id:input.requestId,actorId,resourceId:configId,action:'COGNITIVE_PROFILE_APPROVED',
   metadata:{schemaVersion:1,requestIntentHash:intentHash,artifactHash:saved.artifactHash,configuration:saved.identity,allowedProducts:products,reason:input.reason}}})
  return {requestId:input.requestId,artifactHash:saved.artifactHash,allowedProducts:products,replayed:false,changed:true}
 },options)
}
