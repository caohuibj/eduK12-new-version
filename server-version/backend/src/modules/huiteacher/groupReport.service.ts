import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolvePublishedTeacherForm,teacherFormResourceRef,
  TEACHER_FORM_MIN_RESPONDENTS } from './formRunResource'
import type { FormDraft } from '../survey/builder.definition'

export class HuiteacherGroupReportError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherGroupReportError'
  }
}
const reject=(code:string,status=409):never=>{throw new HuiteacherGroupReportError(code,status)}
const SMALL_CELL_FLOOR=5
const MAX_REPORT_FINALS=2500
const PAGE_SIZE=50
type FinalPayload={
  schemaVersion:1;product:'HUITEACHER';kind:'FORM';
  attemptId:string;formId:string;definitionDigest:string;
  rawAnswers:Record<string,unknown>;missing:Array<{itemKey:string;reason:string}>;
  privateScoring:null
}
type CountMap=Map<string,number>
type ItemAccumulator={
  itemKey:string;prompt:string;type:string;
  categories:{optionKey:string;label:string}[];
  counts:CountMap;
}
const add=(counts:CountMap,key:string)=>counts.set(key,(counts.get(key)??0)+1)
const reportableChoices=new Set(['SINGLE','LIKERT','MATRIX','MULTIPLE','MATRIX_MULTIPLE'])
const multipleChoices=new Set(['MULTIPLE','MATRIX_MULTIPLE'])
export const createProtectedFormItems=(form:FormDraft)=>{
  const items:ItemAccumulator[]=[]
  for(const page of form.pages)for(const q of page.questions){
    // Never silently omit unsupported content: disclosure is explicit.
    const unit=['MATRIX','MATRIX_MULTIPLE'].includes(q.type)
      ?q.rows.map(row=>({key:q.itemKey+':'+row.rowKey,label:q.prompt+'／'+row.label}))
      :[{key:q.itemKey,label:q.prompt}]
    for(const item of unit)items.push({
      itemKey:item.key,prompt:item.label,type:q.type,
      categories:reportableChoices.has(q.type)
        ?q.options.map(opt=>({optionKey:opt.optionKey,label:opt.label})):[],
      counts:new Map(),
    })
  }
  return items
}

/** Identical data reduction and whole-question disclosure for adult School
 * surveys and student feedback. Never returns raw texts/IDs or respondent times.
 */
export const recordProtectedFormAnswers=(items:ItemAccumulator[],
  rawAnswers:Record<string,unknown>,
  missing:readonly {itemKey:string;reason:string}[]):void=>{
  // Survey FINAL stores MATRIX and MATRIX_MULTIPLE as a parent-key object
  // with row keys, not wire-level 'question:row' flat keys. The authoritative
  // missing[] vector also preserves REFUSED vs SHOWN_MISSING vs NOT_SHOWN.
  const reasons=new Map<string,string>()
  for(const row of missing){
    if(reasons.has(row.itemKey))
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    reasons.set(row.itemKey,row.reason)
  }
  for(const item of items){
    if(!reportableChoices.has(item.type))continue
    const matrix=item.type==='MATRIX'||item.type==='MATRIX_MULTIPLE'
    const colon=matrix?item.itemKey.indexOf(':'):-1
    if(matrix&&colon<1)
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    const questionKey=matrix?item.itemKey.slice(0,colon):item.itemKey
    const rowKey=matrix?item.itemKey.slice(colon+1):null
    const nested=rawAnswers[questionKey]
    if(matrix&&nested!==undefined&&
      (!nested||typeof nested!=='object'||Array.isArray(nested)))
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    const value=matrix
      ?nested?(nested as Record<string,unknown>)[rowKey!]:undefined
      :rawAnswers[item.itemKey]
    const reason=reasons.get(item.itemKey)
      ??(matrix?reasons.get(questionKey):undefined)
    if(reason&&value!==undefined)
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    const permitted=new Set(item.categories.map(o=>o.optionKey))
    if(multipleChoices.has(item.type)&&Array.isArray(value)){
      if(new Set(value).size!==value.length
        ||value.some(selected=>typeof selected!=='string'||!permitted.has(selected)))
        reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
      add(item.counts,'ANSWERED')
      for(const selected of value)add(item.counts,selected)
    }else if(!multipleChoices.has(item.type)&&typeof value==='string'
      &&permitted.has(value)){
      add(item.counts,value)
    }else if(value===undefined&&(reason==='REFUSED')){
      add(item.counts,'REFUSED')
    }else if(value===undefined&&(reason==='SHOWN_MISSING'||reason==='NOT_SHOWN')){
      add(item.counts,'MISSING')
    }else{
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    }
  }
}
export const discloseProtectedFormItems=(items:ItemAccumulator[],count:number)=>{
  return items.map(item=>{
    if(!reportableChoices.has(item.type))
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,
        reason:['SHORT_TEXT','LONG_TEXT'].includes(item.type)
          ?'PRIVATE_FREE_TEXT' as const:'AGGREGATION_NOT_RELEASED' as const}
    const multi=multipleChoices.has(item.type)
    const cells=[
      ...item.categories.map(opt=>({key:opt.optionKey,label:opt.label,
        count:item.counts.get(opt.optionKey)??0})),
      {key:'REFUSED',label:'明确拒答',count:item.counts.get('REFUSED')??0},
      {key:'MISSING',label:'未提供有效回答',count:item.counts.get('MISSING')??0},
    ]
    const respondentN=multi
      ?(item.counts.get('ANSWERED')??0)
        +(item.counts.get('REFUSED')??0)+(item.counts.get('MISSING')??0)
      :cells.reduce((a,x)=>a+x.count,0)
    if(respondentN!==count)
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,reason:'SOURCE_INTEGRITY' as const}
    // Exact category counts or their complements below five permit a
    // membership-differencing attack. Suppress the WHOLE question, not only
    // one cell, for both one-choice and multiple-choice questions.
    if(cells.some(x=>x.count>0&&x.count<SMALL_CELL_FLOOR
      ||multi&&x.count<count&&count-x.count<SMALL_CELL_FLOOR))
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,reason:'SMALL_CELL' as const}
    return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
      status:'READY' as const,cells,
      ...(multi?{selectionMode:'NON_EXCLUSIVE' as const}:{}),
    }
  })
}

/** Adult Teacher group report, intentionally narrower than research export.
 * No filters, no raw texts, no respondent IDs/attempt IDs, and no time slices.
 * The Run/Event must be fully CLOSED with no STARTED or ASSIGNED work.
 */
export async function readTeacherFormGroupReport(input:{
  organizationId:string;eventId:string;formId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    // Serialize product suspension: a valid School ORG_ADMIN is not enough.
    const scope=await resolveEducationProductMemberScope({
      organizationId:input.organizationId,actorUserId:input.actorUserId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)reject('HUITEACHER_GROUP_REPORT_FORBIDDEN',403)
    const entitled=await tx.$queryRaw<Array<{id:string}>>`
      SELECT entitlement."organization_id" AS "id"
      FROM "education_product_entitlements" entitlement
      JOIN "organizations" org ON org."id"=entitlement."organization_id"
        AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
      WHERE entitlement."organization_id"=${input.organizationId}
        AND entitlement."product"='HUITEACHER'
        AND entitlement."status"='ACTIVE'
      FOR SHARE OF entitlement,org
    `
    if(!entitled.length)reject('HUITEACHER_GROUP_PRODUCT_INACTIVE',403)
    const linkage=await tx.$queryRaw<Array<{
      runId:string;eventStatus:string;runStatus:string;definitionDigest:string;
    }>>`
      SELECT link."run_id" AS "runId",event."status" AS "eventStatus",
        run."status" AS "runStatus",
        form."definition_digest" AS "definitionDigest"
      FROM "huiteacher_evaluation_run_links" link
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=link."organization_id"
        AND event."id"=link."event_id"
      JOIN "assessment_runs" run
        ON run."organization_id"=link."organization_id"
        AND run."id"=link."run_id"
      JOIN "huiteacher_form_instruments" form
        ON form."organization_id"=link."organization_id"
        AND form."id"=${input.formId} AND form."status"='PUBLISHED'
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=link."organization_id"
        AND track."run_id"=link."run_id"
        AND track."resource_family"='FORM'
        AND track."resource_key"='huiteacher-form:'||form."id"
        AND track."resource_version"=form."definition_digest"
      WHERE link."organization_id"=${input.organizationId}
        AND link."event_id"=${input.eventId}
      FOR SHARE OF event,run,form
    `
    if(linkage.length!==1)reject('HUITEACHER_REPORT_SOURCE_UNAVAILABLE',404)
    const source=linkage[0]
    if(source.eventStatus!=='CLOSED'||source.runStatus!=='CLOSED')
      reject('HUITEACHER_GROUP_NOT_FROZEN',409)
    const form=await resolvePublishedTeacherForm(
      teacherFormResourceRef(input.formId,source.definitionDigest),tx)
    if(form.organizationId!==input.organizationId)
      reject('HUITEACHER_REPORT_SOURCE_UNAVAILABLE',403)
    const pending=await tx.$queryRaw<Array<{count:number}>>`
      SELECT COUNT(*)::int AS "count" FROM "assessment_run_executions" execution
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
        AND track."resource_key"='huiteacher-form:'||${input.formId}
        AND track."resource_version"=${source.definitionDigest}
      WHERE execution."organization_id"=${input.organizationId}
        AND execution."run_id"=${source.runId}
        AND execution."status" IN ('ASSIGNED','STARTED')
    `
    if((pending[0]?.count??0)>0)
      reject('HUITEACHER_GROUP_PENDING_FINALS',409)
    // Release only the complete exact frozen Run cohort, not a 10-of-11
    // self-selected or attrited subset. Exact counts on partially responding
    // groups can permit cross-wave differencing and identification.
    const population=await tx.$queryRaw<Array<{
      assigned:number;respondents:number;completed:number;
    }>>`
      SELECT COUNT(*)::int AS "assigned",
        COUNT(DISTINCT respondent."user_id")::int AS "respondents",
        COUNT(*) FILTER(WHERE execution."status"='COMPLETED')::int AS "completed"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
        AND respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."actor_role"='TEACHER'
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
      WHERE execution."organization_id"=${input.organizationId}
        AND execution."run_id"=${source.runId}
        AND track."resource_family"='FORM'
        AND track."resource_key"='huiteacher-form:'||${input.formId}
        AND track."resource_version"=${source.definitionDigest}
    `
    const eligible=population[0]
    if(!eligible||eligible.assigned<TEACHER_FORM_MIN_RESPONDENTS
      ||eligible.assigned!==eligible.respondents
      ||eligible.completed!==eligible.assigned)
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    const totals=await tx.$queryRaw<Array<{uniqueRespondents:number;finals:number}>>`
      SELECT COUNT(DISTINCT attempt."respondent_user_id")::int AS "uniqueRespondents",
        COUNT(*)::int AS "finals"
      FROM "huiteacher_form_finals" final
      JOIN "huiteacher_form_attempts" attempt
        ON attempt."id"=final."attempt_id"
        AND attempt."organization_id"=final."organization_id"
        AND attempt."status"='COMPLETED'
      JOIN "assessment_run_executions" execution
        ON execution."id"=attempt."run_execution_id"
        AND execution."organization_id"=attempt."organization_id"
        AND execution."run_id"=attempt."run_id"
        AND execution."status"='COMPLETED'
        AND execution."runtime_binding_kind"='HUITEACHER_FORM_V2'
        AND execution."runtime_binding_ref"=attempt."id"
      WHERE final."organization_id"=${input.organizationId}
        AND attempt."run_id"=${source.runId}
        AND attempt."form_id"=${input.formId}
        AND attempt."definition_digest"=${source.definitionDigest}
        AND final."definition_digest"=${source.definitionDigest}
    `
    const n=totals[0]?.uniqueRespondents??0
    const count=totals[0]?.finals??0
    if(n<TEACHER_FORM_MIN_RESPONDENTS)
      reject('HUITEACHER_GROUP_MINIMUM_N_NOT_MET',403)
    if(count!==n)reject('HUITEACHER_GROUP_DUPLICATE_RESPONDENTS',409)
    if(count!==eligible.assigned)
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    if(count>MAX_REPORT_FINALS)
      reject('HUITEACHER_GROUP_CAPACITY_LIMIT',409)
    const items=createProtectedFormItems(form.definition as FormDraft)
    let cursor=''
    let seen=0
    for(;;){
      const finals=await tx.$queryRaw<Array<{
        id:string;attemptId:string;definitionDigest:string;
        resultsCipher:string;resultsHash:string
      }>>`
        SELECT final."id",final."attempt_id" AS "attemptId",
          final."definition_digest" AS "definitionDigest",
          final."results_cipher" AS "resultsCipher",
          final."results_hash" AS "resultsHash"
        FROM "huiteacher_form_finals" final
        JOIN "huiteacher_form_attempts" attempt
          ON attempt."id"=final."attempt_id"
          AND attempt."organization_id"=final."organization_id"
          AND attempt."run_id"=${source.runId}
          AND attempt."form_id"=${input.formId}
          AND attempt."definition_digest"=${source.definitionDigest}
        JOIN "assessment_run_executions" execution
          ON execution."id"=attempt."run_execution_id"
          AND execution."organization_id"=attempt."organization_id"
          AND execution."run_id"=attempt."run_id"
          AND execution."status"='COMPLETED'
          AND execution."runtime_binding_kind"='HUITEACHER_FORM_V2'
          AND execution."runtime_binding_ref"=attempt."id"
        WHERE final."organization_id"=${input.organizationId}
          AND final."definition_digest"=${source.definitionDigest}
          AND final."id" > ${cursor}
        ORDER BY final."id" ASC LIMIT ${PAGE_SIZE}
      `
      if(!finals.length)break
      for(const final of finals){
        const data=decryptUnifiedRuntimePayload<FinalPayload>(final.resultsCipher)
        if(data.schemaVersion!==1||data.kind!=='FORM'||data.product!=='HUITEACHER'
          ||data.formId!==input.formId||data.attemptId!==final.attemptId
          ||data.definitionDigest!==source.definitionDigest
          ||final.definitionDigest!==source.definitionDigest
          ||data.privateScoring!==null
          ||canonicalHash(data)!==final.resultsHash)
          reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
        recordProtectedFormAnswers(items,data.rawAnswers,data.missing)
      }
      seen+=finals.length
      if(seen>count)reject('HUITEACHER_GROUP_SOURCE_CHANGED',409)
      cursor=finals[finals.length-1].id
      if(finals.length<PAGE_SIZE)break
    }
    if(seen!==count)reject('HUITEACHER_GROUP_SOURCE_CHANGED',409)
    const distributions=discloseProtectedFormItems(items,count)
    // Disclosure is also a WRITE event: for a given school and immutable
    // Form definition, all released waves must use EXACTLY the same frozen
    // respondent population, preventing 10-of-11 / 11-of-12 differencing.
    // A mismatch refuses the entire next report. IDs remain internal.
    const contributors=await tx.$queryRaw<Array<{userId:string}>>`
      SELECT DISTINCT respondent."user_id" AS "userId"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
        AND track."resource_family"='FORM'
        AND track."resource_key"='huiteacher-form:'||${input.formId}
        AND track."resource_version"=${source.definitionDigest}
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
        AND respondent."actor_role"='TEACHER'
      WHERE execution."organization_id"=${input.organizationId}
        AND execution."run_id"=${source.runId}
        AND execution."status"='COMPLETED'
      ORDER BY respondent."user_id"
    `
    if(contributors.length!==eligible.assigned)
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    const populationDigest=canonicalHash({
      schemaVersion:1,product:'HUITEACHER',organizationId:input.organizationId,
      definitionDigest:source.definitionDigest,
      users:contributors.map(row=>row.userId),
    })
    const fence=await tx.$queryRaw<Array<{firstRunId:string}>>`
      INSERT INTO "huiteacher_group_disclosure_ledgers"
        ("organization_id","definition_digest","population_digest","first_run_id")
      VALUES (${input.organizationId},${source.definitionDigest},
        ${populationDigest},${source.runId})
      ON CONFLICT ("organization_id","definition_digest")
      DO UPDATE SET "population_digest"=
        "huiteacher_group_disclosure_ledgers"."population_digest"
      WHERE "huiteacher_group_disclosure_ledgers"."population_digest"=
        EXCLUDED."population_digest"
      RETURNING "first_run_id" AS "firstRunId"
    `
    if(fence.length!==1)
      reject('HUITEACHER_GROUP_POPULATION_DIFFERENCING_BLOCKED',403)

    return {
      source:'VERIFIED_HUITEACHER_FORM_FINAL' as const,
      organizationId:input.organizationId,eventId:input.eventId,
      formId:input.formId,definitionDigest:source.definitionDigest,
      independentRespondents:n,minimumRespondents:TEACHER_FORM_MIN_RESPONDENTS,
      reportMode:'FORM_DESCRIPTIVE_AGGREGATE' as const,
      distributions,
      withheldFreeText:true,
      note:'单选/Likert/矩阵/多选按保密条件报告频数；多选为非互斥选择，不将其简单相加为人数。文本与数值／排序题未获正式汇总许可时明确隐藏；不构成诊断或因果解释。',
    }
  },{
    isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait:2000,timeout:30000,
  })
}
