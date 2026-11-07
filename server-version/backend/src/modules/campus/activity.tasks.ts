import { boundCompositeContinuationSql } from '../assessment-run/boundCompositeContinuation'
import {completedSchoolOrdinaryFeedbackSql} from '../assessment-run/completedSchoolFeedback'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { lockAndAssertCampusActivityEditor, CampusActivityError } from './activity.service'
import { listAssignedRunTasks, type RunTaskCursor } from '../assessment-run/productRead'

const deny=(code:string,status=409):never=>{throw new CampusActivityError(code,status)}
export type CampusTaskType='ASSIGNMENT'|'READING'|'CHECKIN'
export async function addCampusActivityTask(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  kind:CampusTaskType;title:string;description?:string|null
  content?:string|null;deadline?:Date|null
}){
  if(!input.title.trim()||input.title.length>200||input.content?.length && input.content.length>25000)
    deny('ACTIVITY_TASK_INVALID',400)
  return prisma.$transaction(async tx=>{
    const {activity}=await lockAndAssertCampusActivityEditor(tx,input)
    if(activity.status!=='DRAFT')deny('ACTIVITY_TASK_FROZEN')
    if(input.kind==='CHECKIN'){
      const row=await tx.checkin.create({data:{
        courseId:activity.courseId,creatorId:input.actor.userId,
        title:input.title.trim(),description:input.description?.trim()??null,
        content:input.content?.trim()??null,
        allowAnonymous:false,allowViewOthers:false,endTime:input.deadline??null,
      }})
      return {id:row.id,kind:input.kind,title:row.title}
    }
    // READING is a normal Assignment content item (not a second submission
    // engine), with a stable tag to render a reading-oriented student UI.
    const row=await tx.assignment.create({data:{
      courseId:activity.courseId,title:input.title.trim(),
      description:input.description?.trim()??null,
      content:input.content?.trim()??null,
      deadline:input.deadline??null,status:'PUBLISHED',
      tags:input.kind==='READING'?['CAMPUS_READING']:[],
    }})
    return {id:row.id,kind:input.kind,title:row.title}
  })
}

type CampusActivityForStudent={courseId:string;organizationId:string;title:string}
export async function listCampusStudentTasks(actor:AuthenticatedPrincipal,input:{
  page:number;pageSize:number;activityId?:string
  /** Run-execution batch bookmark. Within each batch, consume page/hasMore
   * before advancing nextRunCursor. Non-Run tasks appear only in the first
   * batch, avoiding repeats across Run batches. */
  runCursor?:RunTaskCursor
}) {
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')deny('CAMPUS_STUDENT_REQUIRED',403)
  // Membership, admission and current class/student assignment are all live
  // authority, checked before any task title/content is returned.
  const activityRows=await prisma.$queryRaw<CampusActivityForStudent[]>`
    SELECT DISTINCT a."course_id" AS "courseId",a."organization_id" AS "organizationId",
      course."title"
    FROM "campus_activity_participants" p
    JOIN "campus_activities" a ON a."course_id"=p."course_id"
      AND a."organization_id"=p."organization_id" AND a."status"='OPEN'
    JOIN "courses" course ON course."id"=a."course_id" AND course."course_type"='CAMPUS_ACTIVITY'
    JOIN "organizations" o ON o."id"=a."organization_id" AND o."status"='ACTIVE' AND o."product_domain"='SCHOOL'
    JOIN "education_product_entitlements" ent ON ent."organization_id"=o."id"
      AND ent."product"='HUISCHOOL' AND ent."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."id"=p."membership_id"
      AND m."organization_id"=p."organization_id"
      AND m."user_id"=${actor.userId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
      AND e."organization_id"=m."organization_id" AND e."status"='APPROVED'
    JOIN "campus_class_admissions" ca ON ca."class_unit_id"=e."class_unit_id"
      AND ca."organization_id"=e."organization_id" AND ca."status"='APPROVED'
    JOIN "organization_persona_grants" pg
      ON pg."organization_id"=m."organization_id"
      AND pg."membership_id"=m."id" AND pg."persona"='STUDENT'
      AND pg."revoked_at" IS NULL AND pg."granted_at"<=statement_timestamp()
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
      AND u."role"='STUDENT' AND u."is_active"=TRUE
      AND u."is_frozen"=FALSE AND u."must_change_password"=FALSE
    JOIN "organization_student_class_assignments" sc
      ON sc."membership_id"=m."id" AND sc."organization_id"=m."organization_id"
      AND sc."class_unit_id"=e."class_unit_id"
      AND sc."valid_from"<=statement_timestamp()
      AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    WHERE p."status"='ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id"=o."id" AND d."user_id"=${actor.userId}
          AND d."lifted_at" IS NULL
          AND d."permission" IN ('*','EDUCATION_ACCESS','HUISCHOOL_ACCESS','ACTIVITY_READ','RUN_START'))
    ORDER BY a."course_id" LIMIT 201
  `
  const authorized=input.activityId?activityRows.filter(a=>a.courseId===input.activityId):activityRows
  const ids=authorized.map(a=>a.courseId)
  if(!ids.length)return {list:[],total:0,page:input.page,hasMore:false,truncated:activityRows.length>200,nextRunCursor:null as RunTaskCursor|null}
  const [assignments,checkins,linkedRuns]=await Promise.all([
    prisma.assignment.findMany({
      where:{courseId:{in:ids},status:'PUBLISHED'},
      select:{id:true,courseId:true,title:true,deadline:true,tags:true,
        submissions:{where:{studentId:actor.userId},select:{status:true}}},
    }),
    prisma.checkin.findMany({
      where:{courseId:{in:ids}},
      select:{id:true,courseId:true,title:true,endTime:true,
        submissions:{where:{studentId:actor.userId},select:{id:true}}},
    }),
    prisma.$queryRaw<Array<{courseId:string;runId:string}>>`
      SELECT ar."course_id" AS "courseId", ar."run_id" AS "runId"
      FROM "campus_activity_runs" ar
      JOIN "campus_activities" a ON a."course_id"=ar."course_id" AND a."status"='OPEN'
      JOIN "assessment_runs" r ON r."id"=ar."run_id" AND r."status" IN ('PUBLISHED','CLOSED')
      WHERE ar."course_id" IN (${ids.length?Prisma.join(ids):Prisma.sql`NULL`})
    `,
  ])
  const assigned=await listAssignedRunTasks(actor.userId,{
    runIds:linkedRuns.map(link=>link.runId),
    preserveBoundSchoolContinuation:true,
    cursor:input.runCursor,
  })
  const runMap=new Map(linkedRuns.map(r=>[r.runId,r.courseId]))
  const activityMap=new Map(authorized.map(a=>[a.courseId,a]))
  const tasks:Array<{
    id:string;activityId:string;activityTitle:string;kind:CampusTaskType|'MEASUREMENT'
    title:string;status:'PENDING'|'COMPLETED'|'EXPIRED'|'IN_PROGRESS'|'UNAVAILABLE'
    deadline:string|null;href:string|null;resourceFamily?:string;feedbackNamespace?:'EDUCATION_ASSESSMENT';feedbackMode?:'COMPOSITION'
    canResumeExisting?:boolean;consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
  }>=[]
  // Assignments and check-ins belong to the initial mixed batch only. A Run
  // continuation must not replay them on each subsequent execution batch.
  for(const t of input.runCursor?[]:assignments){
    const activity=activityMap.get(t.courseId)
    if(!activity)continue
    const complete=t.submissions.some(s=>s.status==='SUBMITTED'||s.status==='GRADED')
    const expired=Boolean(t.deadline&&t.deadline<=new Date())
    tasks.push({id:t.id,activityId:t.courseId,activityTitle:activity.title,
      kind:t.tags.includes('CAMPUS_READING')?'READING':'ASSIGNMENT',
      title:t.title,status:complete?'COMPLETED':expired?'EXPIRED':'PENDING',
      deadline:t.deadline?.toISOString()??null,
      href:expired&&!complete?null:`/activities/${t.courseId}/assignments/${t.id}`})
  }
  for(const t of input.runCursor?[]:checkins){
    const activity=activityMap.get(t.courseId)
    if(!activity)continue
    const complete=t.submissions.length>0,expired=Boolean(t.endTime&&t.endTime<=new Date())
    tasks.push({id:t.id,activityId:t.courseId,activityTitle:activity.title,
      kind:'CHECKIN',title:t.title,status:complete?'COMPLETED':expired?'EXPIRED':'PENDING',
      deadline:t.endTime?.toISOString()??null,
      href:expired&&!complete?null:`/activities/${t.courseId}/checkins/${t.id}`})
  }
  for(const e of assigned.list){
    const courseId=runMap.get(e.runId),activity=courseId?activityMap.get(courseId):null
    if(!courseId||!activity)continue
    // Never expose internal subject username, raw scores, report attempt IDs,
    // or a respondent's name via an aggregate school task list.
    const status=e.status==='COMPLETED'?'COMPLETED':
      e.status==='STARTED'?'IN_PROGRESS':
      e.status==='ASSIGNED'?'PENDING':
      e.status==='EXPIRED'?'EXPIRED':'UNAVAILABLE'
    tasks.push({id:e.executionId,activityId:courseId,activityTitle:activity.title,
      kind:'MEASUREMENT',resourceFamily:e.resourceFamily,title:e.runName,status,
      ...(e.resourceKey?.startsWith('education-assessment:')?{feedbackNamespace:'EDUCATION_ASSESSMENT' as const}:{}),
      ...(e.resourceKey?.startsWith('education-composition:SCHOOL:')?{feedbackNamespace:'EDUCATION_ASSESSMENT' as const,feedbackMode:'COMPOSITION' as const}:{}),
      canResumeExisting:e.canResumeExisting,consentRequired:e.consentRequired,consentPurpose:e.consentPurpose,
      consentVisibility:e.consentVisibility,
      deadline:e.deadline?.toISOString()??null,
      href:status==='PENDING'||status==='IN_PROGRESS'
        ?`/organizations/${activity.organizationId}/activities/${courseId}/runs/${e.runId}/executions/${e.executionId}`:null})
  }
  const order={IN_PROGRESS:0,PENDING:1,EXPIRED:2,UNAVAILABLE:3,COMPLETED:4}
  tasks.sort((a,b)=>order[a.status]-order[b.status]||
    (a.deadline??'9999').localeCompare(b.deadline??'9999')||
    a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))
  const offset=(input.page-1)*input.pageSize
  const hasMore=offset+input.pageSize<tasks.length
  return {list:tasks.slice(offset,offset+input.pageSize),total:tasks.length,page:input.page,
    hasMore,
    truncated:activityRows.length>200||assigned.truncated,
    // Do not expose the next 100-execution batch until every locally sorted
    // page was delivered. Otherwise pageSize=25 can skip 75 unseen tasks.
    nextRunCursor:hasMore?null:assigned.nextCursor}
}

/** One bounded parent inbox. Candidate pagination and the canonical reader
 * both operate on execution (created_at, id), not on Run IDs: one parent
 * may have multiple eligible children/executions in a single Run. We pass
 * the exact execution IDs to the reader so its 100-row limit cannot silently
 * discard rows from the candidate batch.
 */
export async function listCampusParentRunTasks(actor:AuthenticatedPrincipal,cursor?:RunTaskCursor){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='PARENT')
    deny('CAMPUS_PARENT_REQUIRED',403)
  const cursorScope=cursor?Prisma.sql`AND (e."created_at", e."id") < (${cursor.createdAt}::timestamptz, ${cursor.id})`:Prisma.empty
  const candidates=await prisma.$queryRaw<Array<{
    executionId:string;organizationId:string;courseId:string;runId:string
    activityTitle:string;createdAtMicros:string
  }>>`
    SELECT e."id" AS "executionId", ar."organization_id" AS "organizationId",
      ar."course_id" AS "courseId", ar."run_id" AS "runId",
      to_char(e."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtMicros",
      course."title" AS "activityTitle"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id"=e."respondent_actor_snapshot_id"
      AND respondent."organization_id"=e."organization_id" AND respondent."run_id"=e."run_id"
      AND respondent."user_id"=${actor.userId} AND respondent."actor_role"='PARENT'
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."id"=e."subject_actor_snapshot_id"
      AND subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id"
      AND subject."actor_role"='STUDENT'
    JOIN "campus_activity_runs" ar
      ON ar."organization_id"=e."organization_id" AND ar."run_id"=e."run_id"
    JOIN "campus_activities" a ON a."course_id"=ar."course_id"
      AND a."organization_id"=ar."organization_id"
    JOIN "courses" course ON course."id"=a."course_id"
      AND course."course_type"='CAMPUS_ACTIVITY'
    JOIN "organizations" o ON o."id"=ar."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "assessment_runs" r ON r."id"=ar."run_id"
      AND r."organization_id"=ar."organization_id"
    WHERE (
      (a."status"='OPEN'
        AND (r."status"='PUBLISHED' OR (r."status"='CLOSED'
          AND ${boundCompositeContinuationSql(Prisma.sql`e."id"`,actor.userId)}
          AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)}))
        AND EXISTS (
          SELECT 1 FROM "parent_student_relationships" link
          JOIN "campus_student_enrollments" enrollment
            ON enrollment."user_id"=link."student_user_id"
            AND enrollment."organization_id"=ar."organization_id" AND enrollment."status"='APPROVED'
          JOIN "campus_activity_participants" selected
            ON selected."course_id"=ar."course_id"
            AND selected."organization_id"=ar."organization_id" AND selected."status"='ACTIVE'
          JOIN "organization_memberships" member
            ON member."id"=selected."membership_id"
            AND member."organization_id"=ar."organization_id"
            AND member."user_id"=link."student_user_id"
            AND member."valid_from"<=statement_timestamp()
            AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
          WHERE link."parent_user_id"=${actor.userId}
            AND link."student_user_id"=subject."user_id"
            AND link."status"='ACTIVE' AND link."approved_at" IS NOT NULL
            AND link."revoked_at" IS NULL
        )
      )
      OR ${completedSchoolOrdinaryFeedbackSql(Prisma.sql`e."id"`,actor.userId)}
    )
    ${cursorScope}
    ORDER BY e."created_at" DESC, e."id" DESC LIMIT 101
  `
  const allowed=candidates.slice(0,100)
  if(!allowed.length)return {list:[],truncated:false,nextCursor:null as RunTaskCursor|null}
  const official=await listAssignedRunTasks(actor.userId,{
    executionIds:allowed.map(row=>row.executionId),
    preserveBoundSchoolContinuation:true,includeCompletedSchoolFeedback:true,
  })
  const byExecution=new Map(allowed.map(row=>[row.executionId,row]))
  const list=official.list.flatMap(task=>{
    const activity=byExecution.get(task.executionId)
    if(!activity||activity.runId!==task.runId||activity.organizationId!==task.organizationId
      ||task.respondentRole!=='PARENT'||task.subjectRole!=='STUDENT')return []
    return [{
      executionId:task.executionId,runId:task.runId,
      organizationId:activity.organizationId,activityId:activity.courseId,
      activityTitle:activity.activityTitle,runTitle:task.runName,
      status:task.status,deadline:task.deadline?.toISOString()??null,
      ...(task.resourceKey?.startsWith('education-composition:SCHOOL:')?{feedbackNamespace:'EDUCATION_ASSESSMENT' as const,feedbackMode:'COMPOSITION' as const}:{}),
      canResumeExisting:task.canResumeExisting,consentRequired:task.consentRequired,consentPurpose:task.consentPurpose,
      consentVisibility:task.consentVisibility,
      // No child identifiers, reports, psychometric scores or raw responses.
    }]
  })
  const last=allowed[allowed.length-1]
  return {list,truncated:candidates.length>100||official.truncated,
    nextCursor:candidates.length>100&&last?{createdAt:last.createdAtMicros,id:last.executionId}:null}
}
