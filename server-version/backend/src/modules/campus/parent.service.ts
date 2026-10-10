import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword, isValidPassword } from '../../utils/password'
import type { AuthenticatedPrincipal } from '../../types'
import { parentPortalService } from '../parent-portal/service'
import { hashParentInviteCode } from '../assessment-identity/identity'
import { LINK_CONSENT_TEXT, LINK_CONSENT_VERSION } from '../parent-portal/contracts'
import { canonicalHash } from '../assessment-runtime/canonical'
import { appendAudit } from '../organization/service'
import { CampusAdmissionError } from './admission.service'

type Tx=Prisma.TransactionClient
const refuse=(code='CAMPUS_PARENT_LINK_UNAVAILABLE',status=404):never=>{
  throw new CampusAdmissionError(code,status)
}
const childEligibleSql=(org:string,student:string)=>Prisma.sql`
  SELECT 1 FROM "campus_student_enrollments" e
  JOIN "campus_class_admissions" ca
    ON ca."organization_id"=e."organization_id"
    AND ca."class_unit_id"=e."class_unit_id" AND ca."status"='APPROVED'
  JOIN "organization_memberships" m
    ON m."user_id"=e."user_id" AND m."organization_id"=e."organization_id"
    AND m."valid_from"<=statement_timestamp()
    AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
  JOIN "organization_persona_grants" pg
    ON pg."organization_id"=m."organization_id"
    AND pg."membership_id"=m."id" AND pg."persona"='STUDENT'
    AND pg."revoked_at" IS NULL
  JOIN "organizations" o ON o."id"=e."organization_id"
    AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
  JOIN "users" u ON u."id"=e."user_id" AND u."role"='STUDENT'
    AND u."account_domain"='SCHOOL'
    AND u."is_active"=TRUE AND u."is_frozen"=FALSE
  WHERE e."organization_id"=${org} AND e."user_id"=${student}
    AND e."status"='APPROVED'
    AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
      WHERE d."organization_id"=e."organization_id" AND d."user_id"=e."user_id"
        AND d."lifted_at" IS NULL AND d."permission" IN ('*','PARENT_LINK'))
  LIMIT 1
`
async function assertCurrentChild(tx:Tx,org:string,student:string){
  const rows=await tx.$queryRaw<Array<{one:number}>>(Prisma.sql`
    SELECT 1 AS "one" WHERE EXISTS(${childEligibleSql(org,student)})`)
  if(!rows.length)refuse()
}
export const campusParentConsent=()=>({version:LINK_CONSENT_VERSION,text:LINK_CONSENT_TEXT,
  reminder:'确认亲子身份不代表向家长自动公开个人心理报告；报告另行审核授权。'})

/** PR1-approved student is the only one who can originate a link invitation.
 * Existing Parent Portal still signs random 15-minute invitations.
 */
export async function createCampusParentInvitation(actor:AuthenticatedPrincipal,organizationId:string){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')refuse('CAMPUS_STUDENT_REQUIRED',403)
  await prisma.$transaction(tx=>assertCurrentChild(tx,organizationId,actor.userId))
  return parentPortalService.invitations(actor,{organizationId})
}

/** Atomic one-time claim + SCHOOL account creation. No membership or report
 * capability is granted to the parent; PENDING remains inert until student
 * approval. Existing legacy parents must create a separate school identity.
 */
export async function registerCampusParent(input:{
  inviteCode:string;username:string;password:string;guardianAcknowledged:boolean
}){
  const name=input.username.trim(),normalized=name.toLowerCase()
  if(!/^[a-z0-9_.-]{4,32}$/.test(normalized)
    ||!isValidPassword(input.password)||!input.guardianAcknowledged
    ||!/^[A-Za-z0-9_-]{24}$/.test(input.inviteCode))refuse('CAMPUS_PARENT_INPUT_INVALID',400)
  const passwordHash=await hashPassword(input.password)
  try{
    return await prisma.$transaction(async tx=>{
      const hash=hashParentInviteCode(input.inviteCode)
      const invites=await tx.$queryRaw<Array<{
        id:string;studentUserId:string;organizationId:string|null;status:string
      }>>`
        SELECT "id","student_user_id" AS "studentUserId",
          "organization_id" AS "organizationId","status"
        FROM "parent_invite_codes"
        WHERE "code_hash"=${hash} AND "status"='ACTIVE'
          AND "expires_at">statement_timestamp()
          AND "course_id" IS NULL AND "organization_id" IS NOT NULL
        FOR UPDATE
      `
      const invite=invites[0]
      if(!invite?.organizationId)refuse()
      await assertCurrentChild(tx,invite.organizationId,invite.studentUserId)
      const child=await tx.user.findUnique({where:{id:invite.studentUserId}})
      if(!child||child.accountDomain!=='SCHOOL')refuse()
      const user=await tx.user.create({data:{
        username:'huischool_'+randomUUID().replace(/-/g,''),
        passwordHash,accountDomain:'SCHOOL',role:'PARENT',
        nickname:null,phone:null,teacherApproved:true,
      }})
      await tx.campusAccount.create({data:{
        userId:user.id,loginName:name,normalizedLogin:normalized,
      }})
      const relation=await tx.parentStudentRelationship.create({data:{
        id:randomUUID(),parentUserId:user.id,
        studentUserId:invite.studentUserId,status:'PENDING',
        inviteCodeId:invite.id,
      }})
      const claimed=await tx.parentInviteCode.updateMany({
        where:{id:invite.id,status:'ACTIVE',consumedAt:null},
        data:{status:'CONSUMED',consumedAt:new Date(),consumedByParentUserId:user.id},
      })
      if(claimed.count!==1)refuse()
      const termsHash=canonicalHash({
        version:LINK_CONSENT_VERSION,text:LINK_CONSENT_TEXT,
        parentUserId:user.id,studentUserId:invite.studentUserId,
        relationshipId:relation.id,parentAcknowledged:true,
      })
      await tx.$executeRaw`
        INSERT INTO "campus_parent_registrations" (
          "parent_user_id","student_user_id","organization_id",
          "relationship_id","terms_version","terms_hash"
        ) VALUES (${user.id},${invite.studentUserId},${invite.organizationId},
          ${relation.id},${LINK_CONSENT_VERSION},${termsHash})
      `
      await appendAudit(tx,{
        organizationId:invite.organizationId,actorUserId:user.id,
        action:'CAMPUS_PARENT_ACCOUNT_CLAIMED',targetType:'PARENT_RELATIONSHIP',
        targetId:relation.id,domainEventId:randomUUID(),
        payload:{consentVersion:LINK_CONSENT_VERSION,termsHash,status:'PENDING'},
      })
      return {status:'PENDING_STUDENT_CONFIRMATION' as const,
        accountDomain:'SCHOOL' as const,username:name}
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  }catch(error:any){
    if(error instanceof CampusAdmissionError)throw error
    if(error?.code==='P2002'||error?.meta?.code==='23505'
      ||error?.code==='P2034')refuse('CAMPUS_PARENT_CLAIM_CONFLICT',409)
    throw error
  }
}
async function verifiedRelationship(tx:Tx,actor:AuthenticatedPrincipal,id:string){
  if(actor.accountDomain!=='SCHOOL'||!['STUDENT','PARENT'].includes(actor.role))
    refuse('CAMPUS_PARENT_AUTH_REQUIRED',403)
  const rows=await tx.$queryRaw<Array<{
    parentUserId:string;studentUserId:string;organizationId:string
  }>>`
    SELECT r."parent_user_id" AS "parentUserId",
      r."student_user_id" AS "studentUserId",
      i."organization_id" AS "organizationId"
    FROM "parent_student_relationships" r
    JOIN "parent_invite_codes" i ON i."id"=r."invite_code_id"
      AND i."course_id" IS NULL AND i."organization_id" IS NOT NULL
    JOIN "users" p ON p."id"=r."parent_user_id"
      AND p."account_domain"='SCHOOL' AND p."role"='PARENT'
    JOIN "users" s ON s."id"=r."student_user_id"
      AND s."account_domain"='SCHOOL' AND s."role"='STUDENT'
    WHERE r."id"=${id}
      AND (r."parent_user_id"=${actor.userId} OR r."student_user_id"=${actor.userId})
  `
  const link=rows[0]
  if(!link?.organizationId)refuse()
  await assertCurrentChild(tx,link.organizationId,link.studentUserId)
  return link
}
export async function readCampusParentLinks(actor:AuthenticatedPrincipal){
  if(actor.accountDomain!=='SCHOOL'||!['STUDENT','PARENT'].includes(actor.role))
    refuse('CAMPUS_PARENT_AUTH_REQUIRED',403)
  const rows=await prisma.$queryRaw<Array<{id:string;status:string;approvedAt:Date|null}>>`
    SELECT r."id",r."status",r."approved_at" AS "approvedAt"
    FROM "parent_student_relationships" r
    JOIN "parent_invite_codes" i ON i."id"=r."invite_code_id"
      AND i."organization_id" IS NOT NULL AND i."course_id" IS NULL
    JOIN "users" p ON p."id"=r."parent_user_id" AND p."account_domain"='SCHOOL'
    JOIN "users" s ON s."id"=r."student_user_id" AND s."account_domain"='SCHOOL'
    WHERE (${actor.role}='STUDENT' AND r."student_user_id"=${actor.userId})
      OR (${actor.role}='PARENT' AND r."parent_user_id"=${actor.userId})
    ORDER BY r."created_at" DESC,r."id" DESC LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100,
    canApprove:actor.role==='STUDENT'}
}
export async function approveCampusParentLink(actor:AuthenticatedPrincipal,id:string,version:string){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')
    refuse('CAMPUS_STUDENT_REQUIRED',403)
  await prisma.$transaction(async tx=>{
    const link=await verifiedRelationship(tx,actor,id)
    if(link.studentUserId!==actor.userId)refuse()
  })
  if(version!==LINK_CONSENT_VERSION)refuse('CAMPUS_PARENT_CONSENT_VERSION',400)
  return parentPortalService.approve(actor,id,version)
}
export async function revokeCampusParentLink(actor:AuthenticatedPrincipal,id:string,reason:string){
  await prisma.$transaction(tx=>verifiedRelationship(tx,actor,id))
  return parentPortalService.revoke(actor,id,reason)
}
export async function claimAdditionalCampusChild(actor:AuthenticatedPrincipal,code:string){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='PARENT')refuse('CAMPUS_PARENT_REQUIRED',403)
  const hash=hashParentInviteCode(code)
  await prisma.$transaction(async tx=>{
    const invite=await tx.parentInviteCode.findUnique({where:{codeHash:hash}})
    if(!invite?.organizationId||invite.courseId||invite.status!=='ACTIVE'
      ||invite.expiresAt<=new Date())refuse()
    await assertCurrentChild(tx,invite.organizationId,invite.studentUserId)
  })
  return parentPortalService.claim(actor,code)
}
