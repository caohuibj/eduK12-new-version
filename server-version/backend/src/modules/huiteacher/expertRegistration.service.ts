import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {hashPassword} from '../../utils/password'
import {appendAudit} from '../organization/service'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
type Tx=Prisma.TransactionClient
export class HuiteacherExpertError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherExpertError'
  }
}
const deny=(code:string,status=409):never=>{throw new HuiteacherExpertError(code,status)}
const codeHash=(value:string)=>createHash('sha256')
  .update('huiteacher-event-expert-registration:v1:'+value).digest('hex')
async function activeManager(tx:Tx,organizationId:string,userId:string){
  const scope=await resolveEducationProductMemberScope({
    organizationId,actorUserId:userId,product:'HUITEACHER',
  },tx)
  if(!scope?.productAdmin)deny('HUITEACHER_EXPERT_INVITE_MANAGER_REQUIRED',403)
}
export async function issueHuiteacherExternalExpertInvite(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  const raw=randomBytes(32).toString('base64url')
  const expiresAt=new Date(Date.now()+30*86400000)
  return prisma.$transaction(async tx=>{
    await activeManager(tx,input.organizationId,input.actorUserId)
    const events=await tx.$queryRaw<Array<{kind:string;status:string}>>`
      SELECT "kind","status" FROM "huiteacher_evaluation_events"
      WHERE "organization_id"=${input.organizationId} AND "id"=${input.eventId}
      FOR SHARE
    `
    if(!events[0]||!['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT']
      .includes(events[0].kind)||!['DRAFT','OPEN'].includes(events[0].status))
      deny('HUITEACHER_EXPERT_INVITE_EVENT_NOT_AVAILABLE',403)
    const created=await tx.huiteacherExternalExpertInvite.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      eventId:input.eventId,tokenHash:codeHash(raw),
      issuedByUserId:input.actorUserId,expiresAt,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_EXPERT_REGISTRATION_INVITED',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),payload:{invitationId:created.id,
        expiresAt:expiresAt.toISOString()},
    })
    return {invitationId:created.id,inviteCode:raw,expiresAt}
  })
}
async function claim(tx:Tx,input:{
  inviteCode:string;existingUserId?:string;
  loginName?:string;passwordHash?:string
}){
  const invite=await tx.$queryRaw<Array<{
    id:string;organizationId:string;eventId:string;
    issuedByUserId:string;expiresAt:Date
  }>>`
    SELECT "id","organization_id" AS "organizationId",
      "event_id" AS "eventId","issued_by_user_id" AS "issuedByUserId",
      "expires_at" AS "expiresAt"
    FROM "huiteacher_external_expert_invites"
    WHERE "token_hash"=${codeHash(input.inviteCode)}
      AND "consumed_at" IS NULL AND "revoked_at" IS NULL
      AND "expires_at">statement_timestamp()
    FOR UPDATE
  `
  const row=invite[0]
  if(!row)deny('HUITEACHER_EXPERT_INVITE_UNAVAILABLE',404)
  await activeManager(tx,row.organizationId,row.issuedByUserId)
  const valid=await tx.$queryRaw<Array<{id:string}>>`
    SELECT event."id" FROM "huiteacher_evaluation_events" event
    JOIN "organizations" org ON org."id"=event."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=event."organization_id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    WHERE event."organization_id"=${row.organizationId}
      AND event."id"=${row.eventId}
      AND event."status" IN ('DRAFT','OPEN')
      AND event."kind" IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
    FOR SHARE OF event
  `
  if(!valid.length)deny('HUITEACHER_EXPERT_EVENT_NO_LONGER_ACCEPTING',403)
  let userId=input.existingUserId
  if(userId){
    const user=await tx.user.findUnique({where:{id:userId},select:{
      accountDomain:true,role:true,isActive:true,isFrozen:true,
      mustChangePassword:true,expiresAt:true,teacherApproved:true,
    }})
    if(!user||user.accountDomain!=='SCHOOL'
      ||!['TEACHER','ADMIN'].includes(user.role)
      ||!user.teacherApproved||!user.isActive||user.isFrozen
      ||user.mustChangePassword||(user.expiresAt&&user.expiresAt<=new Date()))
      deny('HUITEACHER_EXPERT_EXISTING_ACCOUNT_INELIGIBLE',403)
  }else{
    if(!input.loginName||!input.passwordHash)
      deny('HUITEACHER_EXPERT_NEW_ACCOUNT_INPUT_INVALID',400)
    const login=input.loginName.trim(),normalized=login.toLowerCase()
    if(await tx.campusAccount.findUnique({where:{normalizedLogin:normalized},
      select:{userId:true}}))
      deny('HUITEACHER_EXPERT_EXISTING_ACCOUNT_USE_LOGIN',409)
    const user=await tx.user.create({data:{
      username:'education_'+randomUUID().replace(/-/g,''),
      passwordHash:input.passwordHash,role:'TEACHER',accountDomain:'SCHOOL',
      platformRole:'STANDARD',teacherApproved:true,
      nickname:null,phone:null,
    }})
    userId=user.id
    await tx.campusAccount.create({data:{
      userId:user.id,loginName:login,normalizedLogin:normalized,
    }})
  }
  const previous=await tx.huiteacherObserverGrant.findUnique({
    where:{organizationId_eventId_observerUserId:{
      organizationId:row.organizationId,eventId:row.eventId,observerUserId:userId!,
    }},
  })
  if(previous?.status==='ACCEPTED'&&previous.expiresAt>new Date())
    deny('HUITEACHER_EXPERT_ALREADY_ASSIGNED')
  const grant=previous
    ?await tx.huiteacherObserverGrant.update({where:{id:previous.id},data:{
      role:'EXPERT',status:'ACCEPTED',revokedAt:null,acceptedAt:new Date(),
      expiresAt:row.expiresAt,invitedByUserId:row.issuedByUserId,
      revision:{increment:1},
    }})
    :await tx.huiteacherObserverGrant.create({data:{
      id:randomUUID(),organizationId:row.organizationId,eventId:row.eventId,
      observerUserId:userId!,role:'EXPERT',status:'ACCEPTED',
      acceptedAt:new Date(),expiresAt:row.expiresAt,
      invitedByUserId:row.issuedByUserId,
    }})
  const used=await tx.huiteacherExternalExpertInvite.updateMany({where:{
    id:row.id,consumedAt:null,revokedAt:null,expiresAt:{gt:new Date()},
  },data:{consumedAt:new Date(),consumedByUserId:userId}})
  if(used.count!==1)deny('HUITEACHER_EXPERT_INVITATION_ALREADY_USED')
  await appendAudit(tx,{organizationId:row.organizationId,
    actorUserId:row.issuedByUserId,action:'HUITEACHER_EXPERT_JOINED_FIELD_EVENT',
    targetType:'EVALUATION_EVENT',targetId:row.eventId,
    domainEventId:randomUUID(),payload:{invitationId:row.id,grantId:grant.id},
  })
  return {organizationId:row.organizationId,eventId:row.eventId,
    userId,observerGrantId:grant.id,role:'EXPERT' as const,
    // No School Membership, psychology Persona or additional product access.
    schoolMemberCreated:false}
}
export async function registerHuiteacherExternalExpert(input:{
  inviteCode:string;username:string;password:string
}){
  const hashed=await hashPassword(input.password)
  return prisma.$transaction(tx=>claim(tx,{
    inviteCode:input.inviteCode,loginName:input.username,passwordHash:hashed,
  }))
}
export async function joinHuiteacherExternalExpert(input:{
  inviteCode:string;userId:string
}){
  return prisma.$transaction(tx=>claim(tx,{
    inviteCode:input.inviteCode,existingUserId:input.userId,
  }))
}
