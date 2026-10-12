import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword } from '../../utils/password'
import { digestCampusStudentNumber } from '../campus/admission.service'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

export class HuiteacherStudentInviteError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherStudentInviteError'
  }
}
function fail(code:string,status=409):never {throw new HuiteacherStudentInviteError(code,status)}
type Tx=Prisma.TransactionClient
const tokenHash=(raw:string)=>createHash('sha256')
  .update('huiteacher-student-invite:v1:').update(raw).digest('hex')

async function requireIssuer(tx:Tx,organizationId:string,actorUserId:string){
  const scope=await resolveEducationProductMemberScope({
    organizationId,actorUserId,product:'HUITEACHER',
  },tx)
  if(!scope?.productAdmin)fail('HUITEACHER_ADMIN_REQUIRED',403)
}

export async function issueTeacherStudentInvitations(input:{
  organizationId:string;classUnitId:string;actorUserId:string;studentNumbers:string[]
}){
  const items=input.studentNumbers.map(x=>x.trim().toUpperCase())
  if(!items.length||items.length>200||items.some(x=>!/^[A-Z0-9_-]{2,40}$/.test(x))
    ||new Set(items).size!==items.length)fail('HUITEACHER_ROSTER_INVALID',400)
  const digests=items.map(x=>digestCampusStudentNumber(input.organizationId,x))
  const expiresAt=new Date(Date.now()+24*3600_000)
  return prisma.$transaction(async tx=>{
    // Re-check under the transaction; revoking a product grant before issuing
    // an invitation must prevent further enrollment.
    await requireIssuer(tx,input.organizationId,input.actorUserId)
    const unit=await tx.$queryRaw<Array<{id:string}>>`
      SELECT u."id" FROM "organization_units" u
      JOIN "organizations" org ON org."id"=u."organization_id"
      WHERE u."id"=${input.classUnitId} AND u."organization_id"=${input.organizationId}
        AND u."unit_kind"='CLASS' AND org."status"='ACTIVE'
      FOR SHARE OF u,org
    `
    if(!unit.length)fail('HUITEACHER_CLASS_NOT_FOUND',404)
    const result:Array<{studentNumber:string;inviteCode:string}>= []
    for(let i=0;i<items.length;i++){
      // Reissuing a roster entry revokes its earlier unused credentials,
      // including expired ones blocked by the pending uniqueness constraint.
      await tx.educationTeacherStudentInvitation.updateMany({
        where:{organizationId:input.organizationId,studentNoDigest:digests[i],
          consumedAt:null,revokedAt:null},
        data:{revokedAt:new Date()},
      })
      const inviteCode=randomBytes(32).toString('base64url')
      await tx.educationTeacherStudentInvitation.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        classUnitId:input.classUnitId,studentNoDigest:digests[i],
        invitedByUserId:input.actorUserId,tokenHash:tokenHash(inviteCode),expiresAt,
      }})
      result.push({studentNumber:items[i],inviteCode})
    }
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_STUDENT_INVITES_ISSUED',targetType:'CLASS',
      targetId:input.classUnitId,domainEventId:randomUUID(),
      payload:{count:result.length,expiresAt:expiresAt.toISOString()}})
    return {expiresAt:expiresAt.toISOString(),list:result}
  })
}

async function redeem(tx:Tx,input:{
  inviteCode:string;studentNumber:string;actorUserId?:string
  username?:string;passwordHash?:string
}){
  const digest=tokenHash(input.inviteCode)
  const invites=await tx.$queryRaw<Array<{
    id:string;organizationId:string;classUnitId:string
    studentNoDigest:string;invitedByUserId:string
  }>>`
    SELECT "id","organization_id" AS "organizationId",
      "class_unit_id" AS "classUnitId",
      "student_no_digest" AS "studentNoDigest",
      "invited_by_user_id" AS "invitedByUserId"
    FROM "education_teacher_student_invitations"
    WHERE "token_hash"=${digest} AND "consumed_at" IS NULL
      AND "revoked_at" IS NULL AND "expires_at">statement_timestamp()
    FOR UPDATE
  `
  const invite=invites[0]
  if(!invite||invite.studentNoDigest!==digestCampusStudentNumber(invite.organizationId,input.studentNumber))
    fail('HUITEACHER_STUDENT_INVITE_UNAVAILABLE',404)
  await requireIssuer(tx,invite.organizationId,invite.invitedByUserId)
  let userId=input.actorUserId
  if(userId){
    const user=await tx.user.findUnique({where:{id:userId},
      select:{role:true,accountDomain:true,isActive:true,isFrozen:true,
        mustChangePassword:true,expiresAt:true}})
    if(!user||user.role!=='STUDENT'||user.accountDomain!=='SCHOOL'
      ||!user.isActive||user.isFrozen||user.mustChangePassword
      ||(user.expiresAt&&user.expiresAt<=new Date()))
      fail('HUITEACHER_STUDENT_ACCOUNT_INELIGIBLE',403)
  }else{
    if(!input.username||!input.passwordHash)fail('HUITEACHER_STUDENT_INVITE_UNAVAILABLE',404)
    const normalized=input.username.toLowerCase()
    if(await tx.campusAccount.findUnique({where:{normalizedLogin:normalized},select:{userId:true}}))
      fail('HUITEACHER_EXISTING_STUDENT_ACCOUNT_REQUIRED')
    const u=await tx.user.create({data:{
      username:'education_'+randomUUID().replace(/-/g,''),
      passwordHash:input.passwordHash,role:'STUDENT',accountDomain:'SCHOOL',
      teacherApproved:true,nickname:null,phone:null,
    }})
    userId=u.id
    await tx.campusAccount.create({data:{
      userId:u.id,loginName:input.username,normalizedLogin:normalized,
    }})
  }
  const existing=await tx.organizationMembership.findFirst({where:{
    organizationId:invite.organizationId,userId,validUntil:null,
  },select:{id:true}})
  let membershipId=existing?.id
  if(membershipId){
    // Already enrolled in School? Only reuse the exact class relation; never
    // create a second student identity or silently move a class assignment.
    const classes=await tx.$queryRaw<Array<{classUnitId:string}>>`
      SELECT "class_unit_id" AS "classUnitId"
      FROM "organization_student_class_assignments"
      WHERE "organization_id"=${invite.organizationId}
        AND "membership_id"=${membershipId}
        AND "valid_until" IS NULL AND "is_primary"=TRUE
    `
    if(classes.some(x=>x.classUnitId!==invite.classUnitId))
      fail('HUITEACHER_EXISTING_CLASS_MISMATCH')
  }else{
    membershipId=randomUUID()
    await tx.organizationMembership.create({data:{
      id:membershipId,organizationId:invite.organizationId,
      userId:userId!,orgRole:'MEMBER',
    }})
  }
  const persona=await tx.organizationPersonaGrant.findFirst({where:{
    organizationId:invite.organizationId,membershipId,persona:'STUDENT',revokedAt:null,
  },select:{id:true}})
  if(!persona)await tx.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:invite.organizationId,
    membershipId:membershipId!,persona:'STUDENT',
    grantedByUserId:invite.invitedByUserId,
  }})
  const assigned=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM "organization_student_class_assignments"
    WHERE "organization_id"=${invite.organizationId}
      AND "membership_id"=${membershipId!}
      AND "class_unit_id"=${invite.classUnitId}
      AND "valid_until" IS NULL
  `
  if(!assigned.length)await tx.$executeRaw`
    INSERT INTO "organization_student_class_assignments"(
      "id","organization_id","membership_id","class_unit_id","is_primary")
    VALUES(${randomUUID()},${invite.organizationId},
      ${membershipId!},${invite.classUnitId},TRUE)
  `
  await tx.educationTeacherStudentInvitation.update({where:{id:invite.id},
    data:{consumedAt:new Date(),consumedByUserId:userId}})
  await appendAudit(tx,{organizationId:invite.organizationId,
    actorUserId:invite.invitedByUserId,action:'HUITEACHER_STUDENT_JOINED',
    targetType:'MEMBERSHIP',targetId:membershipId!,domainEventId:randomUUID(),
    payload:{classUnitId:invite.classUnitId,invitationId:invite.id}})
  return {organizationId:invite.organizationId,
    classUnitId:invite.classUnitId,membershipId,userId,
    // Psychology admission remains absent unless completed separately.
    psychologyAdmission:false}
}
export async function registerInvitedTeacherStudent(input:{
  inviteCode:string;studentNumber:string;username:string;password:string
}){
  const passwordHash=await hashPassword(input.password)
  try{return await prisma.$transaction(tx=>redeem(tx,{
    inviteCode:input.inviteCode,studentNumber:input.studentNumber,
    username:input.username.trim(),passwordHash,
  }))}
  catch(e:any){
    if(e instanceof HuiteacherStudentInviteError)throw e
    if(e?.code==='P2002'||e?.meta?.code==='23505')
      fail('HUITEACHER_STUDENT_ACCOUNT_OR_CLASS_CONFLICT')
    throw e
  }
}
export async function joinExistingTeacherStudent(input:{
  actorUserId:string;inviteCode:string;studentNumber:string
}){
  try{return await prisma.$transaction(tx=>redeem(tx,input))}
  catch(e:any){
    if(e instanceof HuiteacherStudentInviteError)throw e
    if(e?.code==='P2002'||e?.meta?.code==='23505')fail('HUITEACHER_STUDENT_CLASS_CONFLICT')
    throw e
  }
}
