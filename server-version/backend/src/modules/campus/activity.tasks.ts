import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { lockAndAssertCampusActivityEditor, CampusActivityError } from './activity.service'
import { listAssignedRunTasks } from '../assessment-run/productRead'

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
          AND d."lifted_at" IS NULL AND d."permission" IN ('*','ACTIVITY_READ','RUN_START'))
    ORDER BY a."course_id" LIMIT 201
  `
  const authorized=input.activityId?activityRows.filter(a=>a.courseId===input.activityId):activityRows
  const ids=authorized.map(a=>a.courseId)
  if(!ids.length)return {list:[],total:0,page:input.page,hasMore:false,truncated:activityRows.length>200}
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
      JOIN "assessment_runs" r ON r."id"=ar."run_id" AND r."status"='PUBLISHED'
      WHERE ar."course_id" IN (${ids.length?Prisma.join(ids):Prisma.sql`NULL`})
    `,
  ])
  const assigned=await listAssignedRunTasks(actor.userId,{
    runIds:linkedRuns.map(link=>link.runId),
  })
  const runMap=new Map(linkedRuns.map(r=>[r.runId,r.courseId]))
  const activityMap=new Map(authorized.map(a=>[a.courseId,a]))
  const tasks:Array<{
    id:string;activityId:string;activityTitle:string;kind:CampusTaskType|'MEASUREMENT'
    title:string;status:'PENDING'|'COMPLETED'|'EXPIRED'|'IN_PROGRESS'|'UNAVAILABLE'
    deadline:string|null;href:string|null
  }>=[]
  for(const t of assignments){
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
  for(const t of checkins){
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
      kind:'MEASUREMENT',title:e.runName,status,
      deadline:e.deadline?.toISOString()??null,
      href:status==='PENDING'||status==='IN_PROGRESS'
        ?`/organizations/${activity.organizationId}/activities/${courseId}/runs/${e.runId}/executions/${e.executionId}`:null})
  }
  const order={IN_PROGRESS:0,PENDING:1,EXPIRED:2,UNAVAILABLE:3,COMPLETED:4}
  tasks.sort((a,b)=>order[a.status]-order[b.status]||
    (a.deadline??'9999').localeCompare(b.deadline??'9999')||
    a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))
  const offset=(input.page-1)*input.pageSize
  return {list:tasks.slice(offset,offset+input.pageSize),total:tasks.length,page:input.page,
    hasMore:offset+input.pageSize<tasks.length,
    truncated:activityRows.length>200||assigned.truncated}
}

/** One bounded parent inbox. Uses the same canonical Run population gate as
 * student tasks; returns no subject name, sensitive scores or FINAL artefacts.
 */
export async function listCampusParentRunTasks(actor:AuthenticatedPrincipal){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='PARENT')
    deny('CAMPUS_PARENT_REQUIRED',403)
  const links=await prisma.$queryRaw<Array<{
    organizationId:string;courseId:string;runId:string;activityTitle:string
  }>>`
    SELECT ar."organization_id" AS "organizationId",
      ar."course_id" AS "courseId",ar."run_id" AS "runId",
      course."title" AS "activityTitle"
    FROM "campus_activity_runs" ar
    JOIN "campus_activities" a ON a."course_id"=ar."course_id"
      AND a."organization_id"=ar."organization_id" AND a."status"='OPEN'
    JOIN "courses" course ON course."id"=a."course_id"
      AND course."course_type"='CAMPUS_ACTIVITY'
    JOIN "organizations" o ON o."id"=ar."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "assessment_runs" r ON r."id"=ar."run_id"
      AND r."organization_id"=ar."organization_id" AND r."status"='PUBLISHED'
    WHERE EXISTS (
      SELECT 1 FROM "parent_student_relationships" link
      JOIN "campus_student_enrollments" e ON e."user_id"=link."student_user_id"
        AND e."organization_id"=ar."organization_id" AND e."status"='APPROVED'
      JOIN "campus_activity_participants" selected ON selected."course_id"=ar."course_id"
        AND selected."organization_id"=ar."organization_id" AND selected."status"='ACTIVE'
      JOIN "organization_memberships" m ON m."id"=selected."membership_id"
        AND m."organization_id"=ar."organization_id"
        AND m."user_id"=link."student_user_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      WHERE link."parent_user_id"=${actor.userId}
        AND link."status"='ACTIVE' AND link."approved_at" IS NOT NULL
        AND link."revoked_at" IS NULL
    )
    ORDER BY ar."created_at" DESC LIMIT 101
  `
  const indexed=links.slice(0,100)
  if(!indexed.length)return {list:[],truncated:links.length>100}
  const tasks=await listAssignedRunTasks(actor.userId,{runIds:indexed.map(l=>l.runId)})
  const byRun=new Map(indexed.map(l=>[l.runId,l]))
  const list=tasks.list.filter(t=>byRun.has(t.runId)).map(t=>{
    const activity=byRun.get(t.runId)!
    return {
      executionId:t.executionId,runId:t.runId,
      organizationId:activity.organizationId,activityId:activity.courseId,
      activityTitle:activity.activityTitle,runTitle:t.runName,
      status:t.status,deadline:t.deadline?.toISOString()??null,
      // No child identifiers, reports, psychometric scores or raw responses.
    }
  })
  return {list,truncated:links.length>100||tasks.truncated}
}
