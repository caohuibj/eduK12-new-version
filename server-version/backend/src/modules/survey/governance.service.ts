import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertCurrentSystemAdmin } from '../../services/accountAuthorityService'
import { comparePassword, hashPassword } from '../../utils/password'
import { withLoginPasswordVerification } from '../../middleware/loginRateLimit'
import { beginSurveyMfaChallenge } from './mfa.service'
import type { Request, Response } from 'express'

export class SurveyGovernanceError extends Error {
  constructor(public readonly statusCode:number, message:string){super(message)}
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const randomSecret=()=>randomBytes(32).toString('base64url')
type Tx=Prisma.TransactionClient
export async function authorizeAdmin(actorId:string,password:string) {
  const passed=await withLoginPasswordVerification(async()=>{
    const a=await prisma.user.findUnique({where:{id:actorId}})
    return !!a && a.isActive && !a.isFrozen && a.platformRole==='SYSTEM_ADMIN'
      && await comparePassword(password,a.passwordHash)
  })
  if(!passed)throw new SurveyGovernanceError(403,'需要系统管理员当前密码重新验证')
}
async function event(tx:Tx, actor:string|null, action:string, target:string|null, metadata:object={}) {
  await tx.surveyEvent.create({data:{
    id:randomUUID(),actorUserId:actor,targetUserId:target,action,metadata,
  }})
}
async function invite(actorId:string,kind:'INVITE'|'PASSWORD_RESET',targetId:string|null) {
  const value=randomSecret(),id=randomUUID()
  await prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,actorId)
    if(targetId){
      const user=await tx.user.findFirst({where:{id:targetId,accountDomain:'SURVEY'},select:{id:true}})
      if(!user)throw new SurveyGovernanceError(404,'研究者不存在')
    }
    await tx.surveyInvitation.create({data:{
      id,kind,tokenHash:digest(value),createdBy:actorId,targetUserId:targetId,
      expiresAt:new Date(Date.now()+7*24*3600*1000),
    }})
    await event(tx,actorId,kind==='INVITE'?'RESEARCHER_INVITED':'RESEARCHER_RESET_INVITED',targetId,{invitationId:id})
  })
  return {id,token:value,expiresInDays:7,kind}
}
export const inviteResearcher=(actorId:string)=>invite(actorId,'INVITE',null)
export const invitePasswordReset=(actorId:string,targetId:string)=>invite(actorId,'PASSWORD_RESET',targetId)

export async function redeemResearcherInvite(req:Request,res:Response,raw:string,loginName:string,password:string) {
  const normalized=loginName.trim().toLowerCase()
  const passwordHash=await hashPassword(password)
  const user=await prisma.$transaction(async tx=>{
    const [inv]=await tx.$queryRaw<Array<{id:string;createdBy:string}>>`
      SELECT "id","created_by" AS "createdBy" FROM "survey_invitations"
      WHERE "token_hash"=${digest(raw)} AND "kind"='INVITE'
        AND "expires_at">statement_timestamp() AND "claimed_at" IS NULL AND "revoked_at" IS NULL
      FOR UPDATE
    `
    if(!inv)throw new SurveyGovernanceError(403,'邀请无效或已使用')
    const username='survey_'+randomUUID().replace(/-/g,'')
    const u=await tx.user.create({data:{
      username,passwordHash,role:'STUDENT',accountDomain:'SURVEY',
      platformRole:'STANDARD',teacherApproved:true,mustChangePassword:false,
    }})
    await tx.surveyAccount.create({data:{userId:u.id,loginName,normalizedLogin:normalized}})
    await tx.surveyResearcherGrant.create({data:{userId:u.id,grantedBy:inv.createdBy,status:'PENDING_MFA'}})
    await tx.surveyInvitation.update({where:{id:inv.id},data:{claimedAt:new Date(),claimedUserId:u.id}})
    await event(tx,u.id,'RESEARCHER_INVITE_CLAIMED',u.id,{invitationId:inv.id})
    return u
  })
  // Claim is durable; an interrupted response can continue at the normal login endpoint.
  await beginSurveyMfaChallenge(req,res,user.id,user.tokenVersion)
  return {mfaRequired:true,enrolled:false,loginName}
}
export async function redeemPasswordReset(req:Request,res:Response,raw:string,password:string){
  const passwordHash=await hashPassword(password)
  const user=await prisma.$transaction(async tx=>{
    const [inv]=await tx.$queryRaw<Array<{id:string;userId:string}>>`
      SELECT "id","target_user_id" AS "userId" FROM "survey_invitations"
      WHERE "token_hash"=${digest(raw)} AND "kind"='PASSWORD_RESET'
        AND "expires_at">statement_timestamp() AND "claimed_at" IS NULL AND "revoked_at" IS NULL
      FOR UPDATE
    `
    if(!inv)throw new SurveyGovernanceError(403,'恢复邀请无效或已使用')
    const current=await tx.user.findFirst({where:{id:inv.userId,accountDomain:'SURVEY'}})
    if(!current||!current.isActive||current.isFrozen)throw new SurveyGovernanceError(403,'研究者资格不可恢复')
    const changed=await tx.user.update({where:{id:current.id},data:{
      passwordHash,tokenVersion:{increment:1},mustChangePassword:false,
    }})
    await tx.surveyMfaCredential.deleteMany({where:{userId:changed.id}})
    await tx.surveyMfaRecoveryCode.deleteMany({where:{userId:changed.id}})
    await tx.surveyMfaChallenge.deleteMany({where:{userId:changed.id}})
    await tx.surveyResearcherGrant.update({where:{userId:changed.id},data:{status:'PENDING_MFA',updatedAt:new Date()}})
    await tx.surveyInvitation.update({where:{id:inv.id},data:{claimedAt:new Date(),claimedUserId:changed.id}})
    await event(tx,changed.id,'RESEARCHER_PASSWORD_RESET_CLAIMED',changed.id,{invitationId:inv.id})
    return changed
  })
  await beginSurveyMfaChallenge(req,res,user.id,user.tokenVersion)
  return {mfaRequired:true,enrolled:false}
}
export async function researcherList(actorId:string,page:number) {
  await assertCurrentSystemAdmin(prisma,actorId)
  const skip=(page-1)*25
  const rows=await prisma.surveyAccount.findMany({orderBy:{createdAt:'desc'},skip,take:25})
  const grants=await prisma.surveyResearcherGrant.findMany({where:{userId:{in:rows.map(x=>x.userId)}}})
  return {page,pageSize:25,list:rows.map(account=>({
    id:account.userId,username:account.loginName,
    status:grants.find(x=>x.userId===account.userId)?.status||'UNAVAILABLE',
    createdAt:account.createdAt,
  }))}
}
export async function revokeInvite(actorId:string,inviteId:string){
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,actorId)
    const changed=await tx.surveyInvitation.updateMany({where:{id:inviteId,claimedAt:null,revokedAt:null},data:{revokedAt:new Date()}})
    if(changed.count!==1)throw new SurveyGovernanceError(404,'邀请不可撤销')
    await event(tx,actorId,'RESEARCHER_INVITE_REVOKED',null,{invitationId:inviteId})
    return {revoked:true}
  })
}
export async function updateResearcherStatus(actorId:string,targetId:string,status:'SUSPENDED'|'ACTIVE') {
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,actorId)
    const account=await tx.surveyAccount.findUnique({where:{userId:targetId}})
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
    if(!account||!grant||!['ACTIVE','SUSPENDED'].includes(grant.status))throw new SurveyGovernanceError(404,'研究者不可更改')
    if(status==='ACTIVE'){
      const mfa=await tx.surveyMfaCredential.findUnique({where:{userId:targetId}})
      if(!mfa?.enabled)throw new SurveyGovernanceError(409,'研究者尚未绑定双因素认证')
    }
    await tx.surveyResearcherGrant.update({where:{userId:targetId},data:{status,updatedAt:new Date()}})
    await tx.user.update({where:{id:targetId},data:{tokenVersion:{increment:1}}})
    await event(tx,actorId,status==='ACTIVE'?'RESEARCHER_RESTORED':'RESEARCHER_SUSPENDED',targetId)
    return {id:targetId,status}
  })
}
export async function resetResearcherMfa(actorId:string,targetId:string){
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,actorId)
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
    if(!grant||grant.status==='REVOKED')throw new SurveyGovernanceError(404,'研究者不存在')
    await tx.surveyMfaChallenge.deleteMany({where:{userId:targetId}})
    await tx.surveyMfaRecoveryCode.deleteMany({where:{userId:targetId}})
    await tx.surveyMfaCredential.deleteMany({where:{userId:targetId}})
    await tx.surveyResearcherGrant.update({where:{userId:targetId},data:{status:'PENDING_MFA',updatedAt:new Date()}})
    await tx.user.update({where:{id:targetId},data:{tokenVersion:{increment:1}}})
    await event(tx,actorId,'RESEARCHER_MFA_RESET',targetId)
    return {id:targetId,mfaRequired:true}
  })
}
