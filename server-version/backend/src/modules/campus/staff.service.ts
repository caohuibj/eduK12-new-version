import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword } from '../../utils/password'
import { appendAudit } from '../organization/service'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { AuthenticatedPrincipal } from '../../types'
import { CampusAdmissionError, assertCampusGovernance } from './admission.service'

const digest=(value:string)=>createHash('sha256').update('school-staff-invite:v1:'+value).digest('hex')
const fail=(code:string,statusCode=409):never=>{throw new CampusAdmissionError(code,statusCode)}
const normalizedLogin=(raw:string)=>{
  const name=raw.trim().toLowerCase()
  if(!/^[a-z0-9_.-]{4,32}$/.test(name))fail('STAFF_LOGIN_INVALID',400)
  return name
}

/** Staff invitations are scoped to SCHOOL, and do not attach existing users. */
export async function createCampusStaffInvitation(input:{
  actor:AuthenticatedPrincipal;organizationId:string
  persona:'TEACHER'|'COUNSELOR';adminRole:boolean;psychologyStaff:boolean
}) {
  await assertCampusGovernance(input.actor,input.organizationId)
  if(input.psychologyStaff && input.persona!=='COUNSELOR')fail('STAFF_INVITE_ROLE_COMBINATION',400)
  const code=randomBytes(24).toString('base64url')
  const expiresAt=new Date(Date.now()+24*60*60*1000)
  const result=await prisma.$transaction(async tx=>{
    const org=await resolveOrganizationAccessContext({principal:input.actor,organizationId:input.organizationId},tx)
    if(!org?.canGovern||org.productDomain!=='SCHOOL')fail('CAMPUS_GOVERNANCE_REQUIRED',403)
    const invitation=await tx.campusStaffInvitation.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      tokenHash:digest(code),persona:input.persona,
      adminRole:input.adminRole,psychologyStaff:input.psychologyStaff,
      invitedByUserId:input.actor.userId,expiresAt,
    }})
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_STAFF_INVITED',targetType:'STAFF_INVITATION',targetId:invitation.id,
      domainEventId:randomUUID(),payload:{
        persona:input.persona,adminRole:input.adminRole,psychologyStaff:input.psychologyStaff,
      },
    })
    return invitation
  })
  return {invitationId:result.id,inviteCode:code,expiresAt:expiresAt.toISOString()}
}

export async function registerCampusStaff(input:{
  inviteCode:string;username:string;password:string
}){
  const normalized=normalizedLogin(input.username)
  if(input.inviteCode.length<28||input.inviteCode.length>64)fail('CAMPUS_INVITE_UNAVAILABLE',404)
  const passwordHash=await hashPassword(input.password)
  try {
    return await prisma.$transaction(async tx=>{
      const invitations=await tx.$queryRaw<Array<{
        id:string;organizationId:string;persona:'TEACHER'|'COUNSELOR'
        adminRole:boolean;psychologyStaff:boolean;invitedByUserId:string
      }>>`
        SELECT i."id",i."organization_id" AS "organizationId",i."persona",
          i."admin_role" AS "adminRole",i."psychology_staff" AS "psychologyStaff",
          i."invited_by_user_id" AS "invitedByUserId"
        FROM "campus_staff_invitations" i
        JOIN "organizations" o ON o."id"=i."organization_id" AND o."product_domain"='SCHOOL'
          AND o."status"='ACTIVE'
        WHERE i."token_hash"=${digest(input.inviteCode)}
          AND i."consumed_at" IS NULL AND i."expires_at">statement_timestamp()
        FOR UPDATE OF i
      `
      const invitation=invitations[0]
      if(!invitation)fail('CAMPUS_INVITE_UNAVAILABLE',404)
      // An invitation issued by an already-revoked administrator cannot be
      // converted into a future school account by the possessor of its token.
      const issuer=await tx.$queryRaw<Array<{valid:boolean}>>`
        SELECT EXISTS(
          SELECT 1 FROM "organization_memberships" m
          JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
            AND u."is_active"=TRUE AND u."is_frozen"=FALSE
          WHERE m."organization_id"=${invitation.organizationId}
            AND m."user_id"=${invitation.invitedByUserId}
            AND m."org_role"='ORG_ADMIN'
            AND m."valid_from"<=statement_timestamp()
            AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
        ) AS "valid"
      `
      if(!issuer[0]?.valid)fail('CAMPUS_INVITE_UNAVAILABLE',404)
      const user=await tx.user.create({data:{
        username:'huischool_'+randomUUID().replace(/-/g,''),
        passwordHash,accountDomain:'SCHOOL',
        role:invitation.adminRole?UserRole.ADMIN:UserRole.TEACHER,
        teacherApproved:true,nickname:null,phone:null,
      }})
      await tx.campusAccount.create({data:{
        userId:user.id,loginName:input.username.trim(),normalizedLogin:normalized,
      }})
      const membership=await tx.organizationMembership.create({data:{
        id:randomUUID(),organizationId:invitation.organizationId,userId:user.id,
        orgRole:invitation.adminRole?'ORG_ADMIN':'MEMBER',
      }})
      await tx.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:invitation.organizationId,
        membershipId:membership.id,persona:invitation.persona,
        grantedByUserId:invitation.invitedByUserId,
      }})
      if(invitation.psychologyStaff) {
        await tx.organizationCapabilityGrant.create({data:{
          id:randomUUID(),organizationId:invitation.organizationId,
          membershipId:membership.id,capability:'PSYCHOLOGY_STAFF',
          grantedByUserId:invitation.invitedByUserId,
        }})
      }
      await tx.$executeRaw`
        UPDATE "campus_staff_invitations" SET "consumed_at"=statement_timestamp(),
          "consumed_by_user_id"=${user.id} WHERE "id"=${invitation.id}
      `
      await appendAudit(tx,{
        organizationId:invitation.organizationId,actorUserId:invitation.invitedByUserId,
        action:'CAMPUS_STAFF_JOINED',targetType:'MEMBERSHIP',targetId:membership.id,
        domainEventId:randomUUID(),payload:{
          persona:invitation.persona,psychologyStaff:invitation.psychologyStaff,
          adminRole:invitation.adminRole,
        },
      })
      return {status:'REGISTERED' as const,username:input.username.trim()}
    })
  }catch(e:any){
    if(e instanceof CampusAdmissionError)throw e
    if(e?.code==='P2002'||e?.meta?.code==='23505')fail('CAMPUS_INVITE_UNAVAILABLE',404)
    throw e
  }
}
