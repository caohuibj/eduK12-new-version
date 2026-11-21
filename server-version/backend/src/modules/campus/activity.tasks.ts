import { ordinarySelfWholeEnabled, publishedSelfScaleTrackSql } from '../assessment-run/ordinarySelfWholeAccess'
import { boundCompositeContinuationSql } from '../assessment-run/boundCompositeContinuation'
import {completedSchoolOrdinaryFeedbackSql} from '../assessment-run/completedSchoolFeedback'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { withBoundedPlannerRead } from '../assessment-run/plannerBound'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { lockAndAssertCampusActivityEditor, CampusActivityError } from './activity.service'
import { listAssignedRunTasks, listSchoolStudentRunTasks, type RunTaskCursor } from '../assessment-run/productRead'

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
  page:number;pageSize:number;activityId?:string;kind?:'MEASUREMENT'
  /** Keyset bookmark for the Run-task portion only (same contract as the
   * /inbox reader): assignments and check-ins stay complete within the
   * authorized activity set, while Run tasks past the former hard 100-execution
   * cut become reachable by following nextRunCursor. */
  runCursor?:RunTaskCursor
}) {
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')deny('CAMPUS_STUDENT_REQUIRED',403)
  // Membership, admission and current class/student assignment are all live
  // authority, checked before any task title/content is returned. Use a single
  // REPEATABLE READ snapshot so Query 1 (student eligibility), Query 2 (open
  // activities & linked runs), and Query 3 (Run tasks) observe an identical
  // authority state without forcing PostgreSQL to re-plan 18-table nested
  // EXISTS gates per row under force_custom_plan.
  // Later Run-task batches or MEASUREMENT-only queries consume neither assignments
  // nor check-ins: skip those two reads entirely instead of fetching and discarding them.
  const skipContentTasks = Boolean(input.runCursor) || input.kind === 'MEASUREMENT'
  type CoalescedAssignmentRow = {
    id: string
    courseId: string
    title: string
    deadline: Date | string | null
    tags: string[]
    complete: boolean
  }
  type CoalescedCheckinRow = {
    id: string
    courseId: string
    title: string
    endTime: Date | string | null
    complete: boolean
  }
  const { activityRows, linkedRuns, assignments, checkins, assigned } = await prisma.$transaction(async client => {
    const memberships = await client.$queryRaw<Array<{
      organizationId: string
      membershipId: string
      personaGrantId: string
      accountNotExpired: boolean
    }>>`
      WITH actor_grants AS MATERIALIZED (
        SELECT
          m."user_id" AS "userId",
          m."organization_id" AS "organizationId",
          m."id" AS "membershipId",
          pg."id" AS "personaGrantId",
          (u."expires_at" IS NULL OR u."expires_at" > statement_timestamp()) AS "accountNotExpired"
        FROM "users" u
        JOIN "organization_memberships" m ON m."user_id"=u."id"
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
        JOIN "organizations" o ON o."id"=m."organization_id" AND o."status"='ACTIVE' AND o."product_domain"='SCHOOL'
        JOIN "education_product_entitlements" ent ON ent."organization_id"=o."id"
          AND ent."product"='HUISCHOOL' AND ent."status"='ACTIVE'
        JOIN "organization_persona_grants" pg
          ON pg."organization_id"=m."organization_id"
          AND pg."membership_id"=m."id" AND pg."persona"='STUDENT'
          AND pg."revoked_at" IS NULL AND pg."granted_at"<=statement_timestamp()
        WHERE u."id"=${actor.userId}
          AND u."account_domain"='SCHOOL'
          AND u."role"='STUDENT' AND u."is_active"=TRUE
          AND u."is_frozen"=FALSE AND u."must_change_password"=FALSE
          AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
            WHERE d."organization_id"=o."id" AND d."user_id"=${actor.userId}
              AND d."lifted_at" IS NULL
              AND d."permission" IN ('*','EDUCATION_ACCESS','HUISCHOOL_ACCESS','ACTIVITY_READ','RUN_START'))
      )
      SELECT DISTINCT
        ag."organizationId",
        ag."membershipId",
        ag."personaGrantId",
        ag."accountNotExpired"
      FROM actor_grants ag
      JOIN "campus_student_enrollments" e ON e."user_id"=ag."userId"
        AND e."organization_id"=ag."organizationId" AND e."status"='APPROVED'
      JOIN "campus_class_admissions" ca ON ca."class_unit_id"=e."class_unit_id"
        AND ca."organization_id"=e."organization_id" AND ca."status"='APPROVED'
      JOIN "organization_student_class_assignments" sc
        ON sc."membership_id"=ag."membershipId" AND sc."organization_id"=ag."organizationId"
        AND sc."class_unit_id"=e."class_unit_id"
        AND sc."valid_from"<=statement_timestamp()
        AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    `
    const discoverPublishedSelf = ordinarySelfWholeEnabled()
    if (!memberships.length && !discoverPublishedSelf) {
      return {
        activityRows: [] as CampusActivityForStudent[],
        linkedRuns: [] as Array<{ courseId: string; runId: string }>,
        assignments: [] as CoalescedAssignmentRow[],
        checkins: [] as CoalescedCheckinRow[],
        assigned: { list: [], truncated: false, nextCursor: null as RunTaskCursor | null },
      }
    }
    const organizationIds = [...new Set(memberships.map(m => m.organizationId))]
    const membershipIds = [...new Set(memberships.map(m => m.membershipId))]
    const orgMembershipKeys = [...new Set(memberships.map(m => `${m.organizationId}|${m.membershipId}`))]
    const coalescedActivityAndRuns = await client.$queryRaw<Array<{
      activities: Array<CampusActivityForStudent & { membershipIds: string[] }> | null
      linkedRuns: Array<{
        courseId: string
        runId: string
        organizationId: string
        hasHuiteacherLink: boolean
      }> | null
      assignments: CoalescedAssignmentRow[] | null
      checkins: CoalescedCheckinRow[] | null
    }>>`
      WITH activities AS MATERIALIZED (
        SELECT a."course_id" AS "courseId", a."organization_id" AS "organizationId",
          course."title",
          array_agg(DISTINCT p."membership_id") AS "membershipIds"
        FROM "campus_activity_participants" p
        JOIN "campus_activities" a ON a."course_id"=p."course_id"
          AND a."organization_id"=p."organization_id" AND a."status"='OPEN'
        JOIN "courses" course ON course."id"=a."course_id" AND course."course_type"='CAMPUS_ACTIVITY'
        WHERE p."organization_id" = ANY(${organizationIds}::text[])
          AND p."membership_id" = ANY(${membershipIds}::text[])
          AND p."status"='ACTIVE'
          AND (p."organization_id" || '|' || p."membership_id") = ANY(${orgMembershipKeys}::text[])
          -- A directed activityId lookup filters in the database: an in-memory
          -- filter after LIMIT 201 would wrongly hide an authorized activity that
          -- sorts beyond the first 201 rows.
          ${input.activityId?Prisma.sql`AND a."course_id"=${input.activityId}`:Prisma.empty}
        GROUP BY a."course_id", a."organization_id", course."title"
        ORDER BY a."course_id" LIMIT 201
      ),
      ${discoverPublishedSelf ? Prisma.sql`unlisted_self_executions AS MATERIALIZED (
        -- Bound discovery to this student's assigned runs and discard activities
        -- already found by the live path before opening the frozen track and units.
        SELECT x.track_id, x.relational_assignment_id, x.organization_id, x.run_id, link.course_id
        FROM assessment_run_actor_snapshots actor
        JOIN assessment_run_executions x ON x.respondent_actor_snapshot_id=actor.id AND x.subject_actor_snapshot_id=actor.id
          AND x.organization_id=actor.organization_id AND x.run_id=actor.run_id AND x.status='ASSIGNED'
        JOIN campus_activity_runs link ON link.run_id=x.run_id AND link.organization_id=x.organization_id
        WHERE actor.user_id=${actor.userId} AND actor.actor_role='STUDENT'
          ${input.activityId ? Prisma.sql`AND link.course_id=${input.activityId}` : Prisma.empty}
          AND NOT EXISTS (SELECT 1 FROM activities live WHERE live."courseId"=link.course_id)
      ),
      published_self_activities AS MATERIALIZED (
        SELECT DISTINCT activity.course_id AS "courseId", activity.organization_id AS "organizationId", course.title,
          ARRAY[]::text[] AS "membershipIds"
        FROM unlisted_self_executions x
        JOIN relational_assessment_assignments assignment ON assignment.id=x.relational_assignment_id
          AND assignment.respondent_user_id=${actor.userId} AND assignment.status='OPEN'
        JOIN assessment_runs run ON run.id=x.run_id AND run.organization_id=x.organization_id AND run.status='PUBLISHED'
        JOIN assessment_run_tracks t ON t.id=x.track_id AND t.organization_id=x.organization_id AND t.run_id=x.run_id
          AND ${publishedSelfScaleTrackSql(Prisma.sql`t`, 'SCHOOL')}
        JOIN campus_activities activity ON activity.organization_id=x.organization_id AND activity.course_id=x.course_id
          AND activity.status='OPEN'
        JOIN courses course ON course.id=activity.course_id AND course.course_type='CAMPUS_ACTIVITY'
        ORDER BY activity.course_id LIMIT 201
      ),` : Prisma.empty}
      listed_activities AS MATERIALIZED (
        SELECT * FROM activities
        ${discoverPublishedSelf ? Prisma.sql`UNION ALL SELECT * FROM published_self_activities` : Prisma.empty}
      ),
      linked_runs AS MATERIALIZED (
        SELECT ar."course_id" AS "courseId", ar."run_id" AS "runId",
          ar."organization_id" AS "organizationId",
          EXISTS (
            SELECT 1 FROM "huiteacher_evaluation_run_links" h
            WHERE h."organization_id"=ar."organization_id" AND h."run_id"=ar."run_id"
          ) AS "hasHuiteacherLink"
        FROM listed_activities act
        JOIN "campus_activity_runs" ar ON ar."course_id"=act."courseId"
        JOIN "assessment_runs" r ON r."id"=ar."run_id" AND r."status" IN ('PUBLISHED','CLOSED')
      )
      ${skipContentTasks ? Prisma.empty : Prisma.sql`,
      activity_assignments AS MATERIALIZED (
        SELECT
          asg."id",
          asg."course_id" AS "courseId",
          asg."title",
          asg."deadline",
          COALESCE(asg."tags", ARRAY[]::text[]) AS "tags",
          EXISTS (
            SELECT 1 FROM "submissions" sub
            WHERE sub."assignment_id"=asg."id"
              AND sub."student_id"=${actor.userId}
              AND sub."status" IN ('SUBMITTED','GRADED')
          ) AS "complete"
        FROM activities act
        JOIN "assignments" asg ON asg."course_id"=act."courseId" AND asg."status"='PUBLISHED'
      ),
      activity_checkins AS MATERIALIZED (
        SELECT
          chk."id",
          chk."course_id" AS "courseId",
          chk."title",
          chk."end_time" AS "endTime",
          EXISTS (
            SELECT 1 FROM "checkin_submissions" csub
            WHERE csub."checkin_id"=chk."id"
              AND csub."student_id"=${actor.userId}
          ) AS "complete"
        FROM activities act
        JOIN "checkins" chk ON chk."course_id"=act."courseId"
      )`}
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."courseId") FROM listed_activities a), '[]'::jsonb) AS "activities",
        COALESCE((SELECT jsonb_agg(to_jsonb(lr)) FROM linked_runs lr), '[]'::jsonb) AS "linkedRuns",
        ${skipContentTasks ? Prisma.sql`'[]'::jsonb AS "assignments", '[]'::jsonb AS "checkins"` : Prisma.sql`
          COALESCE((SELECT jsonb_agg(to_jsonb(asg)) FROM activity_assignments asg), '[]'::jsonb) AS "assignments",
          COALESCE((SELECT jsonb_agg(to_jsonb(chk)) FROM activity_checkins chk), '[]'::jsonb) AS "checkins"
        `}
    `
    const activityWithMembers = coalescedActivityAndRuns[0]?.activities ?? []
    const activityRows: CampusActivityForStudent[] = activityWithMembers.map(({ membershipIds: _m, ...row }) => row)
    const ids = activityRows.map(a => a.courseId)
    if (!ids.length) {
      return {
        activityRows,
        linkedRuns: [] as Array<{ courseId: string; runId: string }>,
        assignments: [] as CoalescedAssignmentRow[],
        checkins: [] as CoalescedCheckinRow[],
        assigned: { list: [], truncated: false, nextCursor: null as RunTaskCursor | null },
      }
    }
    const linkedRunRows = coalescedActivityAndRuns[0]?.linkedRuns ?? []
    const linkedRuns = linkedRunRows.map(({ courseId, runId }) => ({ courseId, runId }))
    const assignments = coalescedActivityAndRuns[0]?.assignments ?? []
    const checkins = coalescedActivityAndRuns[0]?.checkins ?? []
    const grantsByOrgMembership = new Map<string, Array<{ personaGrantId: string; accountNotExpired: boolean }>>()
    for (const m of memberships) {
      const key = `${m.organizationId}|${m.membershipId}`
      const bucket = grantsByOrgMembership.get(key)
      if (bucket) bucket.push({ personaGrantId: m.personaGrantId, accountNotExpired: m.accountNotExpired })
      else grantsByOrgMembership.set(key, [{ personaGrantId: m.personaGrantId, accountNotExpired: m.accountNotExpired }])
    }
    const activityMembershipMap = new Map(activityWithMembers.map(a => [a.courseId, a.membershipIds]))
    const verifiedTupleSet = new Set<string>()
    const openSchoolRunSet = new Set<string>()
    for (const link of linkedRunRows) {
      if (link.hasHuiteacherLink) continue
      openSchoolRunSet.add(`${link.organizationId}|${link.runId}`)
      const activeMemberships = activityMembershipMap.get(link.courseId) ?? []
      for (const membershipId of activeMemberships) {
        for (const grant of grantsByOrgMembership.get(`${link.organizationId}|${membershipId}`) ?? []) {
          if (grant.accountNotExpired) {
            verifiedTupleSet.add(`${link.organizationId}|${link.runId}|${membershipId}|${grant.personaGrantId}`)
          }
        }
      }
    }
    const assigned = await listSchoolStudentRunTasks(actor.userId, {
      organizationIds: [...new Set(activityRows.map(a => a.organizationId))],
      runIds: linkedRuns.map(link => link.runId),
      preserveBoundSchoolContinuation: true,
      populationProductScope: 'CAMPUS_ONLY',
      verifiedCampusStudent: {
        verifiedTupleKeys: [...verifiedTupleSet],
        openSchoolRunKeys: [...openSchoolRunSet],
      },
      cursor: input.runCursor,
      db: client,
    })
    return { activityRows, linkedRuns, assignments, checkins, assigned }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  const authorized=activityRows
  const ids=authorized.map(a=>a.courseId)
  if(!ids.length)return {list:[],total:0,page:input.page,hasMore:false,truncated:activityRows.length>200,nextRunCursor:null as RunTaskCursor|null}
  const runMap=new Map(linkedRuns.map(r=>[r.runId,r.courseId]))
  const activityMap=new Map(authorized.map(a=>[a.courseId,a]))
  const tasks:Array<{
    id:string;activityId:string;activityTitle:string;kind:CampusTaskType|'MEASUREMENT'
    title:string;status:'PENDING'|'COMPLETED'|'EXPIRED'|'IN_PROGRESS'|'UNAVAILABLE'
    deadline:string|null;href:string|null;resourceFamily?:string;feedbackNamespace?:'EDUCATION_ASSESSMENT';feedbackMode?:'COMPOSITION'
    receiptOnly?:true;canResumeExisting?:boolean;consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
  }>=[]
  for(const t of assignments){
    const activity=activityMap.get(t.courseId)
    if(!activity)continue
    const complete=Boolean(t.complete)
    const deadlineDate=t.deadline?new Date(t.deadline):null
    const expired=Boolean(deadlineDate&&deadlineDate<=new Date())
    tasks.push({id:t.id,activityId:t.courseId,activityTitle:activity.title,
      kind:(t.tags??[]).includes('CAMPUS_READING')?'READING':'ASSIGNMENT',
      title:t.title,status:complete?'COMPLETED':expired?'EXPIRED':'PENDING',
      deadline:deadlineDate?.toISOString()??null,
      href:expired&&!complete?null:`/activities/${t.courseId}/assignments/${t.id}`})
  }
  for(const t of checkins){
    const activity=activityMap.get(t.courseId)
    if(!activity)continue
    const complete=Boolean(t.complete)
    const endTimeDate=t.endTime?new Date(t.endTime):null
    const expired=Boolean(endTimeDate&&endTimeDate<=new Date())
    tasks.push({id:t.id,activityId:t.courseId,activityTitle:activity.title,
      kind:'CHECKIN',title:t.title,status:complete?'COMPLETED':expired?'EXPIRED':'PENDING',
      deadline:endTimeDate?.toISOString()??null,
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
      ...(e.receiptOnly ? {receiptOnly:true as const}:{}),
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
  // Do not expose the next Run batch until the caller drains this batch's
  // local pages; otherwise advancing early skips tasks after page 1.
  return {list:tasks.slice(offset,offset+input.pageSize),total:tasks.length,page:input.page,
    hasMore,
    truncated:activityRows.length>200||assigned.truncated,
    nextRunCursor:hasMore?null:assigned.nextCursor}
}

/** One bounded parent inbox. Uses the same canonical Run population gate as
 * student tasks; returns no subject name, sensitive scores or FINAL artefacts.
 * Pages use the same microsecond keyset cursor as the shared Run reader; the
 * (created_at, run_id) pair makes the former created_at-only order total.
 */
export async function listCampusParentRunTasks(actor:AuthenticatedPrincipal,cursor?:RunTaskCursor){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='PARENT')
    deny('CAMPUS_PARENT_REQUIRED',403)
  const cursorScope=cursor?Prisma.sql`AND (ar."created_at", ar."run_id") < (${cursor.createdAt}::timestamptz, ${cursor.id})`:Prisma.empty
  const links=await withBoundedPlannerRead(prisma, client => client.$queryRaw<Array<{
    organizationId:string;courseId:string;runId:string;activityTitle:string;createdAtMicros:string
  }>>`
    SELECT ar."organization_id" AS "organizationId",
      ar."course_id" AS "courseId",ar."run_id" AS "runId",
      to_char(ar."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtMicros",
      course."title" AS "activityTitle"
    FROM (
      SELECT DISTINCT child."organization_id"
      FROM "parent_student_relationships" psr
      JOIN "organization_memberships" child ON child."user_id"=psr."student_user_id"
      WHERE psr."parent_user_id"=${actor.userId}
        AND psr."status"='ACTIVE' AND psr."approved_at" IS NOT NULL
    ) parent_orgs
    JOIN "organizations" o ON o."id"=parent_orgs."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "campus_activities" a ON a."organization_id"=o."id"
    JOIN "campus_activity_runs" ar ON ar."organization_id"=a."organization_id"
      AND ar."course_id"=a."course_id"
    JOIN "courses" course ON course."id"=a."course_id"
      AND course."course_type"='CAMPUS_ACTIVITY'
    JOIN "assessment_runs" r ON r."id"=ar."run_id"
      AND r."organization_id"=ar."organization_id"
    -- The whole disjunction is parenthesized so the keyset cursorScope below
    -- AND-joins at the top level; unparenthesized, AND would bind inside the
    -- second branch only and the cursor would never advance page 1's rows.
    WHERE (((a."status"='OPEN' AND (r."status"='PUBLISHED' OR (r."status"='CLOSED' AND EXISTS (
        SELECT 1 FROM "assessment_run_actor_snapshots" eligible_respondent
        JOIN "assessment_run_executions" eligible
          ON eligible."respondent_actor_snapshot_id"=eligible_respondent."id"
          AND eligible."organization_id"=eligible_respondent."organization_id"
          AND eligible."run_id"=eligible_respondent."run_id"
        WHERE eligible_respondent."organization_id"=r."organization_id"
          AND eligible_respondent."user_id"=${actor.userId}
          AND eligible_respondent."run_id"=r."id"
          AND ${boundCompositeContinuationSql(Prisma.sql`eligible."id"`,actor.userId)}
          AND ${currentRunPopulationAuthoritySql(Prisma.sql`eligible."id"`, 'COLLECTION', 'CAMPUS_ONLY')}
      )))) AND EXISTS (
      SELECT 1 FROM "parent_student_relationships" link
      JOIN "organization_memberships" m ON m."organization_id"=ar."organization_id"
        AND m."user_id"=link."student_user_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      JOIN "campus_student_enrollments" e ON e."user_id"=link."student_user_id"
        AND e."organization_id"=ar."organization_id" AND e."status"='APPROVED'
      JOIN "campus_activity_participants" selected ON selected."course_id"=ar."course_id"
        AND selected."organization_id"=ar."organization_id"
        AND selected."membership_id"=m."id" AND selected."status"='ACTIVE'
      WHERE link."parent_user_id"=${actor.userId}
        AND link."status"='ACTIVE' AND link."approved_at" IS NOT NULL
        AND link."revoked_at" IS NULL
    )) OR EXISTS (
      SELECT 1 FROM "assessment_run_actor_snapshots" history_respondent
      JOIN "assessment_run_executions" history_execution
        ON history_execution."respondent_actor_snapshot_id"=history_respondent."id"
        AND history_execution."organization_id"=history_respondent."organization_id"
        AND history_execution."run_id"=history_respondent."run_id"
      WHERE history_respondent."organization_id"=ar."organization_id"
        AND history_respondent."user_id"=${actor.userId}
        AND history_respondent."run_id"=ar."run_id"
        AND ${completedSchoolOrdinaryFeedbackSql(Prisma.sql`history_execution."id"`,actor.userId)}))
      ${cursorScope}
    ORDER BY ar."created_at" DESC, ar."run_id" DESC LIMIT 101
  `)
  const indexed=links.slice(0,100)
  if(!indexed.length)return {list:[],truncated:links.length>100,nextCursor:null as RunTaskCursor|null}
  const tasks=await listAssignedRunTasks(actor.userId,{organizationIds:[...new Set(indexed.map(l=>l.organizationId))],runIds:indexed.map(l=>l.runId),preserveBoundSchoolContinuation:true,includeCompletedSchoolFeedback:true,populationProductScope:'CAMPUS_ONLY'})
  const byRun=new Map(indexed.map(l=>[l.runId,l]))
  const list=tasks.list.filter(t=>byRun.has(t.runId)).map(t=>{
    const activity=byRun.get(t.runId)!
    return {
      executionId:t.executionId,runId:t.runId,
      organizationId:activity.organizationId,activityId:activity.courseId,
      activityTitle:activity.activityTitle,runTitle:t.runName,
      status:t.status,deadline:t.deadline?.toISOString()??null,
      ...(t.resourceKey?.startsWith('education-composition:SCHOOL:')?{feedbackNamespace:'EDUCATION_ASSESSMENT' as const,feedbackMode:'COMPOSITION' as const}:{}),
      canResumeExisting:t.canResumeExisting,consentRequired:t.consentRequired,consentPurpose:t.consentPurpose,
      consentVisibility:t.consentVisibility,
      // No child identifiers, reports, psychometric scores or raw responses.
    }
  })
  const last=indexed[indexed.length-1]
  return {list,truncated:links.length>100||tasks.truncated,
    nextCursor:links.length>100&&last?{createdAt:last.createdAtMicros,id:last.runId}:null}
}
