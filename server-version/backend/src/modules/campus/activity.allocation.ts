import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { CampusActivityError, lockAndAssertCampusActivityEditor } from './activity.service'
import { appendAudit } from '../organization/service'

const deny=(code:string,statusCode=409):never=>{throw new CampusActivityError(code,statusCode)}
const sortedUnique=(values:string[])=>[...new Set(values)].sort()
export async function allocateCampusActivityParticipants(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  classUnitIds:string[];membershipIds?:string[]
  requestKey:string;expectedVersion:number
}){
  if(input.classUnitIds.length<1||input.classUnitIds.length>40
    ||input.membershipIds && input.membershipIds.length>500
    ||!/^[-a-zA-Z0-9_:]{8,100}$/.test(input.requestKey))deny('ACTIVITY_ALLOC_INPUT_INVALID',400)
  const classes=sortedUnique(input.classUnitIds)
  const members=input.membershipIds?sortedUnique(input.membershipIds):null
  const hash=createHash('sha256').update(JSON.stringify({
    classes,members,expectedVersion:input.expectedVersion,
  })).digest('hex')
  return prisma.$transaction(async tx=>{
    const {activity,context}=await lockAndAssertCampusActivityEditor(tx,input)
    if(activity.status!=='DRAFT'
      ||activity.version!==input.expectedVersion)deny('ACTIVITY_ALLOCATION_FROZEN')
    const prior=await tx.$queryRaw<Array<{requestHash:string;allocatedCount:number}>>`
      SELECT "request_hash" AS "requestHash","allocated_count" AS "allocatedCount"
      FROM "campus_activity_allocation_receipts"
      WHERE "course_id"=${input.courseId} AND "request_key"=${input.requestKey}
    `
    if(prior[0]){
      if(prior[0].requestHash!==hash)deny('ACTIVITY_IDEMPOTENCY_CONFLICT')
      return {selected:prior[0].allocatedCount,replayed:true,version:activity.version}
    }
    const scope=await tx.$queryRaw<Array<{classUnitId:string}>>(Prisma.sql`
      SELECT DISTINCT a."class_unit_id" AS "classUnitId" FROM "campus_class_admissions" a
      JOIN "organization_units" unit ON unit."id"=a."class_unit_id"
        AND unit."organization_id"=a."organization_id" AND unit."unit_kind"='CLASS'
      WHERE a."organization_id"=${input.organizationId}
        AND a."status"='APPROVED'
        AND a."class_unit_id" IN (${Prisma.join(classes)})
    `)
    if(scope.length!==classes.length)deny('ACTIVITY_CLASS_NOT_APPROVED',403)
    // Every class must be assigned to the contributor, unless the signer
    // holds CURRENT school governance. A counselor role alone is not a
    // school-wide student roster selector.
    if(!(context.orgRole==='ORG_ADMIN'&&context.canGovern)){
      const authority=await tx.$queryRaw<Array<{classUnitId:string}>>(Prisma.sql`
        SELECT DISTINCT "class_unit_id" AS "classUnitId"
        FROM "organization_staff_class_assignments"
        WHERE "organization_id"=${input.organizationId}
          AND "membership_id"=${context.membershipId}
          AND "class_unit_id" IN (${Prisma.join(classes)})
          AND "valid_from"<=statement_timestamp()
          AND ("valid_until" IS NULL OR "valid_until">statement_timestamp())
      `)
      if(authority.length!==classes.length)deny('ACTIVITY_CLASS_OUT_OF_SCOPE',403)
    }
    const candidates=await tx.$queryRaw<Array<{membershipId:string}>>(Prisma.sql`
      SELECT DISTINCT m."id" AS "membershipId"
      FROM "organization_student_class_assignments" sc
      JOIN "organization_memberships" m ON m."organization_id"=sc."organization_id"
        AND m."id"=sc."membership_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      JOIN "users" u ON u."id"=m."user_id"
        AND u."account_domain"='SCHOOL' AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
        AND e."organization_id"=m."organization_id" AND e."class_unit_id"=sc."class_unit_id"
        AND e."status"='APPROVED'
      JOIN "organization_persona_grants" pg ON pg."organization_id"=m."organization_id"
        AND pg."membership_id"=m."id" AND pg."persona"='STUDENT' AND pg."revoked_at" IS NULL
      WHERE sc."organization_id"=${input.organizationId}
        AND sc."class_unit_id" IN (${Prisma.join(classes)})
        AND sc."valid_from"<=statement_timestamp()
        AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
        ${members?Prisma.sql`AND m."id" IN (${Prisma.join(members)})`:Prisma.empty}
      ORDER BY m."id" LIMIT 501
    `)
    if(candidates.length===0||candidates.length>500)deny('ACTIVITY_SELECTION_EMPTY_OR_EXCESSIVE',400)
    if(members && candidates.length!==members.length)deny('ACTIVITY_MEMBER_OUT_OF_SCOPE',403)
    const rows=candidates.map(row=>Prisma.sql`(
      ${input.courseId},${input.organizationId},${row.membershipId},${input.actor.userId}
    )`)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "campus_activity_participants" (
        "course_id","organization_id","membership_id","selected_by_user_id"
      ) VALUES ${Prisma.join(rows)}
      ON CONFLICT ("course_id","membership_id") DO UPDATE
        SET "status"='ACTIVE',"revoked_at"=NULL,
          "selected_by_user_id"=EXCLUDED."selected_by_user_id"
    `)
    await tx.$executeRaw`
      INSERT INTO "campus_activity_allocation_receipts"
        ("course_id","request_key","request_hash","allocated_count")
      VALUES (${input.courseId},${input.requestKey},${hash},${candidates.length})
    `
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_MEMBERS_ALLOCATED',targetType:'COURSE',targetId:input.courseId,
      domainEventId:randomUUID(),payload:{count:candidates.length,classCount:classes.length},
    })
    return {selected:candidates.length,replayed:false,version:activity.version}
  })
}

/** Governed removal is immediate; task reads and START recheck activity scope. */
export async function revokeCampusActivityParticipant(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  membershipId:string
}){
  return prisma.$transaction(async tx=>{
    const {activity,context}=await lockAndAssertCampusActivityEditor(tx,input)
    if(activity.status==='CLOSED')deny('ACTIVITY_CLOSED')
    if(activity.status==='OPEN'||activity.status==='PAUSED'){
      if(!(context.orgRole==='ORG_ADMIN'&&context.canGovern))
        deny('ACTIVITY_GOVERNOR_REQUIRED',403)
    }
    const updated=await tx.$executeRaw`
      UPDATE "campus_activity_participants"
      SET "status"='REVOKED',"revoked_at"=statement_timestamp()
      WHERE "course_id"=${input.courseId} AND "organization_id"=${input.organizationId}
        AND "membership_id"=${input.membershipId} AND "status"='ACTIVE'
    `
    if(Number(updated)!==1)deny('ACTIVITY_PARTICIPANT_NOT_FOUND',404)
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_PARTICIPANT_REVOKED',targetType:'COURSE',targetId:input.courseId,
      domainEventId:randomUUID(),payload:{revokedMembershipId:input.membershipId},
    })
    return {revoked:true}
  })
}
