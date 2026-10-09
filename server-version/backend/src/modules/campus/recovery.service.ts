import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { AuthenticatedPrincipal } from '../../types'
import { prisma } from '../../config/database'
import { hashPassword, isValidPassword } from '../../utils/password'
import { appendAudit } from '../organization/service'
import { resolveOrganizationAccessContext } from '../organization/access'
import { assertCampusRecoveryAuthority, CampusAdmissionError, digestCampusStudentNumber } from './admission.service'

const deny=(code:string,statusCode=409):never=>{throw new CampusAdmissionError(code,statusCode)}
const digest=(value:string)=>createHash('sha256').update('school-recovery:v1:'+value).digest('hex')
const normalized=(value:string)=>{
 const login=value.trim().toLowerCase()
 if(!/^[a-z0-9_.-]{4,32}$/.test(login))deny('RECOVERY_LOGIN_INVALID',400)
 return login
}
export async function issueSchoolStudentRecovery(input:{
 actor:AuthenticatedPrincipal;organizationId:string;classUnitId:string;
 studentNumber:string;reasonCode:'FORGOT_PASSWORD'|'FORGOT_LOGIN'|'INCIDENT_CORRECTION';
 verifiedOffline:boolean
}) {
 await assertCampusRecoveryAuthority(input.actor,input.organizationId)
 if(!input.verifiedOffline)deny('OFFLINE_VERIFICATION_REQUIRED',400)
 const numberHash=digestCampusStudentNumber(input.organizationId,input.studentNumber)
 const raw=randomBytes(30).toString('base64url')
 const expiry=new Date(Date.now()+15*60_000)
 return prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{userId:string;eligibilityId:string;status:string;loginName:string}>>`
     SELECT e."claimed_user_id" AS "userId",e."id" AS "eligibilityId",
       s."status",c."login_name" AS "loginName"
     FROM "campus_student_eligibilities" e
     JOIN "campus_student_enrollments" s
       ON s."eligibility_id"=e."id" AND s."user_id"=e."claimed_user_id"
     JOIN "campus_accounts" c ON c."user_id"=s."user_id"
     JOIN "users" u ON u."id"=s."user_id"
       AND u."account_domain"='SCHOOL' AND u."is_frozen"=FALSE AND u."is_active"=TRUE
     WHERE e."organization_id"=${input.organizationId}
       AND e."class_unit_id"=${input.classUnitId}
       AND e."student_no_digest"=${numberHash}
       AND s."status" IN ('PENDING_CLASS_APPROVAL','APPROVED')
     FOR UPDATE OF e
   `
   const row=rows[0]
   if(!row)deny('RECOVERY_UNAVAILABLE',404)
   // Pending receipts include expired ones, superseded atomically.
   await tx.$executeRaw`
     UPDATE "campus_student_recoveries" SET "used_at"=statement_timestamp()
     WHERE "user_id"=${row.userId} AND "used_at" IS NULL
   `
   await tx.$executeRaw`
     INSERT INTO "campus_student_recoveries" (
       "id","organization_id","class_unit_id","user_id","token_hash",
       "requested_by_id","reason_code","expires_at"
     ) VALUES (${randomUUID()},${input.organizationId},${input.classUnitId},
       ${row.userId},${digest(raw)},${input.actor.userId},
       ${input.reasonCode},${expiry})
   `
   await appendAudit(tx,{
     organizationId:input.organizationId,actorUserId:input.actor.userId,
     action:'CAMPUS_STUDENT_RECOVERY_ISSUED',targetType:'ELIGIBILITY',
     targetId:row.eligibilityId,domainEventId:randomUUID(),
     payload:{reasonCode:input.reasonCode,offlineVerification:true},
   })
   // Display once to the authorized officer for an independently verified
   // handoff. Never return the userId, student number or results.
   return {username:row.loginName,recoveryCode:raw,expiresAt:expiry.toISOString()}
 })
}
export async function completeSchoolStudentRecovery(input:{
 recoveryCode:string;newPassword:string;newLogin?:string
}){
 if(input.recoveryCode.length<32||input.recoveryCode.length>64
   ||!isValidPassword(input.newPassword))deny('RECOVERY_UNAVAILABLE',400)
 const normalizedNewLogin=input.newLogin===undefined?undefined:normalized(input.newLogin)
 const passwordHash=await hashPassword(input.newPassword)
 try{return await prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{
     id:string;userId:string;organizationId:string;classUnitId:string
   }>>`
     SELECT r."id",r."user_id" AS "userId",
       r."organization_id" AS "organizationId",r."class_unit_id" AS "classUnitId"
     FROM "campus_student_recoveries" r
     JOIN "campus_student_enrollments" e ON e."user_id"=r."user_id"
       AND e."status" IN ('PENDING_CLASS_APPROVAL','APPROVED')
       AND e."organization_id"=r."organization_id" AND e."class_unit_id"=r."class_unit_id"
     WHERE r."token_hash"=${digest(input.recoveryCode)}
       AND r."used_at" IS NULL AND r."expires_at">statement_timestamp()
     FOR UPDATE OF r
   `
   const record=rows[0]
   if(!record)deny('RECOVERY_UNAVAILABLE',404)
   const user=await tx.user.findUnique({where:{id:record.userId}})
   if(!user||user.accountDomain!=='SCHOOL'||!user.isActive||user.isFrozen
     ||user.role!=='STUDENT')deny('RECOVERY_UNAVAILABLE',404)
   if(normalizedNewLogin){
     await tx.campusAccount.update({where:{userId:user.id},data:{
       loginName:input.newLogin!.trim(),normalizedLogin:normalizedNewLogin,
     }})
   }
   await tx.user.update({where:{id:user.id},data:{
     passwordHash,tokenVersion:{increment:1},mustChangePassword:false,
   }})
   await tx.$executeRaw`
     UPDATE "campus_student_recoveries" SET "used_at"=statement_timestamp()
     WHERE "id"=${record.id}
   `
   await appendAudit(tx,{
     organizationId:record.organizationId,actorUserId:user.id,
     action:'CAMPUS_STUDENT_RECOVERY_CONSUMED',targetType:'USER',targetId:user.id,
     domainEventId:randomUUID(),payload:{loginChanged:!!normalizedNewLogin},
   })
   return {recovered:true} as const
 })}catch(err:any){
   if(err instanceof CampusAdmissionError)throw err
   if(err?.code==='P2002'||err?.meta?.code==='23505')deny('RECOVERY_UNAVAILABLE',404)
   throw err
 }
}

/** Two independent currently MFA-authenticated SCHOOL administrators approve
 * recovery of an already established privileged account, never by SMS/email.
 */
async function schoolOrgAdmin(actor:AuthenticatedPrincipal,organizationId:string){
 if(actor.accountDomain!=='SCHOOL')deny('MFA_RESET_AUTH_REQUIRED',403)
 const context=await resolveOrganizationAccessContext({principal:actor,organizationId})
 if(!context||context.productDomain!=='SCHOOL'||context.orgRole!=='ORG_ADMIN'
   ||context.organizationStatus!=='ACTIVE'||!context.membershipId
   ||context.explicitDenies.includes('*')
   ||context.explicitDenies.includes('ORGANIZATION_GOVERNANCE'))deny('MFA_RESET_AUTH_REQUIRED',403)
 return context
}
export async function requestSchoolMfaReset(input:{
 actor:AuthenticatedPrincipal;organizationId:string;targetUserId:string
 reasonCode:'DEVICE_LOST'|'SECURITY_INCIDENT'
}){
 await schoolOrgAdmin(input.actor,input.organizationId)
 if(input.actor.userId===input.targetUserId)deny('TWO_OFFICERS_REQUIRED',403)
 return prisma.$transaction(async tx=>{
   const membership=await tx.$queryRaw<Array<{id:string}>>`
     SELECT m."id" FROM "organization_memberships" m
     JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
     WHERE m."organization_id"=${input.organizationId}
       AND m."user_id"=${input.targetUserId} AND m."valid_until" IS NULL
       AND u."is_active"=TRUE AND u."is_frozen"=FALSE
     FOR SHARE OF m
   `
   if(!membership.length)deny('MFA_RESET_TARGET_UNAVAILABLE',404)
   // A global SCHOOL account shared by more than one school must not have
   // its MFA removed solely through one school's administrators.
   const schoolScopes=await tx.$queryRaw<Array<{count:number}>>`
     SELECT COUNT(DISTINCT m."organization_id")::int AS "count"
     FROM "organization_memberships" m
     JOIN "organizations" o ON o."id"=m."organization_id"
       AND o."product_domain"='SCHOOL'
     WHERE m."user_id"=${input.targetUserId} AND m."valid_until" IS NULL
   `
   if(schoolScopes[0]?.count!==1)deny('MULTI_SCHOOL_MFA_RESET_REQUIRES_OPERATOR',403)
   const enabled=await tx.campusMfaCredential.findUnique({where:{userId:input.targetUserId}})
   if(!enabled?.enabled)deny('MFA_RESET_TARGET_NOT_ENROLLED',409)
   await tx.$executeRaw`
     UPDATE "campus_mfa_reset_requests" SET "status"='EXPIRED',
       "decided_at"=statement_timestamp()
     WHERE "organization_id"=${input.organizationId}
       AND "target_user_id"=${input.targetUserId}
       AND "status"='PENDING' AND "expires_at"<=statement_timestamp()
   `
   const request=await tx.campusMfaResetRequest.create({data:{
     id:randomUUID(),organizationId:input.organizationId,
     targetUserId:input.targetUserId,requestedById:input.actor.userId,
     reasonCode:input.reasonCode,expiresAt:new Date(Date.now()+30*60_000),
   }})
   await appendAudit(tx,{
     organizationId:input.organizationId,actorUserId:input.actor.userId,
     action:'CAMPUS_MFA_RESET_REQUESTED',targetType:'MFA_RESET',targetId:request.id,
     domainEventId:randomUUID(),payload:{reasonCode:input.reasonCode},
   })
   return {requestId:request.id,status:'PENDING' as const,expiresAt:request.expiresAt.toISOString()}
 })
}
export async function approveSchoolMfaReset(input:{
 actor:AuthenticatedPrincipal;organizationId:string;requestId:string
}){
 await schoolOrgAdmin(input.actor,input.organizationId)
 return prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{
     id:string;targetUserId:string;requestedById:string;reasonCode:string
   }>>`
     SELECT "id","target_user_id" AS "targetUserId",
       "requested_by_id" AS "requestedById","reason_code" AS "reasonCode"
     FROM "campus_mfa_reset_requests"
     WHERE "id"=${input.requestId} AND "organization_id"=${input.organizationId}
       AND "status"='PENDING' AND "expires_at">statement_timestamp()
     FOR UPDATE
   `
   const request=rows[0]
   if(!request)deny('MFA_RESET_REQUEST_UNAVAILABLE',404)
   if(request.requestedById===input.actor.userId)deny('TWO_OFFICERS_REQUIRED',403)
   const original=await tx.$queryRaw<Array<{valid:boolean}>>`
     SELECT EXISTS (
       SELECT 1 FROM "organization_memberships" m
       JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
       WHERE m."organization_id"=${input.organizationId}
         AND m."user_id"=${request.requestedById} AND m."org_role"='ORG_ADMIN'
         AND m."valid_until" IS NULL AND u."is_active"=TRUE AND u."is_frozen"=FALSE
     ) AS "valid"
   `
   if(!original[0]?.valid)deny('MFA_RESET_REQUESTER_REVOKED',403)
   const target=await tx.user.findUnique({where:{id:request.targetUserId}})
   if(!target||target.accountDomain!=='SCHOOL'||target.isFrozen||!target.isActive)
     deny('MFA_RESET_TARGET_UNAVAILABLE',404)
   const targetMembership=await tx.organizationMembership.findFirst({
     where:{organizationId:input.organizationId,userId:target.id,validUntil:null},
   })
   if(!targetMembership)deny('MFA_RESET_TARGET_UNAVAILABLE',404)
   const schoolScopes=await tx.$queryRaw<Array<{count:number}>>`
     SELECT COUNT(DISTINCT m."organization_id")::int AS "count"
     FROM "organization_memberships" m JOIN "organizations" o
       ON o."id"=m."organization_id" AND o."product_domain"='SCHOOL'
     WHERE m."user_id"=${target.id} AND m."valid_until" IS NULL
   `
   if(schoolScopes[0]?.count!==1)deny('MULTI_SCHOOL_MFA_RESET_REQUIRES_OPERATOR',403)
   const enabled=await tx.campusMfaCredential.findUnique({where:{userId:target.id}})
   if(!enabled?.enabled)deny('MFA_RESET_TARGET_NOT_ENROLLED',409)
   await tx.campusMfaCredential.upsert({
     where:{userId:target.id},
     create:{userId:target.id,secretCipher:'RESET_PENDING',enabled:false,lastUsedStep:BigInt(-1)},
     update:{secretCipher:'RESET_PENDING',enabled:false,lastUsedStep:BigInt(-1),enabledAt:null},
   })
   await tx.campusMfaRecoveryCode.deleteMany({where:{userId:target.id}})
   await tx.user.update({where:{id:target.id},data:{tokenVersion:{increment:1}}})
   await tx.$executeRaw`
     UPDATE "campus_mfa_reset_requests" SET "status"='APPROVED',
       "approved_by_id"=${input.actor.userId},"decided_at"=statement_timestamp()
     WHERE "id"=${request.id}
   `
   await appendAudit(tx,{
     organizationId:input.organizationId,actorUserId:input.actor.userId,
     action:'CAMPUS_MFA_RESET_APPROVED',targetType:'MFA_RESET',targetId:request.id,
     domainEventId:randomUUID(),payload:{reasonCode:request.reasonCode,twoOfficer:true},
   })
   return {reset:true,targetAccountMustReenrollTotp:true}
 })
}
