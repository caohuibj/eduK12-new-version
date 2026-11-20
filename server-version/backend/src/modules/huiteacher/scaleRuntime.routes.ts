import {privateScaleRegistryIdentitySql} from '../assessment-run/educationPrivateScaleIdentitySql'
import { teacherLibraryExecutionBindingMatches } from './libraryScaleExecution'
import { compositeImageController } from '../composite/composite-image.controller'
import { compositeVideoController } from '../composite/composite-video.controller'
import { boundCompositeContinuationSql } from '../assessment-run/boundCompositeContinuation'
import { Router,type Request,type Response,type NextFunction,type RequestHandler } from 'express'
import { z,ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { authenticateHuiteacher } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success,notFound,error } from '../../utils/response'
import {
  checkSingleExecutionPopulationAuthority,
  currentRunPopulationAuthoritySql,
  type SingleExecutionAuthorityEnvelope,
} from '../assessment-run/currentPopulationAuthority'
import { applyBoundedPlannerControls, withBoundedPlannerRead, type PlannerBoundReadDb } from '../assessment-run/plannerBound'
import { canonicalCursorTimestamp,decodeRunTaskCursor,encodeRunTaskCursor,type RunTaskCursor } from '../assessment-run/productRead'
import { startAssessmentRunExecution } from '../assessment-run/startExecution'
import { parseKnownTemplateHashes } from '../composite/whole-start-inline'
import { isAssessmentStartBusyError } from '../composite/start-transient'
import { isAssessmentStartResourceGateError } from '../../services/assessmentResourceProtection'
import {readTeacherPersonalChanges} from '../reporting/teacher-personal-changes.service'
import { readTeacherPersonalScaleReport } from './scalePersonalReport.service'
import { compositeController } from '../composite/composite.controller'
import { relationalRuntimeConsentAuthority } from '../assessment-relational/runtime-consent'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { attachTeacherInlineCurrentUnit, requestedTeacherInlineCurrentUnit } from './inlineCurrentUnit'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const wrap=(work:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await work(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_SCALE_INPUT_INVALID',message:'教师个人测评参数无效',data:null,
    })
    if(isAssessmentStartResourceGateError(e)){
      const preferred=(e as {preferredRetryAfterSeconds?:number}).preferredRetryAfterSeconds
      const retryAfter=typeof preferred==='number'&&Number.isFinite(preferred)&&preferred>0?Math.ceil(preferred):10
      res.setHeader('Retry-After',String(retryAfter))
      return res.status(e.statusCode).json({code:e.code,message:e.message,data:null})
    }
    if(isAssessmentStartBusyError(e)){
      res.setHeader('Retry-After',String(e.retryAfterSeconds))
      return res.status(503).json({code:e.code,message:e.message,data:null})
    }
    const known=e as {statusCode?:number;code?:string}
    if(known&&typeof known.statusCode==='number'
      &&known.statusCode>=400&&known.statusCode<500)
      return res.status(known.statusCode).json({
      code:known.code??'HUITEACHER_SCALE_UNAVAILABLE',
      message:'教师个人测评资格、资源或状态不满足要求',data:null,
    })
    throw e
  }
})

type Allowed={
  executionId:string;organizationId:string;runId:string;attemptId:string|null;
  resourceKey:string;resourceVersion:string;assignmentId:string;
  runtimeBindingKind?:string|null;preloadCompositeId?:string|null;consentFreeFinalReady?:boolean
}
type OwnScaleEnvelopeRow = Allowed & SingleExecutionAuthorityEnvelope & {
  attemptUserId?: string | null
  attemptConsentId?: string | null
  assignmentRespondentId?: string | null
  assignmentStatus?: string | null
  assignmentConsentId?: string | null
  assignmentPolicyDomain?: string | null
  assignmentRespondentRole?: string | null
  visibilityPolicyKey?: string | null
}
async function ownScaleExecution(input:{actorUserId:string;executionId?:string;attemptId?:string;itemId?:string;purpose?:'COLLECTION'|'REPORT_READ'})
  :Promise<Allowed|null>{
  const executionFilter=input.executionId
    ?Prisma.sql`AND execution."id"=${input.executionId}`
    :Prisma.sql`AND execution."runtime_binding_kind"='COMPOSITE'
      AND execution."runtime_binding_ref"=${input.attemptId??''}`
  let row: Allowed | undefined
  if (typeof (prisma as unknown as PlannerBoundReadDb).$transaction === 'function') {
    // Real PostgreSQL path: single PK/unique-index lookup + flat decomposed
    // population authority (generic-plan cacheable, zero force_custom_plan).
    const rows=await prisma.$queryRaw<OwnScaleEnvelopeRow[]>(Prisma.sql`
      SELECT execution."id" AS "executionId",
        execution."organization_id" AS "organizationId",
        execution."run_id" AS "runId",
        execution."track_id" AS "trackId",
        execution."status" AS "executionStatus",
        org."status" AS "orgStatus",
        org."product_domain" AS "orgProductDomain",
        execution."subject_actor_snapshot_id" AS "subjectActorSnapshotId",
        execution."respondent_actor_snapshot_id" AS "respondentActorSnapshotId",
        subject."user_id" AS "subjectUserId",
        subject."actor_role" AS "subjectRole",
        subject."provenance_kind" AS "subjectProvenance",
        subject."membership_id" AS "subjectMembershipId",
        subject."snapshot_payload"->>'personaGrantId' AS "subjectPersonaGrantId",
        actor."user_id" AS "respondentUserId",
        actor."actor_role" AS "respondentRole",
        actor."provenance_kind" AS "respondentProvenance",
        actor."membership_id" AS "respondentMembershipId",
        actor."snapshot_payload"->>'personaGrantId' AS "respondentPersonaGrantId",
        relation."relationship_kind" AS "relationshipKind",
        relation."relationship_ref" AS "relationshipRef",
        relation."snapshot_payload"->'facts'->>'courseId' AS "relationshipCourseId",
        relation."snapshot_payload"->'facts'->>'studentClassAssignmentId' AS "relationshipStudentClassAssignmentId",
        relation."snapshot_payload"->'facts'->>'staffClassAssignmentId' AS "relationshipStaffClassAssignmentId",
        relation."snapshot_payload"->'facts'->>'classUnitId' AS "relationshipClassUnitId",
        track."resource_family" AS "trackResourceFamily",
        track."resource_key" AS "trackResourceKey",
        track."resource_version" AS "trackResourceVersion",
        execution."runtime_binding_kind" AS "runtimeBindingKind",
        execution."runtime_binding_ref" AS "attemptId",
        execution."relational_assignment_id" AS "assignmentId",
        track."resource_key" AS "resourceKey",
        track."resource_version" AS "resourceVersion",
        CASE WHEN track."frozen_resource_policy"->'runtimeLaunchTarget'->>'kind'='COMPOSITE'
          THEN track."frozen_resource_policy"->'runtimeLaunchTarget'->>'ref'
          ELSE NULL END AS "preloadCompositeId",
        parent."user_id" AS "attemptUserId",
        parent."consent_id" AS "attemptConsentId",
        a."respondent_user_id" AS "assignmentRespondentId",
        a."status" AS "assignmentStatus",
        a."consent_id" AS "assignmentConsentId",
        a."policy_domain" AS "assignmentPolicyDomain",
        a."respondent_role" AS "assignmentRespondentRole",
        a."visibility_policy_key" AS "visibilityPolicyKey"
      FROM "assessment_run_executions" execution
      JOIN "organizations" org ON org."id"=execution."organization_id"
      JOIN "assessment_run_tracks" track
        ON track."id"=execution."track_id"
        AND track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."resource_family"='SCALE'
        AND ((track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR track."resource_key" LIKE 'teacher-scale:%:GROUP')
          OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
          OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP'
          OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')
      JOIN "assessment_run_relationship_snapshots" relation ON relation."id"=execution."relationship_snapshot_id"
      JOIN "users" actual_respondent
        ON actual_respondent."id"=${input.actorUserId}
        AND actual_respondent."account_domain"='SCHOOL'
        AND actual_respondent."role" IN ('TEACHER','ADMIN')
        AND actual_respondent."teacher_approved"=TRUE
        AND actual_respondent."is_active"=TRUE AND actual_respondent."is_frozen"=FALSE
      JOIN "assessment_run_actor_snapshots" actor
        ON actor."organization_id"=execution."organization_id"
        AND actor."run_id"=execution."run_id"
        AND actor."id"=execution."respondent_actor_snapshot_id"
        AND actor."user_id"=${input.actorUserId} AND actor."actor_role"='TEACHER'
      JOIN "assessment_run_actor_snapshots" subject
        ON subject."organization_id"=execution."organization_id"
        AND subject."run_id"=execution."run_id"
        AND subject."id"=execution."subject_actor_snapshot_id"
        AND subject."user_id"=${input.actorUserId} AND subject."actor_role"='TEACHER'
      JOIN "huiteacher_evaluation_run_links" link
        ON link."organization_id"=execution."organization_id"
        AND link."run_id"=execution."run_id"
      LEFT JOIN "composite_assessment_attempts" parent
        ON execution."runtime_binding_kind"='COMPOSITE' AND parent."id"=execution."runtime_binding_ref"
      LEFT JOIN "relational_assessment_assignments" a ON a."id"=parent."assignment_ref"
      WHERE TRUE
        ${executionFilter}
      LIMIT 1
    `)
    const candidate=rows[0]
    if(!candidate)return null
    const effectivePurpose=input.purpose==='REPORT_READ'
      &&(candidate.resourceKey.startsWith('library-scale:')||candidate.resourceKey.startsWith('private-scale:'))
      ?'REPORT_READ':'COLLECTION'
    const allowed=await checkSingleExecutionPopulationAuthority(prisma,{
      executionId:candidate.executionId,
      envelope:candidate,
      purpose:effectivePurpose,
      productScope:'HUITEACHER_ONLY',
    })
    if(!allowed)return null
    const consentFreeFinalReady=candidate.attemptUserId===input.actorUserId
      &&candidate.assignmentRespondentId===input.actorUserId
      &&(candidate.assignmentStatus==='STARTED'||candidate.assignmentStatus==='COMPLETED')
      &&candidate.assignmentConsentId===null
      &&candidate.attemptConsentId===null
      &&!(candidate.assignmentPolicyDomain==='ORGANIZATION_RUN'&&(
        candidate.assignmentRespondentRole==='PARENT'
        ||Boolean(candidate.visibilityPolicyKey?.startsWith('observer_'))
      ))
    row={
      executionId:candidate.executionId,
      organizationId:candidate.organizationId,
      runId:candidate.runId,
      attemptId:candidate.attemptId,
      runtimeBindingKind:candidate.runtimeBindingKind,
      preloadCompositeId:candidate.preloadCompositeId,
      resourceKey:candidate.resourceKey,
      resourceVersion:candidate.resourceVersion,
      assignmentId:candidate.assignmentId,
      consentFreeFinalReady,
    }
  } else {
    const populationGate=input.purpose==='REPORT_READ'
      ?Prisma.sql`CASE WHEN (track."resource_key" LIKE 'library-scale:%' OR track."resource_key" LIKE 'private-scale:%')
        THEN ${currentRunPopulationAuthoritySql(Prisma.sql`execution."id"`, 'REPORT_READ', 'HUITEACHER_ONLY')}
        ELSE ${currentRunPopulationAuthoritySql(Prisma.sql`execution."id"`, 'COLLECTION', 'HUITEACHER_ONLY')} END`
      :currentRunPopulationAuthoritySql(Prisma.sql`execution."id"`, 'COLLECTION', 'HUITEACHER_ONLY')
    const rows=await withBoundedPlannerRead(prisma, client => client.$queryRaw<Allowed[]>(Prisma.sql`
      SELECT execution."id" AS "executionId",
        execution."organization_id" AS "organizationId",
        execution."run_id" AS "runId",
        execution."runtime_binding_ref" AS "attemptId",
        execution."relational_assignment_id" AS "assignmentId",
        track."resource_key" AS "resourceKey", track."resource_version" AS "resourceVersion"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_tracks" track
        ON track."id"=execution."track_id"
        AND track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."resource_family"='SCALE'
        AND ((track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR track."resource_key" LIKE 'teacher-scale:%:GROUP')
          OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
          OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP'
          OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')
      JOIN "users" actual_respondent
        ON actual_respondent."id"=${input.actorUserId}
        AND actual_respondent."account_domain"='SCHOOL'
        AND actual_respondent."role" IN ('TEACHER','ADMIN')
        AND actual_respondent."teacher_approved"=TRUE
        AND actual_respondent."is_active"=TRUE AND actual_respondent."is_frozen"=FALSE
      JOIN "assessment_run_actor_snapshots" actor
        ON actor."organization_id"=execution."organization_id"
        AND actor."run_id"=execution."run_id"
        AND actor."id"=execution."respondent_actor_snapshot_id"
        AND actor."user_id"=${input.actorUserId} AND actor."actor_role"='TEACHER'
      JOIN "assessment_run_actor_snapshots" subject
        ON subject."organization_id"=execution."organization_id"
        AND subject."run_id"=execution."run_id"
        AND subject."id"=execution."subject_actor_snapshot_id"
        AND subject."user_id"=${input.actorUserId} AND subject."actor_role"='TEACHER'
      JOIN "huiteacher_evaluation_run_links" link
        ON link."organization_id"=execution."organization_id"
        AND link."run_id"=execution."run_id"
      WHERE ${populationGate}
        ${executionFilter}
      LIMIT 1
    `))
    row=rows[0]
  }
  if(!row)return null
  if((row.resourceKey.startsWith('library-scale:')||row.resourceKey.startsWith('private-scale:')) && !await teacherLibraryExecutionBindingMatches(prisma,{
    ...row,actorUserId:input.actorUserId,itemId:input.itemId,purpose:input.purpose,
  }))return null
  return row
}
/** Same authority the GET /composite-attempts/:attemptId middleware uses. */
async function authorizeCurrentScaleAttempt(input:{
  actorUserId:string
  accountDomain?:string
  attemptId:string
  itemId?:string
}){
  if(input.accountDomain!=='SCHOOL')throw new Error('HUITEACHER_SCALE_ATTEMPT_UNAVAILABLE')
  const proof=await ownScaleExecution({
    actorUserId:input.actorUserId,attemptId:input.attemptId,itemId:input.itemId,
  })
  if(!proof)throw new Error('HUITEACHER_SCALE_ATTEMPT_UNAVAILABLE')
  // On real PostgreSQL, ownScaleExecution already verified org ACTIVE/SCHOOL,
  // HUITEACHER entitlement ACTIVE, current membership, active SCHOOL user, and
  // absence of ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS') denies. Retain the
  // standalone call for mocked DBs where consentFreeFinalReady is omitted.
  if(proof.consentFreeFinalReady===undefined){
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,
      organizationId:proof.organizationId,product:'HUITEACHER',
    })
    if(!scope)throw new Error('HUITEACHER_SCALE_ATTEMPT_UNAVAILABLE')
  }
  return proof
}
async function requireScaleAttempt(req:Request,res:Response,next:NextFunction){
  try{
    const attemptId=uuid.parse(req.params.attemptId)
    if(!req.user)return notFound(res,'教师测评记录不存在')
    const proof=await authorizeCurrentScaleAttempt({
      actorUserId:req.user.userId,accountDomain:req.user.accountDomain,
      attemptId,itemId:req.params.itemId,
    })
    if(proof.consentFreeFinalReady&&res.locals&&typeof res.locals==='object'){
      (res.locals as Record<string,unknown>).teacherConsentFreeFinalReady=true
    }
    next()
  }catch(e){
    if(e instanceof Error&&e.message==='HUITEACHER_SCALE_ATTEMPT_UNAVAILABLE')
      return notFound(res,'教师测评记录不存在')
    next(e)
  }
}
type TeacherScaleTaskRow = {
  createdAtMicros:string
  executionId:string;eventId:string;eventTitle:string;runId:string;
  organizationId:string;status:string;runtimeBindingRef:string|null;
  resourceKey:string;title:string;runStatus:string
}
export async function listOwnTeacherScaleTasks(userId:string,cursor?:RunTaskCursor){
  const limit=100
  // Same microsecond bookmark as respondent run tasks. A Date truncates to
  // milliseconds and drops the other rows inserted in that same transaction.
  const cursorCreatedAt=cursor?canonicalCursorTimestamp(cursor.createdAt):null
  if(cursor&&(cursorCreatedAt===null||!cursor.id))throw new Error('RUN_TASK_CURSOR_INVALID')
  const cursorScope=cursorCreatedAt
    ?Prisma.sql`AND (e."created_at", e."id") < (${cursorCreatedAt}::timestamptz, ${cursor!.id})`
    :Prisma.empty
  const runLegacyQuery=(client:Pick<PlannerBoundReadDb,'$queryRaw'>)=>client.$queryRaw<TeacherScaleTaskRow[]>(Prisma.sql`
    SELECT to_char(e."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtMicros",
      e."id" AS "executionId",event."id" AS "eventId",
      event."title" AS "eventTitle",
      e."run_id" AS "runId",e."organization_id" AS "organizationId",
      e."status",e."runtime_binding_ref" AS "runtimeBindingRef",
      track."resource_key" AS "resourceKey",
      registered."entry"->>'title' AS "title",
      run."status" AS "runStatus"
    FROM "users" current_actor
    JOIN "organization_memberships" m
      ON m."user_id"=current_actor."id"
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=m."organization_id"
      AND persona."membership_id"=m."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    JOIN "organizations" org ON org."id"=m."organization_id"
      AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=org."id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id"=org."id"
      AND respondent."user_id"=${userId}
      AND respondent."actor_role"='TEACHER'
    JOIN "assessment_run_executions" e
      ON e."respondent_actor_snapshot_id"=respondent."id"
      AND e."organization_id"=respondent."organization_id"
      AND e."run_id"=respondent."run_id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id"=e."organization_id"
      AND subject."run_id"=e."run_id"
      AND subject."id"=e."subject_actor_snapshot_id"
      AND subject."actor_role"='TEACHER' AND subject."user_id"=${userId}
    JOIN "assessment_runs" run ON run."organization_id"=e."organization_id"
      AND run."id"=e."run_id"
      AND run."status" IN ('PUBLISHED','CLOSED')
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=e."organization_id"
      AND link."run_id"=e."run_id"
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id" AND event."status" IN ('OPEN','CLOSED')
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=e."organization_id"
      AND track."run_id"=e."run_id" AND track."id"=e."track_id"
      AND track."resource_family"='SCALE'
      AND ((track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR track."resource_key" LIKE 'teacher-scale:%:GROUP')
        OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
        OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP'
        OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')
    JOIN "registered_assessment_resources" registered
      ON registered."resource_key"=track."resource_key"
      AND registered."resource_version"=track."resource_version"
      AND registered."status" IN ('PUBLISHED','RETIRED')
    CROSS JOIN LATERAL (
      SELECT (
        CASE WHEN e."status"<>'COMPLETED'
          AND (run."status"='CLOSED' OR track."resource_key" LIKE 'library-scale:%' OR track."resource_key" LIKE 'private-scale:%')
        THEN ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`, 'COLLECTION', 'HUITEACHER_ONLY')}
        ELSE FALSE END
      ) AS "collectionAuthority"
      OFFSET 0
    ) pop_auth
    WHERE current_actor."id"=${userId}
      AND current_actor."account_domain"='SCHOOL'
      AND current_actor."role" IN ('TEACHER','ADMIN')
      AND current_actor."teacher_approved"=TRUE
      AND current_actor."is_active"=TRUE AND current_actor."is_frozen"=FALSE
      AND e."status" IN ('ASSIGNED','STARTED','COMPLETED')
      AND (e."status"='COMPLETED' OR
        (event."status"='OPEN' AND (run."status"='PUBLISHED'
          OR (run."status"='CLOSED' AND ${boundCompositeContinuationSql(Prisma.sql`e."id"`,userId)}
            AND pop_auth."collectionAuthority"))
          AND registered."status"='PUBLISHED'
          AND (EXISTS (
            SELECT 1 FROM "education_teacher_scale_licenses" license
            WHERE license."organization_id"=e."organization_id"
              AND license."resource_id"=registered."id"
              AND license."status"='ACTIVE'
          ) OR (track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
            AND registered."entry"->'libraryOrigin'->>'product'='TEACHER'
            AND registered."entry"->'libraryOrigin'->>'variantKey'='TEACHER:SELF')
          OR ${privateScaleRegistryIdentitySql({registered:Prisma.sql`registered`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})})
        ))
      AND NOT EXISTS(
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=org."id" AND deny."user_id"=${userId}
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS',
            'HUITEACHER_ACCESS')
          OR (deny."organization_id"=org."id" AND deny."user_id"=${userId}
            AND deny."lifted_at" IS NULL AND deny."permission"='RUN_START'
            AND NOT (e."status"='COMPLETED' AND (track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
              OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')))
      )
    AND ((track."resource_key" NOT LIKE 'library-scale:%' AND track."resource_key" NOT LIKE 'private-scale:%') OR CASE WHEN e."status"='COMPLETED'
        THEN ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`, 'REPORT_READ', 'HUITEACHER_ONLY')}
        ELSE pop_auth."collectionAuthority" END)
    ${cursorScope}
    ORDER BY e."created_at" DESC,e."id" DESC LIMIT ${limit + 1}
  `)
  let rows: TeacherScaleTaskRow[]
  if (typeof (prisma as unknown as PlannerBoundReadDb).$transaction === 'function') {
    rows = await prisma.$transaction(async client => {
      // Single REPEATABLE READ snapshot: verify teacher's live membership/entitlement
      // once, then run a flat generic-plan task query without force_custom_plan or
      // per-row 18-table currentRunPopulationAuthoritySql subqueries.
      const memberships = await client.$queryRaw<Array<{
        organizationId: string
        membershipId: string
        personaGrantId: string
        usableForPopulation: boolean
        hasRunStartDeny: boolean
        hasReportReadDeny: boolean
      }>>(Prisma.sql`
        SELECT DISTINCT
          org."id" AS "organizationId",
          m."id" AS "membershipId",
          persona."id" AS "personaGrantId",
          (NOT current_actor."must_change_password"
            AND (current_actor."expires_at" IS NULL OR current_actor."expires_at" > statement_timestamp())
            AND persona."granted_at" <= statement_timestamp()) AS "usableForPopulation",
          EXISTS (
            SELECT 1 FROM "organization_access_denies" d
            WHERE d."organization_id" = org."id" AND d."user_id" = ${userId}
              AND d."lifted_at" IS NULL AND d."permission" = 'RUN_START'
          ) AS "hasRunStartDeny",
          EXISTS (
            SELECT 1 FROM "organization_access_denies" d
            WHERE d."organization_id" = org."id" AND d."user_id" = ${userId}
              AND d."lifted_at" IS NULL AND d."permission" IN ('REPORT_READ', 'PARTICIPANT_REPORT_READ')
          ) AS "hasReportReadDeny"
        FROM "users" current_actor
        JOIN "organization_memberships" m
          ON m."user_id" = current_actor."id"
          AND m."valid_from" <= statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until" > statement_timestamp())
        JOIN "organization_persona_grants" persona
          ON persona."organization_id" = m."organization_id"
          AND persona."membership_id" = m."id"
          AND persona."persona" = 'TEACHER' AND persona."revoked_at" IS NULL
        JOIN "organizations" org ON org."id" = m."organization_id"
          AND org."status" = 'ACTIVE' AND org."product_domain" = 'SCHOOL'
        JOIN "education_product_entitlements" entitlement
          ON entitlement."organization_id" = org."id"
          AND entitlement."product" = 'HUITEACHER' AND entitlement."status" = 'ACTIVE'
        WHERE current_actor."id" = ${userId}
          AND current_actor."account_domain" = 'SCHOOL'
          AND current_actor."role" IN ('TEACHER', 'ADMIN')
          AND current_actor."teacher_approved" = TRUE
          AND current_actor."is_active" = TRUE AND current_actor."is_frozen" = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM "organization_access_denies" deny
            WHERE deny."organization_id" = org."id" AND deny."user_id" = ${userId}
              AND deny."lifted_at" IS NULL
              AND deny."permission" IN ('*', 'EDUCATION_ACCESS', 'HUITEACHER_ACCESS')
          )
      `)
      if (!memberships.length) return []
      const orgIds = [...new Set(memberships.map(m => m.organizationId))]
      const runStartDeniedOrgIds = [...new Set(memberships.filter(m => m.hasRunStartDeny).map(m => m.organizationId))]
      const collectionTupleKeys = [...new Set(
        memberships
          .filter(m => m.usableForPopulation && !m.hasRunStartDeny)
          .map(m => `${m.organizationId}|${m.membershipId}|${m.personaGrantId}`),
      )]
      const reportTupleKeys = [...new Set(
        memberships
          .filter(m => m.usableForPopulation && !m.hasReportReadDeny)
          .map(m => `${m.organizationId}|${m.membershipId}|${m.personaGrantId}`),
      )]
      // Materialize actor-first candidate executions before joining org-wide
      // evaluation events and registries so PostgreSQL cannot invert the plan
      // across every open run in the organization.
      const fastRows = await client.$queryRaw<Array<TeacherScaleTaskRow & { __needsFallback: boolean }>>(Prisma.sql`
        WITH candidate_execs AS MATERIALIZED (
          SELECT
            e."id",
            e."organization_id",
            e."run_id",
            e."track_id",
            e."subject_actor_snapshot_id",
            e."respondent_actor_snapshot_id",
            e."relationship_snapshot_id",
            e."relational_assignment_id",
            e."status",
            e."runtime_binding_kind",
            e."runtime_binding_ref",
            e."created_at",
            respondent."provenance_kind" AS "respondentProvenanceKind",
            respondent."membership_id" AS "respondentMembershipId",
            respondent."snapshot_payload" AS "respondentSnapshotPayload",
            run."status" AS "runStatus",
            track."resource_family" AS "resourceFamily",
            track."resource_key" AS "resourceKey",
            track."resource_version" AS "resourceVersion",
            track."frozen_resource_policy" AS "frozenResourcePolicy"
          FROM "assessment_run_actor_snapshots" respondent
          JOIN "assessment_run_executions" e
            ON e."respondent_actor_snapshot_id"=respondent."id"
            AND e."organization_id"=respondent."organization_id"
            AND e."run_id"=respondent."run_id"
          JOIN "assessment_runs" run ON run."organization_id"=e."organization_id"
            AND run."id"=e."run_id"
            AND run."status" IN ('PUBLISHED','CLOSED')
          JOIN "assessment_run_tracks" track
            ON track."organization_id"=e."organization_id"
            AND track."run_id"=e."run_id" AND track."id"=e."track_id"
            AND track."resource_family"='SCALE'
            AND ((track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR track."resource_key" LIKE 'teacher-scale:%:GROUP')
              OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
              OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP'
              OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')
          WHERE respondent."organization_id"=ANY(${orgIds}::text[])
            AND respondent."user_id"=${userId}
            AND respondent."actor_role"='TEACHER'
            AND e."status" IN ('ASSIGNED','STARTED','COMPLETED')
            AND (NOT (e."organization_id"=ANY(${runStartDeniedOrgIds}::text[]))
              OR (e."status"='COMPLETED' AND (track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
                OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')))
            ${cursorScope}
        )
        SELECT
          (pop."needsPopAuth" AND NOT pop."selfShape") AS "__needsFallback",
          to_char(e."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtMicros",
          e."id" AS "executionId",event."id" AS "eventId",
          event."title" AS "eventTitle",
          e."run_id" AS "runId",e."organization_id" AS "organizationId",
          e."status",e."runtime_binding_ref" AS "runtimeBindingRef",
          e."resourceKey" AS "resourceKey",
          registered."entry"->>'title' AS "title",
          e."runStatus" AS "runStatus"
        FROM candidate_execs e
        JOIN "assessment_run_actor_snapshots" subject
          ON subject."organization_id"=e."organization_id"
          AND subject."run_id"=e."run_id"
          AND subject."id"=e."subject_actor_snapshot_id"
          AND subject."actor_role"='TEACHER' AND subject."user_id"=${userId}
        JOIN "huiteacher_evaluation_run_links" link
          ON link."organization_id"=e."organization_id"
          AND link."run_id"=e."run_id"
        JOIN "huiteacher_evaluation_events" event
          ON event."organization_id"=link."organization_id"
          AND event."id"=link."event_id" AND event."status" IN ('OPEN','CLOSED')
        JOIN "registered_assessment_resources" registered
          ON registered."resource_key"=e."resourceKey"
          AND registered."resource_version"=e."resourceVersion"
          AND registered."status" IN ('PUBLISHED','RETIRED')
        JOIN "assessment_run_relationship_snapshots" relation
          ON relation."id"=e."relationship_snapshot_id"
        LEFT JOIN "relational_assessment_assignments" a ON a."id"=e."relational_assignment_id"
        LEFT JOIN "composite_assessment_attempts" ca
          ON e."runtime_binding_kind"='COMPOSITE' AND ca."id"=e."runtime_binding_ref" AND ca."user_id"=${userId}
        CROSS JOIN LATERAL (
          SELECT
            (e."resourceKey" LIKE 'library-scale:%'
              OR e."resourceKey" LIKE 'private-scale:%'
              OR (e."status"<>'COMPLETED' AND e."runStatus"='CLOSED')) AS "needsPopAuth",
            (e."subject_actor_snapshot_id"=e."respondent_actor_snapshot_id"
              AND relation."relationship_kind"='SELF'
              AND relation."snapshot_payload"->'facts'->>'courseId' IS NULL
              AND e."respondentProvenanceKind"='ORG_MEMBER') AS "selfShape",
            (e."respondentMembershipId" IS NOT NULL
              AND e."respondentSnapshotPayload"->>'personaGrantId' IS NOT NULL
              AND (e."organization_id" || '|' || e."respondentMembershipId" || '|' || (e."respondentSnapshotPayload"->>'personaGrantId')) = ANY(${collectionTupleKeys}::text[])) AS "collectionTupleOk",
            (e."respondentMembershipId" IS NOT NULL
              AND e."respondentSnapshotPayload"->>'personaGrantId' IS NOT NULL
              AND (e."organization_id" || '|' || e."respondentMembershipId" || '|' || (e."respondentSnapshotPayload"->>'personaGrantId')) = ANY(${reportTupleKeys}::text[])) AS "reportTupleOk",
            (e."status"='STARTED' AND e."runtime_binding_kind"='COMPOSITE'
              AND e."frozenResourcePolicy"->'runtimeLaunchTarget'->>'kind'='COMPOSITE'
              AND a."id" IS NOT NULL AND a."status"='STARTED' AND a."policy_domain"='ORGANIZATION_RUN'
              AND a."respondent_user_id"=${userId} AND a."subject_user_id"=${userId}
              AND a."resource_kind"=e."resourceFamily" AND a."resource_key"=e."resourceKey" AND a."resource_version"=e."resourceVersion"
              AND ca."id" IS NOT NULL AND ca."assignment_ref"=a."id"
              AND ca."user_id"=${userId} AND ca."respondent_user_id"=${userId}
              AND ca."subject_user_id"=a."subject_user_id" AND ca."episode_id"=a."episode_id"
              AND ca."status"='IN_PROGRESS'
              AND ca."composite_assessment_id"=e."frozenResourcePolicy"->'runtimeLaunchTarget'->>'ref'
              AND ((a."consent_id" IS NULL AND ca."consent_id" IS NULL)
                OR EXISTS (
                  SELECT 1 FROM "assessment_attempt_consents" issued
                  JOIN "assessment_attempt_consents" accepted ON accepted."id"=ca."consent_id"
                    AND accepted."accepted_at" IS NOT NULL AND accepted."revoked_at" IS NULL
                    AND accepted."subject_user_id"=issued."subject_user_id"
                    AND accepted."respondent_user_id"=issued."respondent_user_id"
                    AND ((issued."accepted_at" IS NOT NULL AND accepted."id"=issued."id")
                      OR (issued."accepted_at" IS NULL AND accepted."prior_consent_id"=issued."id"))
                  WHERE issued."id"=a."consent_id" AND issued."prior_consent_id" IS NULL
                    AND issued."revoked_at" IS NULL
                    AND issued."subject_user_id"=a."subject_user_id"
                    AND issued."respondent_user_id"=a."respondent_user_id"
                ))) AS "boundContinuation"
        ) pop
        WHERE (
            (pop."needsPopAuth" AND NOT pop."selfShape")
            OR (
              (e."status"='COMPLETED' OR (
                event."status"='OPEN'
                AND (e."runStatus"='PUBLISHED'
                  OR (e."runStatus"='CLOSED' AND pop."boundContinuation" AND pop."collectionTupleOk"
                    AND NOT EXISTS(SELECT 1 FROM "campus_activity_runs" c WHERE c."organization_id"=e."organization_id" AND c."run_id"=e."run_id")))
                AND registered."status"='PUBLISHED'
                AND (EXISTS (
                  SELECT 1 FROM "education_teacher_scale_licenses" license
                  WHERE license."organization_id"=e."organization_id"
                    AND license."resource_id"=registered."id"
                    AND license."status"='ACTIVE'
                ) OR (e."resourceKey" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
                  AND registered."entry"->'libraryOrigin'->>'product'='TEACHER'
                  AND registered."entry"->'libraryOrigin'->>'variantKey'='TEACHER:SELF')
                OR ${privateScaleRegistryIdentitySql({registered:Prisma.sql`registered`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})})
              ))
              AND (
                (e."resourceKey" NOT LIKE 'library-scale:%' AND e."resourceKey" NOT LIKE 'private-scale:%')
                OR (
                  NOT EXISTS(SELECT 1 FROM "campus_activity_runs" c WHERE c."organization_id"=e."organization_id" AND c."run_id"=e."run_id")
                  AND (e."resourceKey" NOT LIKE 'private-scale:%'
                    OR ${privateScaleRegistryIdentitySql({registered:Prisma.sql`registered`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})})
                  AND CASE WHEN e."status"='COMPLETED'
                    THEN pop."reportTupleOk"
                    ELSE (event."status"='OPEN' AND pop."collectionTupleOk") END
                )
              )
            )
          )
        ORDER BY e."created_at" DESC,e."id" DESC LIMIT ${limit + 1}
      `)
      if (fastRows.some(row => row.__needsFallback)) {
        await applyBoundedPlannerControls(client)
        return runLegacyQuery(client)
      }
      return fastRows.map(({ __needsFallback: _needsFallback, ...row }) => row)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  } else {
    rows = await withBoundedPlannerRead(prisma, runLegacyQuery)
  }
  const page=rows.slice(0,limit)
  const hasMore=rows.length>limit
  const last=page[page.length-1]
  return {
    list:page.map(({createdAtMicros:_createdAtMicros,...task})=>task),
    truncated:hasMore,
    nextCursor:hasMore&&last?{createdAt:last.createdAtMicros,id:last.executionId}:null,
  }
}
router.post('/scale-tasks/:executionId/changes',authenticateHuiteacher,wrap(req=>readTeacherPersonalChanges({actorUserId:req.user!.userId,executionId:uuid.parse(req.params.executionId)})))
router.get('/my-scale-tasks',authenticateHuiteacher,asyncHandler(async(req,res)=>{
  // Decode before the query. wrap() would turn RUN_TASK_CURSOR_INVALID into 500,
  // and a forged timestamp must never reach PostgreSQL's ::timestamptz cast.
  const parsed=z.object({cursor:z.string().max(500).optional()}).safeParse(req.query)
  if(!parsed.success)return error(res,'任务游标无效',-1,400)
  let cursor:RunTaskCursor|undefined
  try{cursor=decodeRunTaskCursor(parsed.data.cursor)}
  catch{return error(res,'任务游标无效',-1,400)}
  try{
    const result=await listOwnTeacherScaleTasks(req.user!.userId,cursor)
    return success(res,{
      ...result,
      nextCursor:result.nextCursor?encodeRunTaskCursor(result.nextCursor):null,
    })
  }catch(e){
    if(e instanceof Error&&e.message==='RUN_TASK_CURSOR_INVALID')
      return error(res,'任务游标无效',-1,400)
    throw e
  }
}))
router.post('/run-executions/:executionId/start-scale',
  authenticateHuiteacher,wrap(async req=>{
    const executionId=uuid.parse(req.params.executionId)
    const selected=await ownScaleExecution({
      actorUserId:req.user!.userId,executionId,
    })
    if(!selected)return {state:'WITHHELD' as const}
    if(selected.consentFreeFinalReady===undefined){
      const scope=await resolveEducationProductMemberScope({
        actorUserId:req.user!.userId,
        organizationId:selected.organizationId,product:'HUITEACHER',
      })
      if(!scope)return {state:'WITHHELD' as const}
    }
    const startPreflight=selected.preloadCompositeId!==undefined?{
      organizationId:selected.organizationId,
      runId:selected.runId,
      respondentUserId:req.user!.userId,
      runtimeBindingKind:selected.runtimeBindingKind??null,
      runtimeBindingRef:selected.attemptId,
      preloadCompositeId:selected.preloadCompositeId,
    }:undefined
    const result=await startAssessmentRunExecution({
      executionId,actorUserId:req.user!.userId,
      ...(startPreflight?{startPreflight}:{}),
    })
    if(result.state==='STARTED'&&result.runtimeBindingKind!=='COMPOSITE')
      throw new Error('Expected canonical Scale Composite binding')
    if(result.state!=='STARTED')return result
    const freshlyCreated=(result as {_freshlyCreatedAttempt?:boolean})._freshlyCreatedAttempt===true
    // GET /composite-attempts/:id returns getAttemptState unchanged.
    return attachTeacherInlineCurrentUnit({
      requested:requestedTeacherInlineCurrentUnit(req),
      started:result,
      attemptId:result.runtimeBindingRef,
      actorUserId:req.user!.userId,
      freshlyCreated,
      knownTemplateHashes:parseKnownTemplateHashes(req),
      authorize:async({attemptId,actorUserId})=>{
        // For a freshly created attempt in this same request, ownScaleExecution
        // and startAssessmentRunExecution just verified live execution authority.
        // Avoid repeating the 3-query ownScaleExecution check post-commit while
        // still enforcing consent checks when not proven consent-free.
        if(freshlyCreated&&!result.replayed&&attemptId===result.runtimeBindingRef){
          if(selected.consentFreeFinalReady===true)return
          await relationalRuntimeConsentAuthority.assertCompositeFinal(attemptId,actorUserId)
          return
        }
        await authorizeCurrentScaleAttempt({
          actorUserId,accountDomain:req.user!.accountDomain,attemptId,
        })
      },
      project:state=>state,
    })
  }))
router.get('/composite-attempts/:attemptId',
  authenticateHuiteacher,requireScaleAttempt,compositeController.getAttempt)
const requireTeacherCompositeFinalConsent: RequestHandler=(req,res,next)=>{
  if((res.locals as {teacherConsentFreeFinalReady?:boolean}|undefined)?.teacherConsentFreeFinalReady===true){
    return next()
  }
  // Explicit Express middleware: preserve next() and fail closed on consent.
  void Promise.resolve()
    .then(()=>relationalRuntimeConsentAuthority.assertCompositeFinal(
      req.params.attemptId,req.user!.userId))
    .then(()=>next()).catch(next)
}
router.get('/composite-attempts/:attemptId/items/:itemId/scale/assets/:assetId/content',
  authenticateHuiteacher,requireScaleAttempt,compositeImageController.authenticatedScaleImage)
router.post('/composite-attempts/:attemptId/items/:itemId/scale/items/:itemCode/video-capability',
  authenticateHuiteacher,requireScaleAttempt,compositeVideoController.authenticatedScaleVideo)
router.post('/composite-attempts/:attemptId/items/:itemId/scale/submit',
  authenticateHuiteacher,requireScaleAttempt,requireTeacherCompositeFinalConsent,
  compositeController.submitFinalScale)
router.get('/run-executions/:executionId/personal-summary',
  authenticateHuiteacher,wrap(async req=>{
    const executionId=uuid.parse(req.params.executionId)
    const selected=await ownScaleExecution({
      actorUserId:req.user!.userId,executionId,purpose:'REPORT_READ',
    })
    if(!selected)return {mode:'NONE',state:'WITHHELD'}
    if(selected.consentFreeFinalReady===undefined){
      const scope=await resolveEducationProductMemberScope({
        actorUserId:req.user!.userId,
        organizationId:selected.organizationId,product:'HUITEACHER',
      })
      if(!scope)return {mode:'NONE',state:'WITHHELD'}
    }
    // Reuse the authoritative score/source-disclosure engine, not an
    // ad-hoc re-score of Form options or a manager-owned artifact.
    return readTeacherPersonalScaleReport({
      actorUserId:req.user!.userId,executionId,
    })
  }))
export default router
