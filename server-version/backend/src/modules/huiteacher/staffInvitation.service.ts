import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword } from '../../utils/password'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

export class HuiteacherInviteError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherInviteError'
  }
}
const fail=(code:string,statusCode=409):never=>{throw new HuiteacherInviteError(code,statusCode)}
const hash=(token:string)=>createHash('sha256').update('education-teacher-staff-invite:v1:'+token).digest('hex')
type Tx=Prisma.TransactionClient
async function authorizedInviter(tx:Tx,organizationId:string,userId:string){
  const scope=await resolveEducationProductMemberScope({
    organizationId,actorUserId:userId,product:'HUITEACHER',
  },tx)
  if(!scope?.productAdmin)fail('HUITEACHER_ADMIN_REQUIRED',403)
  return scope
}
export async function issueTeacherStaffInvitation(input:{
  organizationId:string;inviterUserId:string
}){
  const code=randomBytes(32).toString('base64url')
  const expiry=new Date(Date.now()+24*3600_000)
  const result=await prisma.$transaction(async tx=>{
    await authorizedInviter(tx,input.organizationId,input.inviterUserId)
    const inv=await tx.educationTeacherStaffInvitation.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      invitedByUserId:input.inviterUserId,tokenHash:hash(code),expiresAt:expiry,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.inviterUserId,action:'HUITEACHER_STAFF_INVITED',
      targetType:'TEACHER_STAFF_INVITATION',targetId:inv.id,
      domainEventId:randomUUID(),payload:{expiresAt:expiry.toISOString()}})
    return inv
  })
  // Return the bearer token only once; persistent records contain only hash.
  return {invitationId:result.id,inviteCode:code,expiresAt:expiry.toISOString()}
}

async function accept(tx:Tx,input:{
  inviteCode:string
  actorUserId?:string
  loginName?:string
  passwordHash?:string
}){
  const tokenHash=hash(input.inviteCode)
  const rows=await tx.$queryRaw<Array<{
    id:string;organizationId:string;invitedByUserId:string
  }>>`
    SELECT "id","organization_id" AS "organizationId",
      "invited_by_user_id" AS "invitedByUserId"
    FROM "education_teacher_staff_invitations"
    WHERE "token_hash"=${tokenHash} AND "consumed_at" IS NULL
      AND "expires_at">statement_timestamp()
    FOR UPDATE
  `
  const invite=rows[0]
  if(!invite)fail('HUITEACHER_INVITATION_UNAVAILABLE',404)
  await authorizedInviter(tx,invite.organizationId,invite.invitedByUserId)
  // In a dual-product school, only the shared school identity registrar may
  // create new staff membership. A Teacher admin cannot mint psychology-school
  // membership via a Teacher-only invite. Existing staff already reuse User ID
  // and school membership after the Teacher product is activated.
  const schoolEntitlement=await tx.educationProductEntitlement.findUnique({
    where:{organizationId_product:{
      organizationId:invite.organizationId,product:'HUISCHOOL',
    }},select:{status:true},
  })
  if(schoolEntitlement?.status==='ACTIVE')
    fail('HUITEACHER_SHARED_SCHOOL_ONBOARDING_REQUIRED',403)
  let userId=input.actorUserId
  if(userId){
    const user=await tx.user.findUnique({where:{id:userId},
      select:{id:true,role:true,accountDomain:true,teacherApproved:true,
        isActive:true,isFrozen:true,mustChangePassword:true,expiresAt:true}})
    if(!user||user.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(user.role)
      ||!user.teacherApproved||!user.isActive||user.isFrozen||user.mustChangePassword
      ||(user.expiresAt&&user.expiresAt<=new Date()))fail('HUITEACHER_INVITEE_INELIGIBLE',403)
  }else{
    if(!input.loginName||!input.passwordHash)fail('HUITEACHER_INVITATION_UNAVAILABLE',404)
    const normalized=input.loginName.trim().toLowerCase()
    // An already existing education account must use the authenticated join
    // endpoint. Never create a second User with different password.
    if(await tx.campusAccount.findUnique({where:{normalizedLogin:normalized},select:{userId:true}}))
      fail('HUITEACHER_EXISTING_ACCOUNT_JOIN_REQUIRED')
    const user=await tx.user.create({data:{
      username:'education_'+randomUUID().replace(/-/g,''),
      passwordHash:input.passwordHash,accountDomain:'SCHOOL',
      role:'TEACHER',teacherApproved:true,nickname:null,phone:null,
    }})
    await tx.campusAccount.create({data:{
      userId:user.id,loginName:input.loginName.trim(),normalizedLogin:normalized,
    }})
    userId=user.id
  }
  // One current membership per organization; existing members already get
  // ordinary Teacher product use when school entitlement is activated.
  const existing=await tx.organizationMembership.findFirst({where:{
    organizationId:invite.organizationId,userId,validUntil:null,
  },select:{id:true}})
  if(existing)fail('HUITEACHER_ALREADY_SCHOOL_MEMBER')
  const membershipId=randomUUID()
  await tx.organizationMembership.create({data:{
    id:membershipId,organizationId:invite.organizationId,userId:userId!,
    orgRole:'MEMBER',
  }})
  await tx.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:invite.organizationId,
    membershipId,persona:'TEACHER',grantedByUserId:invite.invitedByUserId,
  }})
  await tx.$executeRaw`
    UPDATE "education_teacher_staff_invitations"
    SET "consumed_at"=statement_timestamp(),"consumed_by_user_id"=${userId!}
    WHERE "id"=${invite.id} AND "consumed_at" IS NULL
  `
  await appendAudit(tx,{organizationId:invite.organizationId,actorUserId:invite.invitedByUserId,
    action:'HUITEACHER_STAFF_JOINED',targetType:'MEMBERSHIP',
    targetId:membershipId,domainEventId:randomUUID(),
    payload:{invitationId:invite.id,role:'MEMBER',persona:'TEACHER'}})
  return {organizationId:invite.organizationId,membershipId,userId}
}
export async function registerInvitedTeacher(input:{
  inviteCode:string;username:string;password:string
}){
  const passwordHash=await hashPassword(input.password)
  try {
    return await prisma.$transaction(tx=>accept(tx,{
      inviteCode:input.inviteCode,loginName:input.username,passwordHash,
    }))
  }catch(e:any){
    if(e instanceof HuiteacherInviteError)throw e
    if(e?.code==='P2002'||e?.meta?.code==='23505')fail('HUITEACHER_ACCOUNT_OR_INVITE_CONFLICT')
    throw e
  }
}
export async function joinInvitedTeacher(input:{
  inviteCode:string;actorUserId:string
}){
  try{
    return await prisma.$transaction(tx=>accept(tx,input))
  }catch(e:any){
    if(e instanceof HuiteacherInviteError)throw e
    if(e?.code==='P2002'||e?.meta?.code==='23505')fail('HUITEACHER_MEMBERSHIP_CONFLICT')
    throw e
  }
}
