import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  prepareCanonicalSubmission,assertCanonicalSubmissionPayloadSize,validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { canonicalHash } from '../assessment-runtime/canonical'
import { dryRunSurveyForm,SurveyFinalValidationError } from '../survey/final.compute'
import type { FormDraft } from '../survey/builder.definition'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolvePublishedTeacherForm,teacherFormResourceRef,
  TEACHER_FORM_RUNTIME_KIND } from './formRunResource'

export class HuiteacherFinalError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherFinalError'
  }
}
const fail=(code:string,status=409):never=>{throw new HuiteacherFinalError(code,status)}
type Tx=Prisma.TransactionClient

type TeacherAttemptScope={
  id:string;organizationId:string;runId:string;runExecutionId:string;
  formId:string;respondentUserId:string;definitionDigest:string;
  status:string;completedAt:Date|null;
}
type Scope={
  attempt:TeacherAttemptScope;form:FormDraft;title:string;
  relationalAssignmentId:string;executionStatus:string;
}

/** Shared Teacher identity is required, but Session/cookie and Form rights are
 * product-specific. This read is repeated under write locks at FINAL.
 */
async function exactFormScope(tx:Tx,input:{
  attemptId:string;actorUserId:string;lock:boolean
}):Promise<Scope>{
  const first=await tx.huiteacherFormAttempt.findUnique({
    where:{id:input.attemptId},select:{organizationId:true,runId:true},
  })
  if(!first)fail('HUITEACHER_FORM_ATTEMPT_NOT_FOUND',404)

  // Serialize product suspension and School/Teacher admin changes with FINAL.
  const organization=await tx.$queryRaw<Array<{id:string}>>`
    SELECT o."id" FROM "organizations" o
    JOIN "education_product_entitlements" e
      ON e."organization_id"=o."id"
      AND e."product"='HUITEACHER' AND e."status"='ACTIVE'
    WHERE o."id"=${first.organizationId} AND o."product_domain"='SCHOOL'
      AND o."status"='ACTIVE'
    FOR SHARE OF o,e
  `
  if(!organization.length)fail('HUITEACHER_PRODUCT_NOT_ENABLED',403)
  const membership=await resolveEducationProductMemberScope({
    organizationId:first.organizationId,actorUserId:input.actorUserId,
    product:'HUITEACHER',
  },tx)
  if(!membership)fail('HUITEACHER_ATTEMPT_ACTOR_FORBIDDEN',403)
  const actor=await tx.$queryRaw<Array<{id:string}>>`
    SELECT u."id" FROM "users" u
    JOIN "organization_memberships" m ON m."user_id"=u."id"
      AND m."organization_id"=${first.organizationId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" pg ON pg."membership_id"=m."id"
      AND pg."organization_id"=m."organization_id"
      AND pg."persona"='TEACHER' AND pg."revoked_at" IS NULL
    WHERE u."id"=${input.actorUserId}
      AND u."account_domain"='SCHOOL'
      AND u."role" IN ('TEACHER','ADMIN')
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
    LIMIT 1
  `
  if(!actor.length)fail('HUITEACHER_FORM_RESPONDENT_INELIGIBLE',403)
  const runs=await tx.$queryRaw<Array<{status:string}>>`
    SELECT "status" FROM "assessment_runs"
    WHERE "organization_id"=${first.organizationId} AND "id"=${first.runId}
    FOR SHARE
  `
  if(!runs.length||!['PUBLISHED','CLOSED'].includes(runs[0].status))
    fail('HUITEACHER_FORM_RUN_NOT_AVAILABLE',409)
  const events=await tx.$queryRaw<Array<{status:string}>>`
    SELECT event."status" FROM "huiteacher_evaluation_run_links" link
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
    WHERE link."organization_id"=${first.organizationId}
      AND link."run_id"=${first.runId}
    FOR SHARE OF event
  `
  if(!events.length||!['OPEN','CLOSED'].includes(events[0].status))
    fail('HUITEACHER_FORM_EVENT_UNAVAILABLE',403)
  const current=await tx.$queryRaw<Array<{
    status:string;relationalAssignmentId:string|null;
    respondentUserId:string;runtimeBindingKind:string|null;
    runtimeBindingRef:string|null;resourceKey:string;resourceVersion:string
  }>>`
    SELECT execution."status",
      execution."relational_assignment_id" AS "relationalAssignmentId",
      respondent."user_id" AS "respondentUserId",
      execution."runtime_binding_kind" AS "runtimeBindingKind",
      execution."runtime_binding_ref" AS "runtimeBindingRef",
      track."resource_key" AS "resourceKey",track."resource_version" AS "resourceVersion"
    FROM "assessment_run_executions" execution
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id"=execution."respondent_actor_snapshot_id"
      AND respondent."run_id"=execution."run_id"
      AND respondent."organization_id"=execution."organization_id"
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=execution."organization_id"
      AND track."run_id"=execution."run_id" AND track."id"=execution."track_id"
    WHERE execution."organization_id"=${first.organizationId}
      AND execution."run_id"=${first.runId}
      AND execution."id"=(SELECT "run_execution_id"
        FROM "huiteacher_form_attempts" WHERE "id"=${input.attemptId})
    ${input.lock?Prisma.sql`FOR UPDATE OF execution`:Prisma.empty}
  `
  const exe=current[0]
  if(!exe||exe.respondentUserId!==input.actorUserId||!exe.relationalAssignmentId)
    fail('HUITEACHER_FORM_RESPONDENT_UNAUTHORIZED',403)
  if(exe.runtimeBindingKind!==TEACHER_FORM_RUNTIME_KIND
    ||exe.runtimeBindingRef!==input.attemptId)
    fail('HUITEACHER_FORM_RUNTIME_PROVENANCE_MISMATCH',409)

  const attempts=await tx.$queryRaw<TeacherAttemptScope[]>(Prisma.sql`
    SELECT "id","organization_id" AS "organizationId",
      "run_id" AS "runId","run_execution_id" AS "runExecutionId",
      "form_id" AS "formId","respondent_user_id" AS "respondentUserId",
      "definition_digest" AS "definitionDigest","status",
      "completed_at" AS "completedAt"
    FROM "huiteacher_form_attempts"
    WHERE "id"=${input.attemptId}
      AND "run_execution_id"=(
        SELECT "id" FROM "assessment_run_executions"
        WHERE "id"=${first?Prisma.sql`(SELECT "run_execution_id" FROM "huiteacher_form_attempts" WHERE "id"=${input.attemptId})`:Prisma.sql`''`}
      )
    ${input.lock?Prisma.sql`FOR UPDATE`:Prisma.empty}
  `)
  const attempt=attempts[0]
  if(!attempt||attempt.respondentUserId!==input.actorUserId
    ||attempt.organizationId!==first.organizationId||attempt.runId!==first.runId)
    fail('HUITEACHER_FORM_ATTEMPT_IDENTITY',403)
  if(exe.resourceKey!=='huiteacher-form:'+attempt.formId
    ||exe.resourceVersion!==attempt.definitionDigest)
    fail('HUITEACHER_FORM_FROZEN_RESOURCE_MISMATCH',409)
  const form=await resolvePublishedTeacherForm(
    teacherFormResourceRef(attempt.formId,attempt.definitionDigest),tx)
  if(form.organizationId!==attempt.organizationId)
    fail('HUITEACHER_FORM_CROSS_PRODUCT_SOURCE',403)
  return {
    attempt,form:form.definition as FormDraft,title:form.title,
    relationalAssignmentId:exe.relationalAssignmentId,
    executionStatus:exe.status,
  }
}

export async function readOwnHuiteacherFormTask(input:{
  actorUserId:string;attemptId:string
}){
  return prisma.$transaction(async tx=>{
    const scope=await exactFormScope(tx,{...input,lock:false})
    if(!['STARTED','COMPLETED'].includes(scope.attempt.status))
      fail('HUITEACHER_FORM_TASK_INACTIVE')
    const pages=scope.form.pages.map(page=>({
      pageKey:page.pageKey,title:page.title,questions:page.questions.map(q=>({
        itemKey:q.itemKey,type:q.type,prompt:q.prompt,required:q.required,
        allowRefusal:q.allowRefusal??false,
        options:q.options.map(o=>({optionKey:o.optionKey,label:o.label})),
        rows:q.rows.map(r=>({rowKey:r.rowKey,label:r.label})),
        min:q.min,max:q.max,integerOnly:q.integerOnly,step:q.step,
        precision:q.precision,total:q.total,
        minSelections:q.minSelections,maxSelections:q.maxSelections,
        otherOptionKey:q.otherOptionKey,otherMaxLength:q.otherMaxLength,
        exclusiveOptionKeys:q.exclusiveOptionKeys,
        timeZone:q.timeZone,textValidation:q.textValidation,maxLength:q.maxLength,
        displayIf:q.displayIf,
      }))}))
    return {attemptId:scope.attempt.id,formId:scope.attempt.formId,
      status:scope.attempt.status,title:scope.title,pages,
      reportMode:'COMPLETION_ONLY' as const,
      definitionDigest:scope.attempt.definitionDigest}
  })
}

/** One authoritative FINAL: Survey Form V2 normalization, canonical hash,
 * platform encrypted payload, Run execution & relational assignment completion
 * committed atomically. No plaintext raw answer mirror or scoring.
 */
export async function submitOwnHuiteacherFormFinal(input:{
  actorUserId:string;attemptId:string;submissionId:string;
  answers:Record<string,unknown>
}){
  validateSubmissionId(input.submissionId)
  if(input.submissionId.length>120)
    fail('HUITEACHER_SUBMISSION_ID_TOO_LONG',400)
  const pre=prepareCanonicalSubmission({attemptId:input.attemptId,answers:input.answers})
  assertCanonicalSubmissionPayloadSize(pre,1024*1024,'Teacher Form FINAL')
  return withFinalOnlyCompletionTransaction(async tx=>{
    const scope=await exactFormScope(tx,{actorUserId:input.actorUserId,
      attemptId:input.attemptId,lock:true})
    const canonical=prepareCanonicalSubmission({
      formId:scope.attempt.formId,definitionDigest:scope.attempt.definitionDigest,
      answers:input.answers,
    })
    assertCanonicalSubmissionPayloadSize(canonical,1024*1024,'Teacher Form FINAL')
    const existing=await tx.huiteacherFormFinal.findUnique({
      where:{attemptId:scope.attempt.id},
    })
    if(existing){
      if(existing.submissionId!==input.submissionId||existing.payloadHash!==canonical.hash
        ||existing.definitionDigest!==scope.attempt.definitionDigest)
        fail('HUITEACHER_FINAL_ALREADY_SUBMITTED')
      return {attemptId:scope.attempt.id,receiptId:existing.id,
        completedAt:existing.completedAt,status:'COMPLETED' as const,
        reportMode:'COMPLETION_ONLY' as const,idempotent:true}
    }
    if(scope.attempt.status!=='STARTED'||scope.executionStatus!=='STARTED')
      fail('HUITEACHER_FORM_ATTEMPT_NOT_STARTABLE')
    const status=await tx.$queryRaw<Array<{status:string;respondentUserId:string}>>`
      SELECT "status","respondent_user_id" AS "respondentUserId"
      FROM "relational_assessment_assignments"
      WHERE "id"=${scope.relationalAssignmentId}
        AND "policy_domain"='ORGANIZATION_RUN' FOR UPDATE
    `
    if(status[0]?.status!=='STARTED'
      ||status[0].respondentUserId!==input.actorUserId)
      fail('HUITEACHER_ASSIGNMENT_NOT_ACTIVE',403)
    let validated:ReturnType<typeof dryRunSurveyForm>
    try{
      validated=dryRunSurveyForm(scope.form,input.answers)
    }catch(e){
      if(e instanceof SurveyFinalValidationError)
        throw new HuiteacherFinalError('HUITEACHER_FORM_ANSWER_INVALID',400)
      throw e
    }
    const payload={schemaVersion:1 as const,
      product:'HUITEACHER' as const,kind:'FORM' as const,
      attemptId:scope.attempt.id,formId:scope.attempt.formId,
      definitionDigest:scope.attempt.definitionDigest,
      rawAnswers:validated.rawAnswers,missing:validated.missing,
      privateScoring:null,
    }
    const resultsHash=canonicalHash(payload)
    const resultsCipher=encryptUnifiedRuntimePayload(payload)
    const nowRow=await tx.$queryRaw<Array<{now:Date}>>`
      SELECT transaction_timestamp() AS "now"`
    const now=nowRow[0].now
    const receipt=await tx.huiteacherFormFinal.create({data:{
      id:randomUUID(),organizationId:scope.attempt.organizationId,
      attemptId:scope.attempt.id,submissionId:input.submissionId,
      definitionDigest:scope.attempt.definitionDigest,
      payloadHash:canonical.hash,resultsCipher,resultsHash,completedAt:now,
    }})
    const updated=await tx.huiteacherFormAttempt.updateMany({
      where:{id:scope.attempt.id,status:'STARTED',
        organizationId:scope.attempt.organizationId},
      data:{status:'COMPLETED',completedAt:now},
    })
    if(updated.count!==1)fail('HUITEACHER_FINAL_STATE_CONFLICT')
    const done=await tx.$executeRaw`
      UPDATE "assessment_run_executions" SET "status"='COMPLETED',
        "completed_at"=${now},"updated_at"=${now}
      WHERE "id"=${scope.attempt.runExecutionId}
        AND "organization_id"=${scope.attempt.organizationId}
        AND "status"='STARTED'
        AND "runtime_binding_kind"=${TEACHER_FORM_RUNTIME_KIND}
        AND "runtime_binding_ref"=${scope.attempt.id}
    `
    if(Number(done)!==1)fail('HUITEACHER_FINAL_RUN_CONFLICT')
    const completed=await tx.$executeRaw`
      UPDATE "relational_assessment_assignments"
      SET "status"='COMPLETED',"completed_at"=${now},
        "updated_at"=${now}
      WHERE "id"=${scope.relationalAssignmentId}
        AND "status"='STARTED' AND "policy_domain"='ORGANIZATION_RUN'
        AND "respondent_user_id"=${input.actorUserId}
    `
    if(Number(completed)!==1)fail('HUITEACHER_FINAL_ASSIGNMENT_CONFLICT')
    return {attemptId:scope.attempt.id,receiptId:receipt.id,completedAt:now,
      status:'COMPLETED' as const,reportMode:'COMPLETION_ONLY' as const,
      idempotent:false}
  })
}
