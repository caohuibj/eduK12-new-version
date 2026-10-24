import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { prisma } from '../../config/database'
import { success } from '../../utils/response'
import { startAssessmentRunExecution } from '../assessment-run/startExecution'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import {
  readOwnHuiteacherFormTask,submitOwnHuiteacherFormFinal,HuiteacherFinalError,
} from './formFinal.service'
import {TEACHER_FORM_RUNTIME_KIND} from './formRunResource'
import {studentFormResourceId} from './studentFormResource'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().guid()
const final=z.object({
  submissionId:z.string().min(16).max(120),
  answers:z.record(z.string(), z.unknown()),
}).strict()
const respond=(task:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await task(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_TASK_INPUT_INVALID',message:'任务参数格式不合法',data:null,
    })
    if(e instanceof HuiteacherFinalError)return res.status(e.statusCode).json({
      code:e.code,message:'当前测评无法完成此操作，请核验任务身份和状态',data:null,
    })
    const known=e as {statusCode?:number;code?:string}
    if(typeof known?.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
      return res.status(known.statusCode).json({code:known.code??'HUITEACHER_RUN_DENIED',
        message:'当前任务无权限或状态不支持此操作',data:null})
    throw e
  }
})

/** Respondents receive only their own released Teacher Form Run assignments.
 * A School/Survey respondent cannot call this through those product sessions.
 */
router.get('/my-form-tasks',authenticateHuiteacher,respond(async req=>{
  const actorId=req.user!.userId
  const rows=await prisma.$queryRaw<Array<{
    executionId:string;runId:string;organizationId:string;
    eventId:string;eventTitle:string;formId:string;formTitle:string;
    status:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null
  }>>`
    SELECT execution."id" AS "executionId",execution."run_id" AS "runId",
      execution."organization_id" AS "organizationId",
      event."id" AS "eventId",event."title" AS "eventTitle",
      form."id" AS "formId",form."title" AS "formTitle",
      execution."status",execution."runtime_binding_kind" AS "runtimeBindingKind",
      execution."runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions" execution
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id"=execution."organization_id"
      AND respondent."run_id"=execution."run_id"
      AND respondent."id"=execution."respondent_actor_snapshot_id"
      AND respondent."user_id"=${actorId} AND respondent."actor_role"='TEACHER'
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."id"=execution."subject_actor_snapshot_id"
      AND subject."user_id"=${actorId} AND subject."actor_role"='TEACHER'
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=execution."organization_id"
      AND track."run_id"=execution."run_id" AND track."id"=execution."track_id"
    JOIN "huiteacher_form_instruments" form
      ON form."organization_id"=track."organization_id"
      AND track."resource_key"='huiteacher-form:'||form."id"
      AND track."resource_version"=form."definition_digest"
      AND form."status"='PUBLISHED'
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=execution."organization_id"
      AND link."run_id"=execution."run_id"
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
      AND event."status" IN ('OPEN','CLOSED')
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=execution."organization_id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    JOIN "organizations" org ON org."id"=execution."organization_id"
      AND org."status"='ACTIVE'
    JOIN "organization_memberships" m
      ON m."organization_id"=org."id"
      AND m."user_id"=${actorId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=m."organization_id"
      AND persona."membership_id"=m."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    WHERE execution."status" IN ('ASSIGNED','STARTED','COMPLETED')
      AND NOT EXISTS(
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=org."id"
          AND deny."user_id"=${actorId} AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS')
      )
    ORDER BY execution."created_at" DESC,execution."id" DESC
    LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}))


/** The Teacher student desk is task-authorized, never a general teacher
 * dashboard. Expose only the teacher's display name, deadlines and own state.
 */
router.get('/my-student-evaluations',authenticateHuiteacher,respond(async req=>{
  if(process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')
    throw new HuiteacherFinalError('HUITEACHER_STUDENT_FEEDBACK_DISABLED',404)
  if(req.user!.role!=='STUDENT')throw new HuiteacherFinalError('HUITEACHER_STUDENT_ONLY',403)
  const actorId=req.user!.userId
  const rows=await prisma.$queryRaw<Array<{
    executionId:string;runId:string;organizationId:string;
    eventId:string;eventTitle:string;teacherName:string;
    formId:string;formTitle:string;deadline:Date|null;
    status:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null
  }>>`
    SELECT execution."id" AS "executionId",execution."run_id" AS "runId",
      execution."organization_id" AS "organizationId",
      event."id" AS "eventId",event."title" AS "eventTitle",
      target."name" AS "teacherName",
      form."id" AS "formId",form."title" AS "formTitle",
      run."intake_deadline" AS "deadline",
      execution."status",execution."runtime_binding_kind" AS "runtimeBindingKind",
      execution."runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions" execution
    JOIN "assessment_runs" run ON run."id"=execution."run_id"
      AND run."organization_id"=execution."organization_id"
      AND run."status" IN ('PUBLISHED','CLOSED')
    JOIN "assessment_run_tracks" track ON track."id"=execution."track_id"
      AND track."run_id"=execution."run_id"
      AND track."organization_id"=execution."organization_id"
      AND track."resource_family"='FORM'
    JOIN "huiteacher_student_eval_configs" cfg
      ON track."resource_key"='huiteacher-student-form:'||cfg."form_id"
      AND track."resource_version"=cfg."definition_digest"
      AND cfg."organization_id"=execution."organization_id"
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=execution."organization_id"
      AND link."run_id"=execution."run_id"
      AND link."event_id"=cfg."event_id"
    JOIN "huiteacher_evaluation_events" event
      ON event."id"=link."event_id"
      AND event."organization_id"=link."organization_id"
      AND event."status" IN ('OPEN','CLOSED')
      AND (event."status"='OPEN' OR execution."status"='COMPLETED')
    JOIN "huiteacher_evaluation_targets" target
      ON target."id"=event."target_id" AND target."organization_id"=event."organization_id"
      AND target."kind"='PERSON'
    JOIN "huiteacher_form_instruments" form
      ON form."id"=cfg."form_id" AND form."organization_id"=cfg."organization_id"
      AND form."status"='PUBLISHED'
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id"=execution."respondent_actor_snapshot_id"
      AND respondent."organization_id"=execution."organization_id"
      AND respondent."run_id"=execution."run_id"
      AND respondent."user_id"=${actorId}
      AND respondent."actor_role"='STUDENT'
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."id"=execution."subject_actor_snapshot_id"
      AND subject."organization_id"=execution."organization_id"
      AND subject."run_id"=execution."run_id"
      AND subject."actor_role"='TEACHER'
      AND subject."user_id"=target."subject_user_id"
    JOIN "assessment_run_relationship_snapshots" relation
      ON relation."id"=execution."relationship_snapshot_id"
      AND relation."relationship_kind"='CLASS_TEACHER_STUDENT'
      AND relation."snapshot_payload"->'facts'->>'staffClassAssignmentId'=cfg."staff_assignment_id"
      AND relation."snapshot_payload"->'facts'->>'classUnitId'=cfg."class_unit_id"
    JOIN "education_product_entitlements" product
      ON product."organization_id"=execution."organization_id"
      AND product."product"='HUITEACHER' AND product."status"='ACTIVE'
    JOIN "organizations" org
      ON org."id"=execution."organization_id" AND org."status"='ACTIVE'
      AND org."product_domain"='SCHOOL'
    JOIN "organization_memberships" member ON member."organization_id"=org."id"
      AND member."user_id"=${actorId}
      AND member."valid_from"<=statement_timestamp()
      AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=member."organization_id"
      AND persona."membership_id"=member."id"
      AND persona."persona"='STUDENT' AND persona."revoked_at" IS NULL
    WHERE execution."status" IN ('ASSIGNED','STARTED','COMPLETED')
      AND (
        execution."status"='COMPLETED'
        OR EXISTS (
          SELECT 1 FROM "organization_student_class_assignments" placement
          JOIN "organization_staff_class_assignments" staff
            ON staff."organization_id"=placement."organization_id"
            AND staff."class_unit_id"=placement."class_unit_id"
          WHERE placement."id"=relation."snapshot_payload"->'facts'->>'studentClassAssignmentId'
            AND staff."id"=cfg."staff_assignment_id"
            AND placement."organization_id"=org."id"
            AND placement."membership_id"=respondent."membership_id"
            AND placement."class_unit_id"=cfg."class_unit_id"
            AND placement."valid_from"<=statement_timestamp()
            AND (placement."valid_until" IS NULL OR placement."valid_until">statement_timestamp())
            AND staff."valid_from"<=statement_timestamp()
            AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
        )
      )
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=org."id"
          AND deny."user_id"=${actorId}
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START'))
    ORDER BY execution."created_at" DESC,execution."id" DESC LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}))

router.post('/run-executions/:executionId/start',authenticateHuiteacher,
  respond(async req=>{
    const executionId=id.parse(req.params.executionId)
    // The generic shared START is permitted only for an exact Teacher-owned
    // immutable Form V2 track and a currently product-authorized participant.
    const scope=await prisma.$queryRaw<Array<{
      organizationId:string;runtimeKind:string;resourceKey:string
    }>>`
      SELECT execution."organization_id" AS "organizationId",
        track."frozen_resource_policy"->'runtimeLaunchTarget'->>'kind' AS "runtimeKind",
        track."resource_key" AS "resourceKey"
      FROM "assessment_run_executions" execution
      JOIN "huiteacher_evaluation_run_links" link
        ON link."organization_id"=execution."organization_id"
        AND link."run_id"=execution."run_id"
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
      WHERE execution."id"=${executionId}
        AND respondent."user_id"=${req.user!.userId}
        AND track."resource_family"='FORM'
      LIMIT 1
    `
    if(!scope.length||scope[0].runtimeKind!==TEACHER_FORM_RUNTIME_KIND)
      throw new HuiteacherFinalError('HUITEACHER_TASK_NOT_FOUND',404)
    const student=studentFormResourceId({family:'FORM',
      key:scope[0].resourceKey,version:'frozen'})
    if(student&&process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')
      throw new HuiteacherFinalError('HUITEACHER_STUDENT_FEEDBACK_DISABLED',404)
    if(student&&req.user!.role!=='STUDENT')
      throw new HuiteacherFinalError('HUITEACHER_STUDENT_ONLY',403)
    if(!student&&req.user!.role==='STUDENT')
      throw new HuiteacherFinalError('HUITEACHER_STUDENT_TASK_UNAUTHORIZED',403)
    const authorized=await resolveEducationProductMemberScope({
      organizationId:scope[0].organizationId,actorUserId:req.user!.userId,
      product:'HUITEACHER',
    })
    if(!authorized)throw new HuiteacherFinalError('HUITEACHER_TASK_UNAUTHORIZED',403)
    return startAssessmentRunExecution({
      actorUserId:req.user!.userId,executionId,
    })
  }))
router.get('/form-attempts/:attemptId/task',authenticateHuiteacher,
  respond(req=>readOwnHuiteacherFormTask({
    actorUserId:req.user!.userId,attemptId:id.parse(req.params.attemptId),
  })))
router.post('/form-attempts/:attemptId/final',authenticateHuiteacher,
  respond(req=>{
    const input=final.parse(req.body)
    return submitOwnHuiteacherFormFinal({
      actorUserId:req.user!.userId,attemptId:id.parse(req.params.attemptId),
      ...input,
    })
  }))
export default router
