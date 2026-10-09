import { createHash, randomUUID } from 'node:crypto'
import { Prisma, CourseStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext, contextHasCapability } from '../organization/access'
import type { OrganizationAccessContext } from '../organization/access'
import { appendAudit } from '../organization/service'

type Tx=Prisma.TransactionClient
export type ActivityStatus='DRAFT'|'SUBMITTED'|'OPEN'|'PAUSED'|'CLOSED'
export type ActivityPurpose='STUDENT_WELLBEING'|'LEARNING_ADAPTATION'|'SCHOOL_CLIMATE'|'FAMILY_SUPPORT'
export class CampusActivityError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='CampusActivityError'
  }
}
const deny=(code:string,status=409):never=>{throw new CampusActivityError(code,status)}
export type CampusActivityRow={
  courseId:string;organizationId:string;ownerMembershipId:string;status:ActivityStatus
  purpose:ActivityPurpose;version:number;title:string;description:string|null
  openedAt:Date|null;closedAt:Date|null
}
async function currentSchoolContext(tx:Tx,actor:AuthenticatedPrincipal,organizationId:string){
  if(actor.accountDomain!=='SCHOOL')return deny('SCHOOL_IDENTITY_REQUIRED',403)
  const ctx=await resolveOrganizationAccessContext({principal:actor,organizationId},tx)
  if(!ctx?.membershipId||ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'
    ||ctx.explicitDenies.some(x=>['*','ORGANIZATION_GOVERNANCE','ACTIVITY_MANAGE'].includes(x)))
    return deny('SCHOOL_MEMBERSHIP_REQUIRED',403)
  return ctx
}
const isSchoolAdmin=(ctx:OrganizationAccessContext)=>
  ctx.orgRole==='ORG_ADMIN' && ctx.canGovern
const isProfessional=(ctx:OrganizationAccessContext)=>
  ctx.personas.includes('COUNSELOR')&&contextHasCapability(ctx,'PSYCHOLOGY_STAFF')
async function canPrepareActivity(tx:Tx,ctx:OrganizationAccessContext){
  if(isSchoolAdmin(ctx)||isProfessional(ctx))return true
  if(!ctx.personas.includes('TEACHER'))return false
  const rows=await tx.$queryRaw<Array<{allowed:boolean}>>`
    SELECT EXISTS(
      SELECT 1 FROM "organization_staff_class_assignments" a
      WHERE a."organization_id"=${ctx.organizationId}
        AND a."membership_id"=${ctx.membershipId}
        AND a."valid_from"<=statement_timestamp()
        AND (a."valid_until" IS NULL OR a."valid_until">statement_timestamp())
    ) AS "allowed"
  `
  return rows[0]?.allowed===true
}
export async function lockSchoolActivity(tx:Tx,organizationId:string,courseId:string):Promise<CampusActivityRow> {
  const rows=await tx.$queryRaw<CampusActivityRow[]>`
    SELECT a."course_id" AS "courseId",a."organization_id" AS "organizationId",
      a."owner_membership_id" AS "ownerMembershipId",a."status",
      a."purpose",a."version",a."opened_at" AS "openedAt",
      a."closed_at" AS "closedAt",c."title",c."description"
    FROM "campus_activities" a
    JOIN "courses" c ON c."id"=a."course_id" AND c."organization_id"=a."organization_id"
    JOIN "organizations" o ON o."id"=a."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    WHERE a."course_id"=${courseId} AND a."organization_id"=${organizationId}
      AND c."course_type"='CAMPUS_ACTIVITY'
    FOR UPDATE OF a
  `
  return rows[0]??deny('ACTIVITY_NOT_FOUND',404)
}
async function requireEditor(tx:Tx,ctx:OrganizationAccessContext,activity:CampusActivityRow){
  if(isSchoolAdmin(ctx))return
  if(!await canPrepareActivity(tx,ctx))deny('ACTIVITY_EDITOR_REQUIRED',403)
  if(ctx.membershipId===activity.ownerMembershipId)return
  const rows=await tx.$queryRaw<Array<{found:boolean}>>`
    SELECT EXISTS(SELECT 1 FROM "campus_activity_collaborators" e
      WHERE e."course_id"=${activity.courseId}
        AND e."organization_id"=${activity.organizationId}
        AND e."membership_id"=${ctx.membershipId}) AS "found"
  `
  if(!rows[0]?.found)deny('ACTIVITY_EDITOR_REQUIRED',403)
}
async function requireGovernor(ctx:OrganizationAccessContext){
  if(!isSchoolAdmin(ctx))deny('ACTIVITY_GOVERNANCE_REQUIRED',403)
}
export async function createCampusActivity(input:{
  actor:AuthenticatedPrincipal;organizationId:string;title:string
  description?:string|null;purpose:ActivityPurpose
}){
  if(!input.title.trim()||input.title.length>200)deny('ACTIVITY_TITLE_INVALID',400)
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    if(!await canPrepareActivity(tx,ctx))deny('ACTIVITY_EDITOR_REQUIRED',403)
    const course=await tx.course.create({data:{
      title:input.title.trim(),description:input.description?.trim()||null,
      creatorId:input.actor.userId,courseCode:'campus-'+randomUUID(),
      courseType:'CAMPUS_ACTIVITY',organizationId:input.organizationId,
      status:CourseStatus.DRAFT,isLibrary:false,isRecruiting:false,
    }})
    await tx.$executeRaw`
      INSERT INTO "campus_activities" (
        "course_id","organization_id","owner_membership_id","purpose"
      ) VALUES (${course.id},${input.organizationId},${ctx.membershipId},${input.purpose})
    `
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_DRAFTED',targetType:'COURSE',targetId:course.id,
      domainEventId:randomUUID(),payload:{purpose:input.purpose},
    })
    return {id:course.id,title:course.title,status:'DRAFT' as const,version:1}
  })
}
export async function listCampusActivities(input:{
  actor:AuthenticatedPrincipal;organizationId:string;page:number;pageSize:number
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    const admin=isSchoolAdmin(ctx)
    const offset=(input.page-1)*input.pageSize
    const rows=await tx.$queryRaw<Array<CampusActivityRow&{participantCount:number;runCount:number}>>`
      SELECT a."course_id" AS "courseId",a."organization_id" AS "organizationId",
        a."owner_membership_id" AS "ownerMembershipId",a."status",
        a."purpose",a."version",a."opened_at" AS "openedAt",a."closed_at" AS "closedAt",
        c."title",c."description",
        (SELECT COUNT(*)::int FROM "campus_activity_participants" p
          WHERE p."course_id"=a."course_id" AND p."status"='ACTIVE') AS "participantCount",
        (SELECT COUNT(*)::int FROM "campus_activity_runs" r
          WHERE r."course_id"=a."course_id") AS "runCount"
      FROM "campus_activities" a
      JOIN "courses" c ON c."id"=a."course_id"
      WHERE a."organization_id"=${input.organizationId}
        AND (${admin} OR a."owner_membership_id"=${ctx.membershipId}
          OR EXISTS(SELECT 1 FROM "campus_activity_collaborators" ec
            WHERE ec."course_id"=a."course_id" AND ec."membership_id"=${ctx.membershipId}))
      ORDER BY a."created_at" DESC,a."course_id" DESC
      LIMIT ${input.pageSize+1} OFFSET ${offset}
    `
    return {list:rows.slice(0,input.pageSize),hasMore:rows.length>input.pageSize,page:input.page}
  })
}
export async function readCampusActivity(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    await requireEditor(tx,ctx,a)
    const participants=await tx.$queryRaw<Array<{count:number}>>`
      SELECT COUNT(*)::int AS "count" FROM "campus_activity_participants"
      WHERE "course_id"=${a.courseId} AND "status"='ACTIVE'
    `
    const runs=await tx.$queryRaw<Array<{runId:string;status:string;name:string}>>`
      SELECT ar."run_id" AS "runId",r."status",r."name"
      FROM "campus_activity_runs" ar JOIN "assessment_runs" r ON r."id"=ar."run_id"
      WHERE ar."course_id"=${a.courseId} ORDER BY ar."created_at",ar."run_id"
    `
    return {...a,participantCount:participants[0]?.count??0,runs}
  })
}
export async function updateCampusActivity(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  title:string;description?:string|null;expectedVersion:number
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    await requireEditor(tx,ctx,a)
    if(a.status!=='DRAFT'||a.version!==input.expectedVersion)deny('ACTIVITY_VERSION_OR_STATE_CONFLICT')
    const c=await tx.course.update({where:{id:a.courseId},data:{
      title:input.title.trim(),description:input.description?.trim()||null,
    }})
    await tx.$executeRaw`
      UPDATE "campus_activities" SET "version"="version"+1,
        "updated_at"=statement_timestamp() WHERE "course_id"=${a.courseId}
    `
    return {title:c.title,status:'DRAFT' as const,version:a.version+1}
  })
}
export async function addCampusActivityCollaborator(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string;membershipId:string
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    await requireGovernor(ctx)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    if(a.status!=='DRAFT')deny('ACTIVITY_NOT_EDITABLE')
    const valid=await tx.$queryRaw<Array<{allowed:boolean}>>`
      SELECT EXISTS(
        SELECT 1 FROM "organization_memberships" m
        JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
        JOIN "organization_persona_grants" p ON p."membership_id"=m."id"
          AND p."organization_id"=m."organization_id" AND p."revoked_at" IS NULL
          AND p."persona" IN ('TEACHER','COUNSELOR')
        WHERE m."organization_id"=${input.organizationId}
          AND m."id"=${input.membershipId}
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      ) AS "allowed"
    `
    if(!valid[0]?.allowed)deny('ACTIVITY_COLLABORATOR_INELIGIBLE',403)
    await tx.$executeRaw`
      INSERT INTO "campus_activity_collaborators" ("course_id","organization_id","membership_id")
      VALUES (${a.courseId},${a.organizationId},${input.membershipId})
      ON CONFLICT DO NOTHING
    `
    return {added:true}
  })
}
export async function changeCampusActivityStatus(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  action:'SUBMIT'|'OPEN'|'PAUSE'|'RESUME'|'CLOSE';expectedVersion:number
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    if(a.version!==input.expectedVersion)deny('ACTIVITY_VERSION_CONFLICT')
    if(input.action==='SUBMIT')await requireEditor(tx,ctx,a)
    else await requireGovernor(ctx)
    const transitions:Record<typeof input.action,{from:ActivityStatus[];to:ActivityStatus}>={
      SUBMIT:{from:['DRAFT'],to:'SUBMITTED'},
      OPEN:{from:['SUBMITTED'],to:'OPEN'},
      PAUSE:{from:['OPEN'],to:'PAUSED'},
      RESUME:{from:['PAUSED'],to:'OPEN'},
      CLOSE:{from:['SUBMITTED','OPEN','PAUSED'],to:'CLOSED'},
    }
    const transition=transitions[input.action]
    if(!transition.from.includes(a.status))deny('ACTIVITY_STATE_CONFLICT')
    if(input.action==='OPEN'||input.action==='RESUME'){
      // A frozen participant list is not a person roster: recheck current
      // enrollment/membership/class approval before opening/reopening.
      const rows=await tx.$queryRaw<Array<{selected:number;current:number;contents:number}>>`
        SELECT
          (SELECT COUNT(*)::int FROM "campus_activity_participants" p
            WHERE p."course_id"=${a.courseId} AND p."status"='ACTIVE') AS "selected",
          (SELECT COUNT(*)::int FROM "campus_activity_participants" p
            JOIN "organization_memberships" m ON m."id"=p."membership_id"
              AND m."organization_id"=p."organization_id"
            JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
              AND e."organization_id"=p."organization_id" AND e."status"='APPROVED'
            JOIN "campus_class_admissions" ca ON ca."class_unit_id"=e."class_unit_id"
              AND ca."organization_id"=e."organization_id" AND ca."status"='APPROVED'
            WHERE p."course_id"=${a.courseId} AND p."status"='ACTIVE'
              AND m."valid_from"<=statement_timestamp()
              AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
          ) AS "current",
          ((SELECT COUNT(*) FROM "assignments" t WHERE t."course_id"=${a.courseId}
             AND t."status"='PUBLISHED')
           +(SELECT COUNT(*) FROM "checkins" ck WHERE ck."course_id"=${a.courseId})
           +(SELECT COUNT(*) FROM "campus_activity_runs" ar WHERE ar."course_id"=${a.courseId}))::int AS "contents"
      `
      const v=rows[0]
      if(!v||v.selected===0||v.selected!==v.current||v.contents===0)deny('ACTIVITY_NOT_READY')
      await tx.course.update({where:{id:a.courseId},data:{status:CourseStatus.PUBLISHED}})
    }
    if(input.action==='CLOSE')await tx.course.update({where:{id:a.courseId},data:{status:CourseStatus.COMPLETED}})
    await tx.$executeRaw`
      UPDATE "campus_activities" SET "status"=${transition.to},
        "version"="version"+1,
        "opened_by_user_id"=CASE WHEN ${input.action} IN ('OPEN','RESUME')
          THEN ${input.actor.userId} ELSE "opened_by_user_id" END,
        "opened_at"=CASE WHEN ${input.action} IN ('OPEN','RESUME')
          THEN COALESCE("opened_at",statement_timestamp()) ELSE "opened_at" END,
        "closed_at"=CASE WHEN ${input.action}='CLOSE'
          THEN statement_timestamp() ELSE "closed_at" END,
        "updated_at"=statement_timestamp()
      WHERE "course_id"=${a.courseId}
    `
    await appendAudit(tx,{
      organizationId:a.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_'+input.action,targetType:'COURSE',targetId:a.courseId,
      domainEventId:randomUUID(),payload:{from:a.status,to:transition.to,version:a.version+1},
    })
    return {status:transition.to,version:a.version+1}
  })
}
export async function assertCampusActivityEditor(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    await requireEditor(tx,ctx,a)
    return {activity:a,context:ctx}
  })
}
export async function assertCampusActivityGovernor(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
}){
  return prisma.$transaction(async tx=>{
    const ctx=await currentSchoolContext(tx,input.actor,input.organizationId)
    await requireGovernor(ctx)
    const a=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    return {activity:a,context:ctx}
  })
}
