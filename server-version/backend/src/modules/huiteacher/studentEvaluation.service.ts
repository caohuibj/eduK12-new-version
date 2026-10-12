import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolvePublishedTeacherForm, teacherFormResourceRef } from './formRunResource'
import {createAssessmentRunDraft,addAssessmentRunTrackDraft} from '../assessment-run/repository'
import {publishAssessmentRun,previewAssessmentRun} from '../assessment-run/publish'
import {assertCurrentRunPublisherBoundary} from '../assessment-run/resourceBoundary'
import {studentFormResourceRef,STUDENT_FORM_PRIVACY_FLOOR} from './studentFormResource'

export const STUDENT_FEEDBACK_MIN_RESPONDENTS = 10 as const

export class HuiteacherStudentEvaluationError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherStudentEvaluationError'
  }
}
function deny(code:string,statusCode=409):never {
  throw new HuiteacherStudentEvaluationError(code,statusCode)
}
type StaffCandidate={
  eventId:string;teacherUserId:string;staffAssignmentId:string;
  classUnitId:string;formDigest:string
}


/**
 * Preview only appointments attached to the exact verified PERSON target.
 * Return no student identity or Huischool psychology relationship.
 */
export async function listHuiteacherStudentEvaluationCandidates(input:{
  actorUserId:string;organizationId:string;eventId:string
}){
  return prisma.$transaction(async tx=>{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('HUITEACHER_STUDENT_EVAL_ADMIN_REQUIRED',403)
    const rows=await tx.$queryRaw<Array<{
      staffAssignmentId:string;classUnitId:string;className:string;
      staffRole:string;targetUserId:string
    }>>`
      SELECT staff."id" AS "staffAssignmentId",unit."id" AS "classUnitId",
        unit."name" AS "className",staff."staff_role" AS "staffRole",
        target."subject_user_id" AS "targetUserId"
      FROM "huiteacher_evaluation_events" event
      JOIN "huiteacher_evaluation_targets" target
        ON target."organization_id"=event."organization_id"
        AND target."id"=event."target_id"
        AND target."kind"='PERSON' AND target."status"='ACTIVE'
        AND target."subject_user_id" IS NOT NULL
      JOIN "organization_memberships" teacher
        ON teacher."organization_id"=event."organization_id"
        AND teacher."user_id"=target."subject_user_id"
        AND teacher."valid_from"<=statement_timestamp()
        AND (teacher."valid_until" IS NULL OR teacher."valid_until">statement_timestamp())
      JOIN "organization_persona_grants" persona
        ON persona."organization_id"=teacher."organization_id"
        AND persona."membership_id"=teacher."id"
        AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
      JOIN "organization_staff_class_assignments" staff
        ON staff."organization_id"=teacher."organization_id"
        AND staff."membership_id"=teacher."id"
        AND staff."valid_from"<=statement_timestamp()
        AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
      JOIN "organization_units" unit
        ON unit."organization_id"=staff."organization_id"
        AND unit."id"=staff."class_unit_id" AND unit."unit_kind"='CLASS'
      WHERE event."organization_id"=${input.organizationId}
        AND event."id"=${input.eventId}
        AND event."kind"='ASSESSMENT' AND event."status"='DRAFT'
      ORDER BY unit."name",staff."id" LIMIT 101
    `
    return {list:rows.slice(0,100),truncated:rows.length>100}
  })
}

/**
 * A student's Teacher evaluation is about exactly one school-verified
 * educator in exactly one active CLASS. This configuration does not permit
 * selecting an arbitrary person by display name or pulling School mental
 * health enrollment, grades or teacher scores.
 *
 * Evaluation participant identities and submissions will be frozen by the
 * standard Assessment Run in the next PR5 stage, NOT by this configuration.
 */
export async function configureHuiteacherStudentEvaluation(input:{
  actorUserId:string;organizationId:string;eventId:string;
  classUnitId:string;staffAssignmentId:string;formId:string
}){
  return prisma.$transaction(async tx=>{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('HUITEACHER_STUDENT_EVAL_ADMIN_REQUIRED',403)
    const configured=await tx.huiteacherStudentEvaluationConfig.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},
      select:{id:true},
    })
    if(configured)deny('HUITEACHER_STUDENT_EVAL_ALREADY_CONFIGURED')
    // A previously created generic SELF Run cannot be retroactively
    // reinterpreted as student evaluation of a teacher.
    const existingRun=await tx.huiteacherEvaluationRunLink.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},select:{runId:true},
    })
    if(existingRun)deny('HUITEACHER_STUDENT_EVAL_PREEXISTING_RUN_FORBIDDEN',403)
    const released=await tx.huiteacherFormInstrument.findFirst({
      where:{id:input.formId,organizationId:input.organizationId,status:'PUBLISHED'},
      select:{id:true,definitionDigest:true},
    })
    if(!released)deny('HUITEACHER_STUDENT_EVAL_FORM_NOT_PUBLISHED',404)
    // Authoritative V2 validator + immutable exact definition; no Survey
    // Researcher project, borrowed standard Scale or teacher SELF Form scoring.
    await resolvePublishedTeacherForm(
      teacherFormResourceRef(released.id,released.definitionDigest),tx)
    const candidates=await tx.$queryRaw<StaffCandidate[]>`
      SELECT event."id" AS "eventId",target."subject_user_id" AS "teacherUserId",
        staff."id" AS "staffAssignmentId",staff."class_unit_id" AS "classUnitId",
        form."definition_digest" AS "formDigest"
      FROM "huiteacher_evaluation_events" event
      JOIN "huiteacher_evaluation_targets" target
        ON target."organization_id"=event."organization_id"
        AND target."id"=event."target_id"
        AND target."kind"='PERSON' AND target."status"='ACTIVE'
        AND target."subject_user_id" IS NOT NULL
      JOIN "organization_staff_class_assignments" staff
        ON staff."id"=${input.staffAssignmentId}
        AND staff."organization_id"=event."organization_id"
        AND staff."class_unit_id"=${input.classUnitId}
        AND staff."staff_role" IN ('TEACHING','HOMEROOM')
        AND staff."valid_from"<=statement_timestamp()
        AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
      JOIN "organization_memberships" member
        ON member."organization_id"=staff."organization_id"
        AND member."id"=staff."membership_id"
        AND member."user_id"=target."subject_user_id"
        AND member."valid_from"<=statement_timestamp()
        AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
      JOIN "organization_persona_grants" persona
        ON persona."organization_id"=member."organization_id"
        AND persona."membership_id"=member."id"
        AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
      JOIN "organization_units" unit
        ON unit."organization_id"=event."organization_id"
        AND unit."id"=staff."class_unit_id" AND unit."unit_kind"='CLASS'
      JOIN "huiteacher_form_instruments" form
        ON form."id"=${input.formId}
        AND form."organization_id"=event."organization_id"
        AND form."status"='PUBLISHED'
      WHERE event."organization_id"=${input.organizationId}
        AND event."id"=${input.eventId}
        AND event."kind"='ASSESSMENT' AND event."status"='DRAFT'
      FOR SHARE OF event,target,staff,member,form
    `
    if(candidates.length!==1)deny('HUITEACHER_STUDENT_EVAL_TEACHER_CLASS_MISMATCH',403)
    const matched=candidates[0]
    const id=randomUUID()
    await tx.huiteacherStudentEvaluationConfig.create({data:{
      id,organizationId:input.organizationId,eventId:input.eventId,
      classUnitId:input.classUnitId,staffAssignmentId:input.staffAssignmentId,
      formId:input.formId,definitionDigest:released.definitionDigest,
      configuredByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,
      action:'HUITEACHER_STUDENT_EVALUATION_SCOPE_FROZEN',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),
      payload:{studentDataDomain:'HUITEACHER',
        staffAssignmentId:input.staffAssignmentId,
        classUnitId:input.classUnitId,formId:input.formId,
        definitionDigest:released.definitionDigest},
    })
    return {id,organizationId:input.organizationId,
      eventId:matched.eventId,classUnitId:matched.classUnitId,
      staffAssignmentId:matched.staffAssignmentId,
      teacherTargetUserId:matched.teacherUserId,formId:input.formId,
      definitionDigest:released.definitionDigest}
  })
}

type StudentConfigReadInput={actorUserId:string;organizationId:string;eventId:string}
async function readStudentConfigInTransaction(
  tx: import('@prisma/client').Prisma.TransactionClient,
  input:StudentConfigReadInput,
){
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('HUITEACHER_STUDENT_EVAL_ADMIN_REQUIRED',403)
    const row=await tx.huiteacherStudentEvaluationConfig.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},
      select:{id:true,organizationId:true,eventId:true,classUnitId:true,
        staffAssignmentId:true,formId:true,definitionDigest:true,createdAt:true},
    })
    if(!row)deny('HUITEACHER_STUDENT_EVAL_NOT_FOUND',404)
    return row
}

export async function readHuiteacherStudentEvaluation(input:StudentConfigReadInput){
  return prisma.$transaction(tx=>readStudentConfigInTransaction(tx,input))
}

/** Read-only eligibility count, not a student roster and not an admission.
 * Teacher-only schools intentionally do not require psychology enrollment.
 */
export async function previewHuiteacherStudentEvaluation(input:{
  actorUserId:string;organizationId:string;eventId:string
}){
  return prisma.$transaction(async tx=>{
    const config=await readStudentConfigInTransaction(tx,input)
    const rows=await tx.$queryRaw<Array<{n:number;staffCurrent:boolean}>>`
      SELECT COUNT(DISTINCT student_user."id")::int AS "n",
        EXISTS(
          SELECT 1 FROM "organization_staff_class_assignments" staff
          JOIN "organization_memberships" teacher_member
            ON teacher_member."organization_id"=staff."organization_id"
            AND teacher_member."id"=staff."membership_id"
            AND teacher_member."valid_from"<=statement_timestamp()
            AND (teacher_member."valid_until" IS NULL
              OR teacher_member."valid_until">statement_timestamp())
          JOIN "organization_persona_grants" teacher_persona
            ON teacher_persona."organization_id"=teacher_member."organization_id"
            AND teacher_persona."membership_id"=teacher_member."id"
            AND teacher_persona."persona"='TEACHER'
            AND teacher_persona."revoked_at" IS NULL
          JOIN "huiteacher_evaluation_events" event
            ON event."organization_id"=staff."organization_id"
            AND event."id"=${config.eventId}
          JOIN "huiteacher_evaluation_targets" target
            ON target."organization_id"=event."organization_id"
            AND target."id"=event."target_id" AND target."kind"='PERSON'
            AND target."status"='ACTIVE'
            AND target."subject_user_id"=teacher_member."user_id"
          WHERE staff."id"=${config.staffAssignmentId}
            AND staff."organization_id"=${config.organizationId}
            AND staff."class_unit_id"=${config.classUnitId}
            AND staff."staff_role" IN ('TEACHING','HOMEROOM')
            AND staff."valid_from"<=statement_timestamp()
            AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
        ) AS "staffCurrent"
      FROM "organization_student_class_assignments" placement
      JOIN "organization_memberships" member
        ON member."organization_id"=placement."organization_id"
        AND member."id"=placement."membership_id"
        AND member."valid_from"<=statement_timestamp()
        AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
      JOIN "organization_persona_grants" persona
        ON persona."organization_id"=member."organization_id"
        AND persona."membership_id"=member."id"
        AND persona."persona"='STUDENT' AND persona."revoked_at" IS NULL
      JOIN "users" student_user ON student_user."id"=member."user_id"
        AND student_user."account_domain"='SCHOOL'
        AND student_user."role"='STUDENT'
        AND student_user."is_active"=TRUE AND student_user."is_frozen"=FALSE
        AND student_user."must_change_password"=FALSE
        AND (student_user."expires_at" IS NULL OR student_user."expires_at">statement_timestamp())
      WHERE placement."organization_id"=${input.organizationId}
        AND placement."class_unit_id"=${config.classUnitId}
        AND placement."valid_from"<=statement_timestamp()
        AND (placement."valid_until" IS NULL OR placement."valid_until">statement_timestamp())
    `
    const count=rows[0]?.n??0
    return {eventId:config.eventId,formId:config.formId,
      classUnitId:config.classUnitId,teacherAssigned:rows[0]?.staffCurrent===true,
      eligibleStudentCount:count,privacyFloor:STUDENT_FEEDBACK_MIN_RESPONDENTS,
      readyForPrivacyProtectedFeedback:rows[0]?.staffCurrent===true
        &&count>=STUDENT_FEEDBACK_MIN_RESPONDENTS,
      note:'当前只计算正式教育学生资格；不使用校园心理测评/审批/成绩。此预览不发布任务，正式资格需在标准 Run 发布时冻结。',
    }
  })
}


/** Single-school atomic draft + exactly one canonical FORM Track.
 * No impersonation of a generic Teacher self-assessment or a School Run.
 */
export async function createHuiteacherStudentEvaluationRun(input:{
  actorUserId:string;organizationId:string;eventId:string;
  intakeDeadline?:Date|null
}){
  if(input.intakeDeadline&&(!Number.isFinite(input.intakeDeadline.getTime())
    ||input.intakeDeadline<=new Date()))
    deny('HUITEACHER_STUDENT_EVAL_DEADLINE_INVALID',400)
  return prisma.$transaction(async tx=>{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('HUITEACHER_STUDENT_EVAL_ADMIN_REQUIRED',403)
    const cfg=await tx.$queryRaw<Array<{
      eventId:string;eventTitle:string;formId:string;definitionDigest:string;
      classUnitId:string;teacherMembershipId:string;teacherUserId:string
    }>>`
      SELECT config."event_id" AS "eventId",event."title" AS "eventTitle",
        config."form_id" AS "formId",
        config."definition_digest" AS "definitionDigest",
        config."class_unit_id" AS "classUnitId",
        teacher."id" AS "teacherMembershipId",teacher."user_id" AS "teacherUserId"
      FROM "huiteacher_student_eval_configs" config
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=config."organization_id"
        AND event."id"=config."event_id"
        AND event."kind"='ASSESSMENT' AND event."status"='DRAFT'
      JOIN "huiteacher_evaluation_targets" target
        ON target."organization_id"=event."organization_id"
        AND target."id"=event."target_id" AND target."kind"='PERSON'
        AND target."status"='ACTIVE'
      JOIN "organization_staff_class_assignments" staff
        ON staff."id"=config."staff_assignment_id"
        AND staff."organization_id"=config."organization_id"
        AND staff."class_unit_id"=config."class_unit_id"
        AND staff."staff_role" IN ('TEACHING','HOMEROOM')
        AND staff."valid_from"<=statement_timestamp()
        AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
      JOIN "organization_memberships" teacher
        ON teacher."id"=staff."membership_id"
        AND teacher."organization_id"=staff."organization_id"
        AND teacher."user_id"=target."subject_user_id"
        AND teacher."valid_from"<=statement_timestamp()
        AND (teacher."valid_until" IS NULL OR teacher."valid_until">statement_timestamp())
      JOIN "organization_persona_grants" persona
        ON persona."membership_id"=teacher."id"
        AND persona."organization_id"=teacher."organization_id"
        AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
      JOIN "huiteacher_form_instruments" form
        ON form."id"=config."form_id"
        AND form."organization_id"=config."organization_id"
        AND form."definition_digest"=config."definition_digest"
        AND form."status"='PUBLISHED'
      WHERE config."organization_id"=${input.organizationId}
        AND config."event_id"=${input.eventId}
      FOR UPDATE OF event
    `
    if(cfg.length!==1)deny('HUITEACHER_STUDENT_EVAL_SOURCE_REVOKED',403)
    const existing=await tx.huiteacherEvaluationRunLink.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},select:{runId:true},
    })
    if(existing)deny('HUITEACHER_STUDENT_EVAL_RUN_EXISTS')
    const current=cfg[0]
    await resolvePublishedTeacherForm(
      teacherFormResourceRef(current.formId,current.definitionDigest),tx)
    const run=await createAssessmentRunDraft({
      tx,organizationId:input.organizationId,createdByUserId:input.actorUserId,
      name:current.eventTitle,intakeDeadline:input.intakeDeadline??null,
    })
    await tx.huiteacherEvaluationRunLink.create({data:{
      organizationId:input.organizationId,eventId:input.eventId,
      runId:run.id,boundByUserId:input.actorUserId,
    }})
    await addAssessmentRunTrackDraft({
      tx,organizationId:input.organizationId,runId:run.id,
      resource:studentFormResourceRef(current.formId,current.definitionDigest),
      subjectSelector:{kind:'CLASS_UNITS',classUnitIds:[current.classUnitId]},
      respondentSelector:{kind:'CLASS_UNITS',classUnitIds:[current.classUnitId]},
      requestedPolicy:{
        targetPolicy:{mode:'SELECTED_CLASS_TEACHERS',
          teacherMembershipIds:[current.teacherMembershipId]},
        subjectRoles:['TEACHER'],respondentRoles:['STUDENT'],
        relationshipKinds:['CLASS_TEACHER_STUDENT'],
        perspectives:['OBSERVER_REPORT'],analysisMode:'COHORT_AGGREGATE',
        visibilityPolicyKey:'HUITEACHER_STUDENT_FEEDBACK_PROTECTED_V1',
        minimumRespondents:STUDENT_FORM_PRIVACY_FLOOR,
      },
    })
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_STUDENT_EVAL_RUN_DRAFT',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),
      payload:{runId:run.id,formId:current.formId,
        classUnitId:current.classUnitId,studentPrivacyFloor:STUDENT_FORM_PRIVACY_FLOOR},
    })
    return {runId:run.id,eventId:input.eventId,status:'DRAFT' as const,
      version:run.version+1,trackCount:1}
  })
}

/** Publication uses the SAME serializable frozen-population transaction as
 * other Assessment Runs. The student source/relationship is reverified there.
 */
export async function previewHuiteacherStudentEvaluationRun(input:{
  actorUserId:string;organizationId:string;eventId:string;expectedVersion:number
}){
  const link=await checkedStudentRun(input)
  if(link.eventStatus!=='DRAFT'&&link.eventStatus!=='OPEN')
    deny('HUITEACHER_STUDENT_EVAL_EVENT_UNAVAILABLE')
  if(link.runStatus!=='DRAFT')deny('HUITEACHER_STUDENT_EVAL_RUN_NOT_DRAFT')
  return previewAssessmentRun({organizationId:input.organizationId,
    runId:link.runId,actorUserId:input.actorUserId,
    expectedVersion:input.expectedVersion})
}
export async function publishHuiteacherStudentEvaluationRun(input:{
  actorUserId:string;organizationId:string;eventId:string;expectedVersion:number
}){
  const link=await checkedStudentRun(input)
  if(link.eventStatus!=='OPEN'||link.runStatus!=='DRAFT')
    deny('HUITEACHER_STUDENT_EVAL_MUST_OPEN_FIRST')
  await assertCurrentRunPublisherBoundary({actorUserId:input.actorUserId,
    organizationId:input.organizationId,runId:link.runId})
  return publishAssessmentRun({organizationId:input.organizationId,
    runId:link.runId,actorUserId:input.actorUserId,
    expectedVersion:input.expectedVersion})
}
async function checkedStudentRun(input:{
  actorUserId:string;organizationId:string;eventId:string
}){
  const scope=await resolveEducationProductMemberScope({
    actorUserId:input.actorUserId,organizationId:input.organizationId,
    product:'HUITEACHER',
  })
  if(!scope?.productAdmin)deny('HUITEACHER_STUDENT_EVAL_ADMIN_REQUIRED',403)
  const rows=await prisma.$queryRaw<Array<{
    runId:string;eventStatus:string;runStatus:string
  }>>`
    SELECT link."run_id" AS "runId",event."status" AS "eventStatus",
      run."status" AS "runStatus"
    FROM "huiteacher_evaluation_run_links" link
    JOIN "huiteacher_student_eval_configs" config
      ON config."organization_id"=link."organization_id"
      AND config."event_id"=link."event_id"
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
    JOIN "assessment_runs" run
      ON run."organization_id"=link."organization_id"
      AND run."id"=link."run_id"
    WHERE link."organization_id"=${input.organizationId}
      AND link."event_id"=${input.eventId}
  `
  if(rows.length!==1)deny('HUITEACHER_STUDENT_EVAL_RUN_NOT_FOUND',404)
  return rows[0]
}
