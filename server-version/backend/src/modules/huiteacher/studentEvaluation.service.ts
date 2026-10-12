import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolvePublishedTeacherForm, teacherFormResourceRef } from './formRunResource'

export const STUDENT_FEEDBACK_MIN_RESPONDENTS = 10 as const

export class HuiteacherStudentEvaluationError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherStudentEvaluationError'
  }
}
const deny=(code:string,statusCode=409):never=>{
  throw new HuiteacherStudentEvaluationError(code,statusCode)
}
type StaffCandidate={
  eventId:string;teacherUserId:string;staffAssignmentId:string;
  classUnitId:string;formDigest:string
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
          WHERE staff."id"=${config.staffAssignmentId}
            AND staff."organization_id"=${config.organizationId}
            AND staff."class_unit_id"=${config.classUnitId}
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
