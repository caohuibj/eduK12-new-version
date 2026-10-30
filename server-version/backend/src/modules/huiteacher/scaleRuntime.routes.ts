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
import { success,notFound } from '../../utils/response'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { startAssessmentRunExecution } from '../assessment-run/startExecution'
import {readTeacherPersonalChanges} from '../reporting/teacher-personal-changes.service'
import { readTeacherPersonalScaleReport } from './scalePersonalReport.service'
import { compositeController } from '../composite/composite.controller'
import { relationalRuntimeConsentAuthority } from '../assessment-relational/runtime-consent'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const wrap=(work:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await work(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_SCALE_INPUT_INVALID',message:'教师个人测评参数无效',data:null,
    })
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

type Allowed={executionId:string;organizationId:string;runId:string;attemptId:string|null;resourceKey:string;resourceVersion:string;assignmentId:string}
async function ownScaleExecution(input:{actorUserId:string;executionId?:string;attemptId?:string;itemId?:string;purpose?:'COLLECTION'|'REPORT_READ'})
  :Promise<Allowed|null>{
  const executionFilter=input.executionId
    ?Prisma.sql`AND execution."id"=${input.executionId}`
    :Prisma.sql`AND execution."runtime_binding_kind"='COMPOSITE'
      AND execution."runtime_binding_ref"=${input.attemptId??''}`
  const rows=await prisma.$queryRaw<Allowed[]>(Prisma.sql`
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
      AND (track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL'
        OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
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
    WHERE CASE WHEN (track."resource_key" LIKE 'library-scale:%' OR track."resource_key" LIKE 'private-scale:%') AND ${input.purpose === 'REPORT_READ'}
      THEN ${currentRunPopulationAuthoritySql(Prisma.sql`execution."id"`, 'REPORT_READ')}
      ELSE ${currentRunPopulationAuthoritySql(Prisma.sql`execution."id"`)} END
      ${executionFilter}
    LIMIT 1
  `)
  const row=rows[0]
  if(!row)return null
  if((row.resourceKey.startsWith('library-scale:')||row.resourceKey.startsWith('private-scale:')) && !await teacherLibraryExecutionBindingMatches(prisma,{
    ...row,actorUserId:input.actorUserId,itemId:input.itemId,purpose:input.purpose,
  }))return null
  return row
}
async function requireScaleAttempt(req:Request,res:Response,next:NextFunction){
  try{
    const attemptId=uuid.parse(req.params.attemptId)
    if(!req.user||req.user.accountDomain!=='SCHOOL')
      return notFound(res,'教师测评记录不存在')
    const proof=await ownScaleExecution({
      actorUserId:req.user.userId,attemptId,itemId:req.params.itemId,
    })
    if(!proof)return notFound(res,'教师测评记录不存在')
    const scope=await resolveEducationProductMemberScope({
      actorUserId:req.user.userId,
      organizationId:proof.organizationId,product:'HUITEACHER',
    })
    if(!scope)return notFound(res,'教师测评记录不存在')
    next()
  }catch(e){next(e)}
}
export async function listOwnTeacherScaleTasks(userId:string){
  const rows=await prisma.$queryRaw<Array<{
    executionId:string;eventId:string;eventTitle:string;runId:string;
    organizationId:string;status:string;runtimeBindingRef:string|null;
    resourceKey:string;title:string;runStatus:string
  }>>`
    SELECT e."id" AS "executionId",event."id" AS "eventId",
      event."title" AS "eventTitle",
      e."run_id" AS "runId",e."organization_id" AS "organizationId",
      e."status",e."runtime_binding_ref" AS "runtimeBindingRef",
      track."resource_key" AS "resourceKey",
      registered."entry"->>'title' AS "title",
      run."status" AS "runStatus"
    FROM "assessment_run_executions" e
    JOIN "assessment_runs" run ON run."organization_id"=e."organization_id"
      AND run."id"=e."run_id"
      AND run."status" IN ('PUBLISHED','CLOSED')
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=e."organization_id"
      AND track."run_id"=e."run_id" AND track."id"=e."track_id"
      AND track."resource_family"='SCALE'
      AND (track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL'
        OR track."resource_key" LIKE 'library-scale:%:TEACHER:TEACHER:SELF'
        OR track."resource_key" LIKE 'private-scale:TEACHER:%:TEACHER:SELF')
    JOIN "registered_assessment_resources" registered
      ON registered."resource_key"=track."resource_key"
      AND registered."resource_version"=track."resource_version"
      AND registered."status" IN ('PUBLISHED','RETIRED')
    JOIN "users" current_actor
      ON current_actor."id"=${userId}
      AND current_actor."account_domain"='SCHOOL'
      AND current_actor."role" IN ('TEACHER','ADMIN')
      AND current_actor."teacher_approved"=TRUE
      AND current_actor."is_active"=TRUE AND current_actor."is_frozen"=FALSE
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id"=e."organization_id"
      AND respondent."run_id"=e."run_id"
      AND respondent."id"=e."respondent_actor_snapshot_id"
      AND respondent."actor_role"='TEACHER'
      AND respondent."user_id"=${userId}
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
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=e."organization_id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    JOIN "organizations" org ON org."id"=e."organization_id"
      AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
    JOIN "organization_memberships" m
      ON m."organization_id"=org."id" AND m."user_id"=${userId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=m."organization_id"
      AND persona."membership_id"=m."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    WHERE e."status" IN ('ASSIGNED','STARTED','COMPLETED')
      AND (e."status"='COMPLETED' OR
        (event."status"='OPEN' AND (run."status"='PUBLISHED'
          OR (run."status"='CLOSED' AND ${boundCompositeContinuationSql(Prisma.sql`e."id"`,userId)}
            AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)}))
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
        THEN ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`, 'REPORT_READ')}
        ELSE ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)} END)
    ORDER BY e."created_at" DESC,e."id" DESC LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}
router.post('/scale-tasks/:executionId/changes',authenticateHuiteacher,wrap(req=>readTeacherPersonalChanges({actorUserId:req.user!.userId,executionId:uuid.parse(req.params.executionId)})))
router.get('/my-scale-tasks',authenticateHuiteacher,wrap(async req=>
  listOwnTeacherScaleTasks(req.user!.userId)))
router.post('/run-executions/:executionId/start-scale',
  authenticateHuiteacher,wrap(async req=>{
    const executionId=uuid.parse(req.params.executionId)
    const selected=await ownScaleExecution({
      actorUserId:req.user!.userId,executionId,
    })
    if(!selected)return {state:'WITHHELD' as const}
    const scope=await resolveEducationProductMemberScope({
      actorUserId:req.user!.userId,
      organizationId:selected.organizationId,product:'HUITEACHER',
    })
    if(!scope)return {state:'WITHHELD' as const}
    const result=await startAssessmentRunExecution({
      executionId,actorUserId:req.user!.userId,
    })
    if(result.state==='STARTED'&&result.runtimeBindingKind!=='COMPOSITE')
      throw new Error('Expected canonical Scale Composite binding')
    return result
  }))
router.get('/composite-attempts/:attemptId',
  authenticateHuiteacher,requireScaleAttempt,compositeController.getAttempt)
const requireTeacherCompositeFinalConsent: RequestHandler=(req,_res,next)=>{
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
    const scope=await resolveEducationProductMemberScope({
      actorUserId:req.user!.userId,
      organizationId:selected.organizationId,product:'HUITEACHER',
    })
    if(!scope)return {mode:'NONE',state:'WITHHELD'}
    // Reuse the authoritative score/source-disclosure engine, not an
    // ad-hoc re-score of Form options or a manager-owned artifact.
    return readTeacherPersonalScaleReport({
      actorUserId:req.user!.userId,executionId,
    })
  }))
export default router
