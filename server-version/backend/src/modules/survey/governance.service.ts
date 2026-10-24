import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {assertSurveyManager} from './admin-role'
import { comparePassword, hashPassword } from '../../utils/password'
import { withLoginPasswordVerification } from '../../middleware/loginRateLimit'
import { cacheService } from '../../services/cacheService'
import { beginSurveyMfaChallenge } from './mfa.service'
import type { Request, Response } from 'express'

export class SurveyGovernanceError extends Error {
  constructor(public readonly statusCode:number, message:string, public readonly retryAfterSeconds?:number){super(message)}
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const randomSecret=()=>randomBytes(32).toString('base64url')
type Tx=Prisma.TransactionClient
export async function authorizeAdmin(actorId:string,password:string) {
  await withLoginPasswordVerification(async()=>{
    const a=await prisma.user.findUnique({where:{id:actorId}})
    if(!a || !a.isActive || a.isFrozen || !['LEGACY','TRAINING'].includes(a.accountDomain))
      throw new SurveyGovernanceError(403,'需要系统管理员当前密码重新验证')
    await assertSurveyManager(prisma,actorId)
    const protectedMode=process.env.NODE_ENV!=='development' && process.env.NODE_ENV!=='test'
    const failureKey='auth:survey:admin-password:'+digest(actorId)
    // Check inside the existing bcrypt admission, not before its queue. Only
    // already-admitted verifications may finish across the failure threshold.
    if(protectedMode){
      const state=await cacheService.getRateLimitState(failureKey)
      if(!state)throw new SurveyGovernanceError(503,'密码验证暂不可用，请稍后重试')
      if(state.count>=15)throw new SurveyGovernanceError(429,'当前密码错误次数过多，请稍后重试',Math.max(1,state.retryAfterSeconds))
    }
    if(await comparePassword(password,a.passwordHash))return
    if(protectedMode){
      const budget=await cacheService.consumeRateLimit(failureKey,15,900)
      if(!budget)throw new SurveyGovernanceError(503,'密码验证暂不可用，请稍后重试')
      if(!budget.allowed)throw new SurveyGovernanceError(429,'当前密码错误次数过多，请稍后重试',Math.max(1,budget.retryAfterSeconds))
    }
    // Correct passwords never consume or clear this fixed failure window.
    // Keeping its TTL avoids a concurrent success erasing a newer failure.
    throw new SurveyGovernanceError(403,'需要系统管理员当前密码重新验证')
  })
}
async function event(tx:Tx, actor:string|null, action:string, target:string|null, metadata:object={}) {
  await tx.surveyEvent.create({data:{
    id:randomUUID(),actorUserId:actor,targetUserId:target,action,metadata,
  }})
}
async function invite(actorId:string,kind:'INVITE'|'PASSWORD_RESET',targetId:string|null) {
  const value=randomSecret(),id=randomUUID()
  await prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorId)
    if(targetId){
      const user=await tx.user.findFirst({where:{id:targetId,accountDomain:'SURVEY'},select:{id:true}})
      const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
      if(!user||!grant||!['ACTIVE','PENDING_MFA'].includes(grant.status))throw new SurveyGovernanceError(404,'研究者不可签发恢复邀请')
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
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:inv.userId}})
    if(!current||!current.isActive||current.isFrozen||!['ACTIVE','PENDING_MFA'].includes(grant?.status||''))
      throw new SurveyGovernanceError(403,'研究者资格不可恢复')
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
  await assertSurveyManager(prisma,actorId)
  const skip=(page-1)*25
  const rows=await prisma.surveyAccount.findMany({orderBy:{createdAt:'desc'},skip,take:25})
  const grants=await prisma.surveyResearcherGrant.findMany({where:{userId:{in:rows.map(x=>x.userId)}}})
  return {page,pageSize:25,list:rows.map(account=>({
    id:account.userId,username:account.loginName,
    status:grants.find(x=>x.userId===account.userId)?.status||'UNAVAILABLE',
    createdAt:account.createdAt,
  }))}
}
/** The administrator may list and revoke unclaimed invitations, never read
 * their bearer token, password or the Researcher raw research data. */
export async function unclaimedResearcherInvitations(actorId:string,page:number){
  await assertSurveyManager(prisma,actorId)
  const invitations=await prisma.surveyInvitation.findMany({
    where:{kind:'INVITE',claimedAt:null,revokedAt:null},
    orderBy:[{createdAt:'desc'},{id:'desc'}],
    skip:(page-1)*25,take:25,
    select:{id:true,kind:true,createdBy:true,createdAt:true,expiresAt:true},
  })
  const now=new Date()
  return {page,pageSize:25,list:invitations.map(row=>({
    ...row,status:row.expiresAt<=now?'EXPIRED':'PENDING',
  }))}
}
export async function revokeInvite(actorId:string,inviteId:string){
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorId)
    const changed=await tx.surveyInvitation.updateMany({where:{id:inviteId,kind:'INVITE',claimedAt:null,revokedAt:null},data:{revokedAt:new Date()}})
    if(changed.count!==1)throw new SurveyGovernanceError(404,'邀请不可撤销')
    await event(tx,actorId,'RESEARCHER_INVITE_REVOKED',null,{invitationId:inviteId})
    return {revoked:true}
  })
}
export async function updateResearcherStatus(actorId:string,targetId:string,status:'SUSPENDED'|'ACTIVE') {
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorId)
    const account=await tx.surveyAccount.findUnique({where:{userId:targetId}})
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
    if(!account||!grant||!['ACTIVE','PENDING_MFA','SUSPENDED'].includes(grant.status))
      throw new SurveyGovernanceError(404,'研究者不可更改')
    if(status==='SUSPENDED'&&grant.status==='SUSPENDED')
      throw new SurveyGovernanceError(409,'研究者已经暂停')
    if(status==='ACTIVE'&&grant.status!=='SUSPENDED')
      throw new SurveyGovernanceError(409,'研究者尚未暂停')
    let nextStatus:'ACTIVE'|'PENDING_MFA'|'SUSPENDED'=status
    if(status==='ACTIVE'){
      const mfa=await tx.surveyMfaCredential.findUnique({where:{userId:targetId}})
      nextStatus=mfa?.enabled?'ACTIVE':'PENDING_MFA'
    }
    await tx.surveyResearcherGrant.update({where:{userId:targetId},data:{status:nextStatus,updatedAt:new Date()}})
    await tx.user.update({where:{id:targetId},data:{tokenVersion:{increment:1}}})
    await event(tx,actorId,status==='ACTIVE'?'RESEARCHER_RESTORED':'RESEARCHER_SUSPENDED',targetId)
    return {id:targetId,status:nextStatus}
  })
}
/** Irreversible researcher entitlement revoke; no restore path accepts REVOKED.
 * Retain projects, completed FINALs and auditable history unchanged.
 */
export async function revokeResearcherPermanently(actorId:string,targetId:string){
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorId)
    const account=await tx.surveyAccount.findUnique({where:{userId:targetId}})
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
    if(!account||!grant||grant.status==='REVOKED')
      throw new SurveyGovernanceError(404,'研究者不存在或已永久撤销')
    await tx.surveyResearcherGrant.update({
      where:{userId:targetId},data:{status:'REVOKED',updatedAt:new Date()},
    })
    // Invalidate every existing Survey session and pending MFA challenge.
    await tx.user.update({where:{id:targetId},data:{tokenVersion:{increment:1}}})
    await tx.surveyMfaChallenge.deleteMany({where:{userId:targetId}})
    await tx.surveyInvitation.updateMany({
      where:{targetUserId:targetId,claimedAt:null,revokedAt:null},
      data:{revokedAt:new Date()},
    })
    await event(tx,actorId,'RESEARCHER_PERMANENTLY_REVOKED',targetId)
    return {id:targetId,status:'REVOKED' as const}
  })
}
export async function resetResearcherMfa(actorId:string,targetId:string){
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorId)
    const grant=await tx.surveyResearcherGrant.findUnique({where:{userId:targetId}})
    if(!grant||!['ACTIVE','PENDING_MFA'].includes(grant.status))
      throw new SurveyGovernanceError(409,'已暂停或撤销的研究者不能通过重置双因素认证获得新资格')
    await tx.surveyMfaChallenge.deleteMany({where:{userId:targetId}})
    await tx.surveyMfaRecoveryCode.deleteMany({where:{userId:targetId}})
    await tx.surveyMfaCredential.deleteMany({where:{userId:targetId}})
    await tx.surveyResearcherGrant.update({where:{userId:targetId},data:{status:'PENDING_MFA',updatedAt:new Date()}})
    await tx.user.update({where:{id:targetId},data:{tokenVersion:{increment:1}}})
    await event(tx,actorId,'RESEARCHER_MFA_RESET',targetId)
    return {id:targetId,mfaRequired:true}
  })
}
