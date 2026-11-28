import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {validAdminProof,ADMIN_STEP_UP_SECONDS,type AdminSessionProof} from '../admin-permissions/proof'
import {canonicalHash} from '../assessment-runtime/canonical'
import {publicTemplatesForDatabase} from '../assessment-runtime/public-templates'
import {approveCognitiveProfileEntryPolicies,exactStandardCombinationEntryProducts,readApprovedToolEntryProducts} from '../assessment-governance/tool-entry-policy'
import {preparePublishedCognitiveProfile,cognitiveProfilePolicyIdentity} from './cognitive-profile-source'
import {assertGitScalePublisher} from '../scale/onboarding/git-release-actor'
import {randomUUID} from 'node:crypto'
import type {CognitiveProfile} from '../cognitive/cognitive.types'
import {lockToolPolicyMutation,type StandardCombinationEntryProduct} from '../assessment-governance/tool-entry-policy'
import {saveCognitiveProfileArtifact} from './cognitive-profile-artifact'
import {selectedConfigurationSchema} from './selected-configuration'
const id=z.string().guid(),profile=z.enum(['experience','standard','research']),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const cognitiveProfileApprovalInput=z.object({requestId:id,expectedArtifactHash:hash,
 allowedProducts:z.array(z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])).min(1).max(4),reason:z.string().trim().min(1).max(1000)}).strict()
export const cognitiveProfileApprovalReceipt=z.object({schemaVersion:z.literal(1),requestIntentHash:hash,artifactHash:hash,
 configuration:selectedConfigurationSchema.options[1],allowedProducts:cognitiveProfileApprovalInput.shape.allowedProducts,
 reason:cognitiveProfileApprovalInput.shape.reason,executionRequirements:z.object({hasPresentation:z.boolean(),referenceCount:z.number().int().nonnegative()}).strict().optional(),artifactFormatVersion:z.union([z.literal(1),z.literal(2)]).optional()}).strict()
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
  const {approvedProducts,hasPriorPolicy}=await readApprovedToolEntryProducts(tx,cognitiveProfilePolicyIdentity(configId,selected,source.artifactHash))
  return {configId,profile:selected,title:source.config.name,artifactHash:source.artifactHash,configuration:source.artifact.identity,
   report:source.artifact.resolvedReport,approvedProducts,hasPriorPolicy,previewOnly:true}
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
  const saved=await persistApprovedCognitiveProfile(tx,actorId,source,input.requestId,intentHash,products,input.reason)

  return {requestId:input.requestId,artifactHash:saved.artifactHash,allowedProducts:products,replayed:false,changed:true}
 },options)
}


type ProfilePublicationSource=Awaited<ReturnType<typeof preparePublishedCognitiveProfile>>
async function persistApprovedCognitiveProfile(tx:Prisma.TransactionClient,actorId:string,source:ProfilePublicationSource,
 requestId:string,intentHash:string,products:StandardCombinationEntryProduct[],reason:string,preservePause=false){
 const saved=await saveCognitiveProfileArtifact(source.artifact,publicTemplatesForDatabase(tx))
 await approveCognitiveProfileEntryPolicies(tx,cognitiveProfilePolicyIdentity(source.config.id,source.artifact.identity.profile,saved.artifactHash),
    products,actorId,reason,{preservePause})
 await tx.assessmentManagementEvent.create({data:{id:requestId,actorId,resourceId:source.config.id,action:'COGNITIVE_PROFILE_APPROVED',
  metadata:{schemaVersion:1,requestIntentHash:intentHash,artifactHash:saved.artifactHash,configuration:saved.identity,
   artifactFormatVersion:source.artifact.schemaVersion,executionRequirements:{hasPresentation:source.artifact.execution?.presentation!=null,
    referenceCount:source.artifact.execution?.referenceDefinitions.length??0},allowedProducts:products,reason}}})
 return saved
}
type GitProfileReceipt={artifactHash:string;allowedProducts:StandardCombinationEntryProduct[];everSurvey:boolean}
async function reconcileGitCognitiveProfile(tx:Prisma.TransactionClient,actorId:string,configId:string,selected:CognitiveProfile,
 products:StandardCombinationEntryProduct[],gitCommitSha:string){
 await assertGitScalePublisher(tx,actorId)
 if(!/^[0-9a-f]{40}$/.test(gitCommitSha))throw new Error('Invalid Cognitive release Git commit')
 const source=await preparePublishedCognitiveProfile(tx,configId,selected)
 const identity=cognitiveProfilePolicyIdentity(configId,selected,source.artifactHash)
 await lockToolPolicyMutation(tx,[identity])
 const row=await tx.assessmentManagementEvent.findFirst({where:{actorId,resourceId:configId,action:'COGNITIVE_GIT_PROFILE_SYNCED'},
    orderBy:[{createdAt:'desc'},{id:'desc'}]})
 const prior=row?.metadata as GitProfileReceipt|undefined
 if(prior&&prior.artifactHash!==source.artifactHash)throw new Error('Installed Cognitive profile no longer matches its immutable Git approval')
 const current=await tx.$queryRaw<Array<{product:StandardCombinationEntryProduct;decision:string;reviewed_by:string;paused:boolean}>>`
  SELECT product,decision,reviewed_by,paused FROM survey_tool_policies WHERE resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint}`
 const manual=current.some(policy=>policy.reviewed_by!==actorId)
 const hadSurvey=Boolean(prior?.everSurvey)
 const outcome={artifact:source.artifact,hadSurvey}
 if(manual)return {...outcome,action:'MANUAL_HOLD' as const}
 const allowed=current.filter(policy=>policy.decision==='APPROVED').map(policy=>policy.product).sort()
 if(canonicalHash(allowed)===canonicalHash(products)&&prior)return {...outcome,action:'UNCHANGED' as const}
 const reason='Git main '+gitCommitSha
 if(products.length){
  if(!prior)await persistApprovedCognitiveProfile(tx,actorId,source,randomUUID(),
    canonicalHash({source:'SYSTEM_GIT_RELEASE',gitCommitSha,configId,selected,products}),products,reason,true)
  else await approveCognitiveProfileEntryPolicies(tx,identity,products,actorId,reason,{preservePause:true})
 }else if(current.length){
  await tx.$executeRaw`UPDATE survey_tool_policies SET decision='RETURNED',version=version+1,reason=${reason},
    updated_at=clock_timestamp() WHERE resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint}
    AND decision='APPROVED'`
 }
 await tx.assessmentManagementEvent.create({data:{id:randomUUID(),actorId,resourceId:configId,action:'COGNITIVE_GIT_PROFILE_SYNCED',
   metadata:{artifactHash:source.artifactHash,allowedProducts:products,everSurvey:hadSurvey||products.includes('SURVEY'),gitCommitSha}}})
 return {...outcome,action:products.length?(prior?.allowedProducts.length?'SCOPE_CHANGED':'ACTIVATED'):'WITHDRAWN'}
}
export function approveGitCognitiveProfile(tx:Prisma.TransactionClient,actorId:string,configId:string,selected:CognitiveProfile,
 rawProducts:unknown,gitCommitSha:string){
 return reconcileGitCognitiveProfile(tx,actorId,configId,selected,exactStandardCombinationEntryProducts(rawProducts),gitCommitSha)
}
export function stopGitCognitiveProfileAdmission(tx:Prisma.TransactionClient,actorId:string,configId:string,selected:CognitiveProfile,gitCommitSha:string){
 return reconcileGitCognitiveProfile(tx,actorId,configId,selected,[],gitCommitSha)
}
