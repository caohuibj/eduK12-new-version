import {randomUUID} from 'node:crypto'
import {freezeRunTrackCohort} from '../reporting/cohort'
import {educationGroupSelector,educationGroupPresentation,listEducationGroupSelections,type EducationGroupSelection} from '../reporting/education-group-selection'
import type {ReportingCohortSnapshotRecord} from '../reporting/types'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { resolvePublishedTeacherForm,teacherFormResourceRef,
  TEACHER_FORM_MIN_RESPONDENTS } from './formRunResource'
import type { FormDraft } from '../survey/builder.definition'
import type {PrivacyOptions} from '../report-privacy/schema'
import {assertTeacherComparableDisclosure} from './disclosureOverlap.service'
import {teacherFrozenPolicy,teacherScopeKey,teacherReportFloor,
  readReleasedTeacherReport,recordTeacherReportRelease,lockTeacherDisclosure}
  from './privacyReleaseV2.service'

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
type DescriptiveRule=NonNullable<FormDraft['descriptive']>['items'][number]
type ItemAccumulator={
  itemKey:string;prompt:string;type:string;
  categories:{optionKey:string;label:string}[];
  counts:CountMap;
  descriptive?:DescriptiveRule;
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
      ...(form.descriptive?.items.find(rule=>rule.itemKey===item.key)?{descriptive:form.descriptive.items.find(rule=>rule.itemKey===item.key)!}:{}),
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
      if(item.descriptive)add(item.counts,reason)
    }else{
      reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE',409)
    }
  }
}
export const discloseProtectedFormItems=(items:ItemAccumulator[],count:number,options?:PrivacyOptions,minimumValid=5)=>{
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
      ...(item.descriptive?[{key:'SHOWN_MISSING',label:'跳过',count:item.counts.get('SHOWN_MISSING')??0},
        {key:'NOT_SHOWN',label:'未呈现',count:item.counts.get('NOT_SHOWN')??0}]:[{key:'MISSING',label:'未提供有效回答',count:item.counts.get('MISSING')??0}]),
    ]
    const respondentN=multi
      ?(item.counts.get('ANSWERED')??0)
        +(item.counts.get('REFUSED')??0)+(item.counts.get('MISSING')??0)
      :cells.reduce((a,x)=>a+x.count,0)
    if(respondentN!==count)
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,reason:'SOURCE_INTEGRITY' as const}
    const small=cells.some(x=>x.count>0&&x.count<SMALL_CELL_FLOOR
      ||multi&&x.count<count&&count-x.count<SMALL_CELL_FLOOR)
    if(options?.restrictItemDistributions)
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,reason:'POLICY_ITEM_DISTRIBUTION' as const}
    // Legacy has the original fail-closed threshold. New V2 may opt out of
    // these EXTRA aggregate restrictions, never of source integrity.
    if((options?.withholdSmallCells??true)&&small)
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'WITHHELD' as const,reason:'SMALL_CELL' as const}
    if(item.descriptive){
      const validKeys=new Set(item.descriptive.values.map(v=>v.optionKey))
      const validN=cells.filter(c=>validKeys.has(c.key)).reduce((sum,c)=>sum+c.count,0)
      if(validN<minimumValid)return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,status:'WITHHELD' as const,reason:'MINIMUM_VALID_N' as const}
      const rounded=options?.restrictedStatisticsProjection===true
      const percentage=(n:number,d:number)=>rounded?Math.round(n*10/d)*10:n*100/d
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,status:'READY' as const,
        cells:cells.map(c=>({key:c.key,label:c.label,...(!rounded?{count:c.count}:{}),percentage:percentage(c.count,count)})),
        descriptive:{version:'ordinal-description-v1' as const,submittedN:rounded?null:count,validN:rounded?null:validN,
          frequencyDenominator:'VALID_ORDINAL_RESPONSES' as const,nonresponseDenominator:'SUBMITTED_RESPONSES' as const,
          frequencies:cells.filter(c=>validKeys.has(c.key)).map(c=>({key:c.key,label:c.label,percentage:percentage(c.count,validN)}))},
        ...(rounded?{precision:'ROUNDED_10_PERCENT' as const}:{})}
    }
    if(options?.restrictedStatisticsProjection)
      return {itemKey:item.itemKey,prompt:item.prompt,type:item.type,
        status:'READY' as const,
        cells:cells.map(x=>({key:x.key,label:x.label,
          percentage:Math.round(x.count*10/count)*10})),
        precision:'ROUNDED_10_PERCENT' as const,
        ...(multi?{selectionMode:'NON_EXCLUSIVE' as const}:{}),
      }
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
type PreparedTeacherReport = {
  binding: string
  rows: Array<{ id: string; attemptId: string; definitionDigest: string; resultsCipher: string; resultsHash: string }>
  distributions: ReturnType<typeof discloseProtectedFormItems>
}

function isDeferredTeacherReport(value: unknown): value is { deferredCompute: () => Promise<PreparedTeacherReport> } {
  return value !== null && typeof value === 'object' && 'deferredCompute' in value && typeof value.deferredCompute === 'function'
}

type FormReportKey={organizationId:string;eventId:string;formId:string;actorUserId:string}
type SelectedPopulation={cohort:ReportingCohortSnapshotRecord;selection:EducationGroupSelection;populationLabel:string;sourceLabel:string;versionKey:string;policySnapshotId:string}
async function teacherFormReportingScope(tx:Prisma.TransactionClient,input:FormReportKey){
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
      runId:string;eventStatus:string;runStatus:string;definitionDigest:string;trackId:string;
      eventClosedAt:Date|null;runClosedAt:Date|null
    }>>`
      SELECT link."run_id" AS "runId",event."status" AS "eventStatus",
        run."status" AS "runStatus",event."closed_at" AS "eventClosedAt",
        run."closed_at" AS "runClosedAt",
        form."definition_digest" AS "definitionDigest",track.id AS "trackId"
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
    const frozen=await teacherFrozenPolicy(tx,{
      organizationId:input.organizationId,runId:source.runId,
      scenario:'TEACHER_ADULT_FORM_GROUP'})
  return {source,form,frozen}
}

export async function readTeacherFormGroupReport(input:{
  organizationId:string;eventId:string;formId:string;actorUserId:string;
  publishV2?:boolean;releasedOnly?:boolean;population?:SelectedPopulation
}) {
  const first = await readTeacherFormGroupReportStage(input)
  if (!isDeferredTeacherReport(first)) return first
  const prepared = await first.deferredCompute()
  // Reacquire current authorization/source/disclosure locks; nothing from the
  // calculation phase is a reusable grant or a released privacy projection.
  const second = await readTeacherFormGroupReportStage(input, prepared)
  if (isDeferredTeacherReport(second)) throw new Error('Unexpected report stage')
  return second
}

async function readTeacherFormGroupReportStage(input:{
  organizationId:string;eventId:string;formId:string;actorUserId:string;
  publishV2?:boolean;releasedOnly?:boolean;population?:SelectedPopulation
}, prepared?: PreparedTeacherReport) {
  return prisma.$transaction(async tx=>{
    if(input.publishV2)await lockTeacherDisclosure(tx,input.organizationId)
    const {source,form,frozen}=await teacherFormReportingScope(tx,input)
    if(input.population&&(input.population.cohort.organizationId!==input.organizationId||input.population.cohort.sourceRunId!==source.runId||input.population.cohort.sourceTrackId!==source.trackId||input.population.policySnapshotId!==frozen?.policySnapshotId))reject('HUITEACHER_REPORT_SOURCE_UNAVAILABLE',404)
    const executionIds=input.population?.cohort.members.map(member=>member.executionId)??null
    const scopeKey=input.population?canonicalHash({kind:'TEACHER_GROUP_VERSION',organizationId:input.organizationId,versionId:input.population.versionKey}):frozen?teacherScopeKey({
      organizationId:input.organizationId,runId:source.runId,eventId:input.eventId,
      formId:input.formId,scenario:'TEACHER_ADULT_FORM_GROUP'}):null
    if(frozen&&scopeKey){
      const released=await readReleasedTeacherReport(tx,{
        organizationId:input.organizationId,runId:source.runId,
        policySnapshotId:frozen.policySnapshotId,scopeKey,
        reportKind:'TEACHER_ADULT_FORM_GROUP'})
      if(released)return released
      if(!input.publishV2)reject('HUITEACHER_REPORT_AWAITING_RELEASE',409)
      if(frozen.options.releaseDelayHours===24&&(!source.eventClosedAt||!source.runClosedAt
        ||Date.now()-source.eventClosedAt.getTime()<86_400_000
        ||Date.now()-source.runClosedAt.getTime()<86_400_000))
        reject('HUITEACHER_REPORT_RELEASE_DELAY',409)
    }else if(input.publishV2)reject('HUITEACHER_REPORT_V2_RUN_REQUIRED',409)
    if(!frozen&&input.releasedOnly)
      reject('HUITEACHER_REPORT_LEGACY_REQUIRES_AUTHORIZED_READ',409)
    const requiredN=frozen
      ?await teacherReportFloor(tx,{organizationId:input.organizationId,
        runId:source.runId,resourceKey:'huiteacher-form:'+input.formId,
        resourceVersion:source.definitionDigest,options:frozen.options})
      :TEACHER_FORM_MIN_RESPONDENTS
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
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
        AND execution."status" IN ('ASSIGNED','STARTED')
    `
    if((pending[0]?.count??0)>0
      &&(!frozen||frozen.options.requireAllCompleted))
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
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
        AND track."resource_family"='FORM'
        AND track."resource_key"='huiteacher-form:'||${input.formId}
        AND track."resource_version"=${source.definitionDigest}
    `
    const eligible=population[0]
    if(!eligible||eligible.assigned<requiredN
      ||eligible.assigned!==eligible.respondents
      ||eligible.completed>eligible.assigned
      ||((!frozen||frozen.options.requireAllCompleted)
        &&eligible.completed!==eligible.assigned))
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    if(frozen?.options.protectSmallNonrespondentComplement
      &&eligible.completed!==eligible.assigned
      &&eligible.assigned-eligible.completed<5)
      reject('HUITEACHER_GROUP_ATTRITION_COMPLEMENT_SMALL',403)
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
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
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
    if(n<requiredN)
      reject('HUITEACHER_GROUP_MINIMUM_N_NOT_MET',403)
    if(count!==n)reject('HUITEACHER_GROUP_DUPLICATE_RESPONDENTS',409)
    if(count!==eligible.completed
      ||(!frozen&&count!==eligible.assigned))
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    if(count>MAX_REPORT_FINALS)
      reject('HUITEACHER_GROUP_CAPACITY_LIMIT',409)
    const [budget] = await tx.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT COALESCE(SUM(octet_length(final.results_cipher)), 0)::bigint AS bytes
      FROM huiteacher_form_finals final
      JOIN huiteacher_form_attempts attempt ON attempt.id=final.attempt_id AND attempt.organization_id=final.organization_id
      JOIN assessment_run_executions execution ON execution.id=attempt.run_execution_id
        AND execution.organization_id=attempt.organization_id AND execution.run_id=attempt.run_id
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
        AND execution.status='COMPLETED' AND execution.runtime_binding_kind='HUITEACHER_FORM_V2'
        AND execution.runtime_binding_ref=attempt.id
      WHERE final.organization_id=${input.organizationId} AND attempt.run_id=${source.runId}
        AND attempt.form_id=${input.formId} AND attempt.definition_digest=${source.definitionDigest}
        AND final.definition_digest=${source.definitionDigest}
    `
    if ((budget?.bytes ?? 0n) > 16n * 1024n * 1024n) reject('HUITEACHER_GROUP_CAPACITY_LIMIT', 409)
    const rows: PreparedTeacherReport['rows'] = []
    let cipherBytes = 0
    const binding = canonicalHash(JSON.parse(JSON.stringify({ runId: source.runId, definitionDigest: source.definitionDigest,
      n, count, requiredN, frozen, cohortHash:input.population?.cohort.snapshotHash??null, formDefinition: form.definition })))
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
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
          AND execution."runtime_binding_kind"='HUITEACHER_FORM_V2'
          AND execution."runtime_binding_ref"=attempt."id"
        WHERE final."organization_id"=${input.organizationId}
          AND final."definition_digest"=${source.definitionDigest}
          AND final."id" > ${cursor}
        ORDER BY final."id" ASC LIMIT ${PAGE_SIZE}
      `
      if(!finals.length)break
      for (const final of finals) {
        cipherBytes += Buffer.byteLength(final.resultsCipher)
        if (cipherBytes > 16 * 1024 * 1024) reject('HUITEACHER_GROUP_CAPACITY_LIMIT', 409)
        rows.push(final)
      }
      seen+=finals.length
      if(seen>count)reject('HUITEACHER_GROUP_SOURCE_CHANGED',409)
      cursor=finals[finals.length-1].id
      if(finals.length<PAGE_SIZE)break
    }
    if(seen!==count)reject('HUITEACHER_GROUP_SOURCE_CHANGED',409)
    if (!prepared) return { deferredCompute: async (): Promise<PreparedTeacherReport> => {
      const items = createProtectedFormItems(form.definition as FormDraft)
      for (let index = 0; index < rows.length; index++) {
        const final = rows[index]
        const data = decryptUnifiedRuntimePayload<FinalPayload>(final.resultsCipher)
        if (data.schemaVersion !== 1 || data.kind !== 'FORM' || data.product !== 'HUITEACHER'
          || data.formId !== input.formId || data.attemptId !== final.attemptId
          || data.definitionDigest !== source.definitionDigest || final.definitionDigest !== source.definitionDigest
          || data.privateScoring !== null || canonicalHash(data) !== final.resultsHash)
          reject('HUITEACHER_REPORT_FINAL_INTEGRITY_FAILURE', 409)
        recordProtectedFormAnswers(items, data.rawAnswers, data.missing)
        if (index % PAGE_SIZE === 0) await new Promise<void>(resolve => setImmediate(resolve))
      }
      return { binding, rows, distributions: discloseProtectedFormItems(items, count, frozen?.options) }
    } }
    if (prepared.binding !== binding || prepared.rows.length !== rows.length
      || rows.some((row, index) => {
        const old = prepared.rows[index]
        return row.id !== old.id || row.attemptId !== old.attemptId || row.definitionDigest !== old.definitionDigest
          || row.resultsCipher !== old.resultsCipher || row.resultsHash !== old.resultsHash
      })) reject('HUITEACHER_GROUP_SOURCE_CHANGED', 409)
    const distributions = prepared.distributions
    // Disclosure is also a WRITE event: for a given school and immutable
    // Form definition, all released waves must use EXACTLY the same frozen
    // respondent population, preventing 10-of-11 / 11-of-12 differencing.
    // A mismatch refuses the entire next report. IDs remain internal.
    const contributors=await tx.$queryRaw<Array<{userId:string;executionId:string}>>`
      SELECT DISTINCT respondent."user_id" AS "userId",execution.id AS "executionId"
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
        AND (${executionIds}::text[] IS NULL OR execution.id=ANY(${executionIds}::text[]))
        AND execution."status"='COMPLETED'
      ORDER BY respondent."user_id"
    `
    if(contributors.length!==count)
      reject('HUITEACHER_GROUP_INCOMPLETE_COHORT',403)
    const populationDigest=canonicalHash({
      schemaVersion:1,product:'HUITEACHER',organizationId:input.organizationId,
      definitionDigest:source.definitionDigest,
      users:contributors.map(row=>row.userId),
    })
    if(!frozen){
      // V1 GET creates the first legacy disclosure. Serialize it with V2
      // release and check any earlier protected comparable report.
      await lockTeacherDisclosure(tx,input.organizationId)
      const legacyRelease=await tx.huiteacherGroupDisclosureLedger.findFirst({
        where:{organizationId:input.organizationId,definitionDigest:source.definitionDigest},
        select:{firstRunId:true},
      })
      // Re-reading an already-disclosed legacy Run does not create a new
      // cross-version disclosure even if a newer release exists.
      if(legacyRelease?.firstRunId!==source.runId)
        await assertTeacherComparableDisclosure(tx,{
          organizationId:input.organizationId,runId:source.runId,
          definitionDigest:source.definitionDigest,scenario:'TEACHER_ADULT_FORM_GROUP',
          respondents:contributors.map(row=>row.userId),enhanced:false,
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
        distributions,withheldFreeText:true,
        note:'单选/Likert/矩阵/多选按保密条件报告频数；多选为非互斥选择，不将其简单相加为人数。文本与数值／排序题未获正式汇总许可时明确隐藏；不构成诊断或因果解释。',
      }
    }
    await assertTeacherComparableDisclosure(tx,{
      organizationId:input.organizationId,runId:source.runId,
      definitionDigest:source.definitionDigest,scenario:'TEACHER_ADULT_FORM_GROUP',
      respondents:contributors.map(row=>row.userId),
      enhanced:frozen.options.crossReleaseOverlapGuard,
    })
    const projection={
      source:'VERIFIED_HUITEACHER_FORM_FINAL' as const,
      organizationId:input.organizationId,eventId:input.eventId,
      formId:input.formId,definitionDigest:source.definitionDigest,
      independentRespondents:frozen.options.restrictedStatisticsProjection?null:n,
      minimumRespondents:requiredN,
      reportMode:'FORM_DESCRIPTIVE_AGGREGATE' as const,
      distributions,withheldFreeText:true,
      releasedAt:new Date().toISOString(),
      privacyPolicy:'FROZEN_TEACHER_V2' as const,
      ...(input.population?{populationLabel:input.population.populationLabel,sourceLabel:input.population.sourceLabel,selection:input.population.selection,versionId:input.population.versionKey}:{}),
      note:'正式发布的群体统计快照，不包含个人原始作答、响应时间或开放文本。不构成教师个人绩效或因果结论。',
    }
    return recordTeacherReportRelease(tx,{
      organizationId:input.organizationId,runId:source.runId,
      scopeKey:scopeKey!,policySnapshotId:frozen.policySnapshotId,
      scenario:'TEACHER_ADULT_FORM_GROUP',actorUserId:input.actorUserId,
      populationDigest,projection,
      ...(input.population?{releaseId:input.population.versionKey,privatePopulation:{cohortSnapshotId:input.population.cohort.id,contributingExecutionIds:contributors.map(row=>row.executionId)}}:{}),
    })
  },{
    // Legacy first reads acquire the disclosure lock after source resolution.
    // READ COMMITTED makes a just-committed V2 release visible after waiting.
    isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait:2000,timeout:30000,
  })
}


/** Picker and old-version reads never freeze a cohort or revisit FINAL data. */
export type TeacherFormVersionCursor={releasedAt:string;versionId:string}
export async function listTeacherFormGroupVersions(input:FormReportKey,before?:TeacherFormVersionCursor){
  const scoped=await prisma.$transaction(tx=>teacherFormReportingScope(tx,input))
  const {source,frozen}=scoped
  const versions=await prisma.$queryRaw<Array<{versionId:string;releasedAt:Date;populationLabel:string;cursorAt:string}>>(Prisma.sql`
    SELECT id AS "versionId",released_at AS "releasedAt",COALESCE(report_projection->>'populationLabel','全部合格参与教师') AS "populationLabel",
      to_char(released_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    FROM education_report_release_records WHERE organization_id=${input.organizationId} AND source_run_id=${source.runId}
      AND report_kind='TEACHER_ADULT_FORM_GROUP' AND policy_snapshot_id=${frozen?.policySnapshotId??''}
      AND report_projection->>'eventId'=${input.eventId} AND report_projection->>'formId'=${input.formId}
      AND report_projection->>'definitionDigest'=${source.definitionDigest}
      ${before?Prisma.sql`AND (released_at,id)<(${before.releasedAt}::timestamptz,${before.versionId})`:Prisma.empty}
    ORDER BY released_at DESC,id DESC LIMIT 101
  `)
  const groups=frozen?await listEducationGroupSelections({organizationId:input.organizationId,runId:source.runId,trackId:source.trackId,product:'TEACHER'}):{options:[],limitations:['该历史任务没有冻结的 Teacher V2 隐私策略；沿用原历史报告，不新增子群快照。']}
  const page=versions.slice(0,100),last=page[page.length-1]
  return {versioned:!!frozen,groups,versions:page.map(({cursorAt:_cursor,...row})=>({...row,releasedAt:row.releasedAt.toISOString()})),truncated:versions.length>100,
    nextCursor:versions.length>100?{releasedAt:last.cursorAt,versionId:last.versionId}:null}
}
export async function readTeacherFormGroupVersion(input:FormReportKey&{versionId:string}){
 return prisma.$transaction(async tx=>{
  const {source,frozen}=await teacherFormReportingScope(tx,input)
  if(!frozen)reject('HUITEACHER_REPORT_SOURCE_UNAVAILABLE',404)
  const row=await tx.educationReportReleaseRecord.findFirst({where:{id:input.versionId,organizationId:input.organizationId,sourceRunId:source.runId,reportKind:'TEACHER_ADULT_FORM_GROUP'}})
  const p=row?.reportProjection as Record<string,unknown>|null
  if(!row||p?.eventId!==input.eventId||p?.formId!==input.formId||p?.definitionDigest!==source.definitionDigest)reject('HUITEACHER_REPORT_SOURCE_UNAVAILABLE',404)
  const report=await readReleasedTeacherReport(tx,{organizationId:input.organizationId,runId:source.runId,scopeKey:row!.reportScopeKey,policySnapshotId:frozen!.policySnapshotId,reportKind:'TEACHER_ADULT_FORM_GROUP'})
  return {...report as object,versionId:row!.id}
 })
}
export async function generateTeacherFormGroupVersion(input:FormReportKey&{selection:EducationGroupSelection}){
 const {source,frozen}=await prisma.$transaction(tx=>teacherFormReportingScope(tx,input))
 if(!frozen)reject('HUITEACHER_REPORT_V2_RUN_REQUIRED',409)
 const selector=await educationGroupSelector(input.organizationId,'TEACHER',input.selection)
 const cohort=await freezeRunTrackCohort({organizationId:input.organizationId,runId:source.runId,trackId:source.trackId,generatedByUserId:input.actorUserId,cohortSelector:selector,nativeTeacherForm:true})
 const presentation=await educationGroupPresentation({organizationId:input.organizationId,runId:source.runId,selection:input.selection})
 return readTeacherFormGroupReport({...input,publishV2:true,population:{cohort,selection:input.selection,...presentation,populationLabel:input.selection.kind==='CLASSES'?presentation.populationLabel.replace(/^班级：/,'任教班级：'):presentation.populationLabel,versionKey:randomUUID(),policySnapshotId:frozen!.policySnapshotId}})
}
