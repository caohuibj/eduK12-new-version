import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {resolvePublishedTeacherForm,teacherFormResourceRef} from './formRunResource'
import {STUDENT_FORM_PRIVACY_FLOOR} from './studentFormResource'
import {createProtectedFormItems,recordProtectedFormAnswers,
  discloseProtectedFormItems} from './groupReport.service'
import type {FormDraft} from '../survey/builder.definition'

export class StudentFeedbackReportError extends Error{
  constructor(public readonly code:string,public readonly statusCode=403){
    super(code);this.name='StudentFeedbackReportError'
  }
}
function deny(code:string,status=403):never {throw new StudentFeedbackReportError(code,status)}
const MAX_FINALS=2500
const PAGE_SIZE=50
const COMPLEMENT_FLOOR=5
type FinalPayload={
  schemaVersion:1;product:'HUITEACHER';kind:'FORM';attemptId:string;
  formId:string;definitionDigest:string;rawAnswers:Record<string,unknown>;
  missing:Array<{itemKey:string;reason:string}>;privateScoring:null
}
type Source={
  runId:string;eventStatus:string;runStatus:string;
  targetUserId:string;targetName:string;eventTitle:string;
  formId:string;formTitle:string;definitionDigest:string;
  classUnitId:string;deadline:Date|null
}

/** Fixed, unfiltered, read-closed disclosure only.
 * N and n are based on the exact frozen Run. Partial response is accepted
 * only if both respondent and nonrespondent populations are independently
 * large enough. No per-student status, filters, respondent IDs, text, dates
 * or timestamps are returned.
 *
 * V1 deliberately allows at most ONE RELEASED run per target teacher/school
 * across classes, form changes or waves. This conservative ledger prevents
 * subtraction/differencing until a reviewed PR6 longitudinal policy exists.
 */
export async function readHuiteacherStudentFeedbackReport(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    const member=await resolveEducationProductMemberScope({
      organizationId:input.organizationId,actorUserId:input.actorUserId,
      product:'HUITEACHER',
    },tx)
    if(!member)deny('STUDENT_REPORT_PRODUCT_FORBIDDEN')
    const sources=await tx.$queryRaw<Source[]>`
      SELECT link."run_id" AS "runId",event."status" AS "eventStatus",
        run."status" AS "runStatus",target."subject_user_id" AS "targetUserId",
        target."name" AS "targetName",event."title" AS "eventTitle",
        form."id" AS "formId",form."title" AS "formTitle",
        form."definition_digest" AS "definitionDigest",
        cfg."class_unit_id" AS "classUnitId",run."intake_deadline" AS "deadline"
      FROM "huiteacher_evaluation_run_links" link
      JOIN "huiteacher_student_eval_configs" cfg
        ON cfg."organization_id"=link."organization_id"
        AND cfg."event_id"=link."event_id"
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=link."organization_id"
        AND event."id"=link."event_id"
        AND event."kind"='ASSESSMENT'
      JOIN "assessment_runs" run
        ON run."organization_id"=link."organization_id"
        AND run."id"=link."run_id"
      JOIN "huiteacher_evaluation_targets" target
        ON target."organization_id"=link."organization_id"
        AND target."id"=event."target_id"
        AND target."kind"='PERSON'
      JOIN "huiteacher_form_instruments" form
        ON form."organization_id"=cfg."organization_id"
        AND form."id"=cfg."form_id"
        AND form."definition_digest"=cfg."definition_digest"
        AND form."status"='PUBLISHED'
      JOIN "education_product_entitlements" entitlement
        ON entitlement."organization_id"=link."organization_id"
        AND entitlement."product"='HUITEACHER'
        AND entitlement."status"='ACTIVE'
      WHERE link."organization_id"=${input.organizationId}
        AND link."event_id"=${input.eventId}
      FOR SHARE OF event,run,form,entitlement
    `
    const source=sources[0]
    if(sources.length!==1||!source)deny('STUDENT_REPORT_SOURCE_UNAVAILABLE',404)
    const entitledTeacher=source.targetUserId===input.actorUserId
      &&(await tx.$queryRaw<Array<{id:string}>>`
        SELECT persona."id" FROM "organization_persona_grants" persona
        JOIN "organization_memberships" membership
          ON membership."id"=persona."membership_id"
          AND membership."organization_id"=persona."organization_id"
          AND membership."user_id"=${input.actorUserId}
          AND membership."valid_from"<=statement_timestamp()
          AND (membership."valid_until" IS NULL OR membership."valid_until">statement_timestamp())
        JOIN "users" teacher ON teacher."id"=membership."user_id"
          AND teacher."role" IN ('TEACHER','ADMIN')
          AND teacher."teacher_approved"=TRUE
        WHERE persona."organization_id"=${input.organizationId}
          AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
      `).length>0
    if(!member.productAdmin&&!entitledTeacher)deny('STUDENT_REPORT_AUDIENCE_FORBIDDEN')
    if(source.eventStatus!=='CLOSED'||source.runStatus!=='CLOSED')
      deny('STUDENT_REPORT_NOT_CLOSED',409)
    const form=await resolvePublishedTeacherForm(
      teacherFormResourceRef(source.formId,source.definitionDigest),tx)
    if(form.organizationId!==input.organizationId)
      deny('STUDENT_REPORT_FORM_MISMATCH')
    const totals=await tx.$queryRaw<Array<{
      assigned:number;students:number;completed:number
    }>>`
      SELECT COUNT(*)::int AS "assigned",
        COUNT(DISTINCT respondent."user_id")::int AS "students",
        COUNT(*) FILTER (WHERE execution."status"='COMPLETED')::int AS "completed"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."run_id"=execution."run_id"
        AND respondent."organization_id"=execution."organization_id"
        AND respondent."actor_role"='STUDENT'
      JOIN "assessment_run_actor_snapshots" subject
        ON subject."id"=execution."subject_actor_snapshot_id"
        AND subject."run_id"=execution."run_id"
        AND subject."organization_id"=execution."organization_id"
        AND subject."actor_role"='TEACHER'
        AND subject."user_id"=${source.targetUserId}
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
        AND track."resource_key"='huiteacher-student-form:'||${source.formId}
        AND track."resource_version"=${source.definitionDigest}
      WHERE execution."organization_id"=${input.organizationId}
        AND execution."run_id"=${source.runId}
    `
    const assigned=totals[0]?.assigned??0
    const n=totals[0]?.completed??0
    if(assigned<STUDENT_FORM_PRIVACY_FLOOR||assigned>MAX_FINALS
      ||totals[0]?.students!==assigned)
      deny('STUDENT_REPORT_INVALID_FROZEN_POPULATION')
    if(n<STUDENT_FORM_PRIVACY_FLOOR)
      deny('STUDENT_REPORT_MINIMUM_N_NOT_MET')
    if(assigned!==n&&assigned-n<COMPLEMENT_FLOOR)
      deny('STUDENT_REPORT_ATTRITION_COMPLEMENT_SMALL')
    const items=createProtectedFormItems(form.definition as FormDraft)
    let cursor='',seen=0
    const distinct=new Set<string>()
    for(;;){
      const rows=await tx.$queryRaw<Array<{
        id:string;respondentId:string;attemptId:string;
        resultsCipher:string;resultsHash:string;definitionDigest:string
      }>>`
        SELECT final."id",attempt."respondent_user_id" AS "respondentId",
          attempt."id" AS "attemptId",final."results_cipher" AS "resultsCipher",
          final."results_hash" AS "resultsHash",
          final."definition_digest" AS "definitionDigest"
        FROM "huiteacher_form_finals" final
        JOIN "huiteacher_form_attempts" attempt
          ON attempt."id"=final."attempt_id"
          AND attempt."organization_id"=final."organization_id"
          AND attempt."status"='COMPLETED'
          AND attempt."form_id"=${source.formId}
          AND attempt."definition_digest"=${source.definitionDigest}
          AND attempt."run_id"=${source.runId}
        JOIN "assessment_run_executions" execution
          ON execution."id"=attempt."run_execution_id"
          AND execution."organization_id"=attempt."organization_id"
          AND execution."run_id"=attempt."run_id"
          AND execution."status"='COMPLETED'
          AND execution."runtime_binding_kind"='HUITEACHER_FORM_V2'
          AND execution."runtime_binding_ref"=attempt."id"
        JOIN "assessment_run_tracks" track
          ON track."id"=execution."track_id"
          AND track."organization_id"=execution."organization_id"
          AND track."run_id"=execution."run_id"
          AND track."resource_key"='huiteacher-student-form:'||${source.formId}
          AND track."resource_version"=${source.definitionDigest}
        WHERE final."organization_id"=${input.organizationId}
          AND final."definition_digest"=${source.definitionDigest}
          AND final."id">${cursor}
        ORDER BY final."id" LIMIT ${PAGE_SIZE}
      `
      if(!rows.length)break
      for(const row of rows){
        if(distinct.has(row.respondentId))
          deny('STUDENT_REPORT_DUPLICATE_FINAL',409)
        distinct.add(row.respondentId)
        const data=decryptUnifiedRuntimePayload<FinalPayload>(row.resultsCipher)
        if(data.schemaVersion!==1||data.product!=='HUITEACHER'
          ||data.kind!=='FORM'||data.attemptId!==row.attemptId
          ||data.formId!==source.formId
          ||data.definitionDigest!==source.definitionDigest
          ||row.definitionDigest!==source.definitionDigest
          ||data.privateScoring!==null
          ||canonicalHash(data)!==row.resultsHash)
          deny('STUDENT_REPORT_FINAL_INTEGRITY',409)
        recordProtectedFormAnswers(items,data.rawAnswers,data.missing)
      }
      seen+=rows.length
      if(seen>n)deny('STUDENT_REPORT_UNEXPECTED_FINAL',409)
      cursor=rows[rows.length-1].id
      if(rows.length<PAGE_SIZE)break
    }
    if(seen!==n||distinct.size!==n)deny('STUDENT_REPORT_FINAL_INCOMPLETE',409)
    // A report reader may not select time slices, contributors or predicates.
    // The digest is retained only server-side as release evidence.
    const population=await tx.$queryRaw<Array<{userId:string}>>`
      SELECT respondent."user_id" AS "userId"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
      WHERE execution."organization_id"=${input.organizationId}
        AND execution."run_id"=${source.runId}
      ORDER BY respondent."user_id"
    `
    if(population.length!==assigned||new Set(population.map(x=>x.userId)).size!==assigned)
      deny('STUDENT_REPORT_SOURCE_INCONSISTENT',409)
    const populationDigest=canonicalHash({
      product:'HUITEACHER',purpose:'STUDENT_FEEDBACK',
      organizationId:input.organizationId,teacherUserId:source.targetUserId,
      classUnitId:source.classUnitId,
      respondents:population.map(x=>x.userId),
    })
    // One release per teacher/class, including across different Forms.
    // Repeat reads of the SAME closed immutable Run are safe.
    const rows=await tx.$queryRaw<Array<{firstRunId:string;releasedAt:Date}>>`
      INSERT INTO "huiteacher_student_disclosure_ledgers"
        ("organization_id","teacher_user_id","class_unit_id","first_run_id",
         "form_digest","population_digest")
      VALUES (${input.organizationId},${source.targetUserId},
        ${source.classUnitId},${source.runId},
        ${source.definitionDigest},${populationDigest})
      ON CONFLICT ("organization_id","teacher_user_id")
      DO UPDATE SET "first_run_id"=
        "huiteacher_student_disclosure_ledgers"."first_run_id"
      WHERE "huiteacher_student_disclosure_ledgers"."class_unit_id"=
        EXCLUDED."class_unit_id"
        AND "huiteacher_student_disclosure_ledgers"."first_run_id"=
          EXCLUDED."first_run_id"
        AND "huiteacher_student_disclosure_ledgers"."population_digest"=
          EXCLUDED."population_digest"
        AND "huiteacher_student_disclosure_ledgers"."form_digest"=
          EXCLUDED."form_digest"
      RETURNING "first_run_id" AS "firstRunId","released_at" AS "releasedAt"
    `
    if(rows.length!==1)
      deny('STUDENT_REPORT_CROSS_WAVE_DIFFERENCING_BLOCKED')
    // Only metadata is audited. In particular, never raw answers or roster.
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action",
         "target_type","target_id","domain_event_id","payload")
      VALUES (${randomUUID()},${input.organizationId},
        ${input.actorUserId},'HUITEACHER_STUDENT_FEEDBACK_REPORT_READ',
        'EVALUATION_EVENT',${input.eventId},${randomUUID()},
        ${JSON.stringify({runId:source.runId,minimum:STUDENT_FORM_PRIVACY_FLOOR})}::jsonb)
    `
    return {
      source:'VERIFIED_HUITEACHER_STUDENT_FORM_FINAL' as const,
      eventId:input.eventId,teacherName:source.targetName,
      formTitle:source.formTitle,definitionDigest:source.definitionDigest,
      frozenPopulation:assigned,independentRespondents:n,
      participationRate:Number((n/assigned).toFixed(3)),
      minimumRespondents:STUDENT_FORM_PRIVACY_FLOOR,
      releasedAt:rows[0].releasedAt,
      distributions:discloseProtectedFormItems(items,n),
      withheldFreeText:true,reportMode:'FORM_DESCRIPTIVE_AGGREGATE' as const,
      note:'身份受保护的学生评教。每题按符合披露规则的选项频数汇总；不足最低样本数、小单元、拒答及开放意见受到抑制。不构成经科学验证的教学能力分数。',
    }
  },{
    isolationLevel:Prisma.TransactionIsolationLevel.Serializable,
    maxWait:2000,timeout:30000,
  })
}


/** For an evaluated teacher, the inbox contains event metadata only;
 * actual aggregate release must pass the independent report transaction.
 */
export async function listMyHuiteacherStudentFeedback(actorUserId:string){
  const account=await prisma.user.findUnique({
    where:{id:actorUserId},select:{role:true,accountDomain:true,isActive:true,isFrozen:true},
  })
  if(!account||account.accountDomain!=='SCHOOL'
    ||!['TEACHER','ADMIN'].includes(account.role)
    ||!account.isActive||account.isFrozen)
    deny('STUDENT_REPORT_TEACHER_REQUIRED')
  const rows=await prisma.$queryRaw<Array<{
    organizationId:string;organizationName:string;eventId:string;
    eventTitle:string;teacherName:string;formTitle:string
  }>>`
    SELECT org."id" AS "organizationId",org."name" AS "organizationName",
      event."id" AS "eventId",event."title" AS "eventTitle",
      target."name" AS "teacherName",form."title" AS "formTitle"
    FROM "huiteacher_student_eval_configs" cfg
    JOIN "huiteacher_evaluation_events" event
      ON event."id"=cfg."event_id" AND event."organization_id"=cfg."organization_id"
      AND event."status"='CLOSED'
    JOIN "huiteacher_evaluation_targets" target
      ON target."id"=event."target_id" AND target."organization_id"=event."organization_id"
      AND target."kind"='PERSON'
      AND target."subject_user_id"=${actorUserId}
    JOIN "huiteacher_evaluation_run_links" link
      ON link."event_id"=event."id" AND link."organization_id"=event."organization_id"
    JOIN "assessment_runs" run
      ON run."id"=link."run_id" AND run."organization_id"=link."organization_id"
      AND run."status"='CLOSED'
    JOIN "huiteacher_form_instruments" form
      ON form."organization_id"=cfg."organization_id"
      AND form."id"=cfg."form_id"
      AND form."definition_digest"=cfg."definition_digest"
    JOIN "organizations" org
      ON org."id"=event."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=org."id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    JOIN "organization_memberships" member
      ON member."organization_id"=org."id"
      AND member."user_id"=${actorUserId}
      AND member."valid_from"<=statement_timestamp()
      AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=member."organization_id"
      AND persona."membership_id"=member."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    WHERE NOT EXISTS(SELECT 1 FROM "organization_access_denies" deny
      WHERE deny."organization_id"=org."id"
        AND deny."user_id"=${actorUserId}
        AND deny."lifted_at" IS NULL
        AND deny."permission" IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS'))
    ORDER BY event."created_at" DESC LIMIT 100
  `
  return {list:rows}
}
