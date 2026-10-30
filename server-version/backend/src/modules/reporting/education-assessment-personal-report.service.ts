import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {readEducationNativeBundleFeedback} from '../bundle-product/education-adapter'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { educationAssessmentResourceKey, type EducationAssessmentOrigin } from '../education-tools/assessment-resource.contract'
import type { RelationalProductEntryV1 } from '../assessment-relational/product-registry'
import type { StoredRelease } from '../measurement-content/repository'
import { validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
import { trainingFeedbackAvailability, trainingFeedbackPolicySchema } from '../assessment-policy/training-feedback-policy'
import { trainingFeedbackReportReady } from '../assessment-policy/participant-feedback'
import { trainingBoundContent, decodeTrainingReferenceBinding } from '../composite/training-reference-binding'
import { decodeTrainingFinalReceipt } from '../composite/training-content-final'
import { compositeItemSlotKey, loadFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import { loadStoredCanonicalUnitResults } from '../assessment-runtime/compact-assessment-storage'
import { readRespondentRunSummary } from './respondentSummary'
import { projectEducationAssessmentReports } from './education-assessment-report.projector'
import { reportingFail } from './types'

export type EducationAssessmentReportInput={actorUserId:string;executionId:string;product:'SCHOOL'|'TEACHER'}
/** Minimum source seam. This internal reader proves immutable source identity,
 * never caller report authority. The root adapter owns publication/source rights. */
export type EducationAssessmentReportIdentity={identityOnly:true;origin:EducationAssessmentOrigin;
  entry:RelationalProductEntryV1;runtime:{id:string;bundleInstance?:Parameters<typeof readEducationNativeBundleFeedback>[0]['instance']|null;formSections?:ReadonlyArray<unknown>;items?:ReadonlyArray<{type:string}>};releases:ReadonlyMap<string,StoredRelease>;authority:ReadonlyArray<unknown>}
export type EducationAssessmentReportDependencies<Source extends EducationAssessmentReportIdentity=EducationAssessmentReportIdentity>={
  /** Optional stricter education opening policy, read from the actual frozen
   * task/source settings. Null means no additional opening-time restriction. */
  readReportOpening?:(tx:Prisma.TransactionClient,input:EducationAssessmentReportInput&{organizationId:string;source:Source;attemptId:string;attemptEpoch:number})=>Promise<{releaseAt:string|null}>
  readSource:(tx:Prisma.TransactionClient,input:{product:'SCHOOL'|'TEACHER';organizationId:string;resourceKey:string;resourceVersion:string;purpose:'HISTORY';executionId:string;compositeId:string})=>Promise<Source|null>
  assertSourceAuthority:(tx:Prisma.TransactionClient,input:EducationAssessmentReportInput&{organizationId:string;source:Source;purpose:'REPORT_READ'})=>Promise<void>
}
type Own={organizationId:string;resourceKey:string;resourceVersion:string;attemptId:string;assignmentId:string;policy:Record<string,unknown>;policyHash:string}
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
const response=(state:'WITHHELD'|'COMPLETED'|'PENDING',message:string,releaseAt?:string|null)=>({schemaVersion:1 as const,
  kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT' as const,state,mode:state==='COMPLETED'?'COMPLETION_ONLY' as const:'NONE' as const,message,...(releaseAt?{releaseAt}:{})})

/** Execution-scoped self lane only. Observer, manager and matching Training
 * user/session IDs cannot become a respondent report authorization. */
async function readOwn(tx:Prisma.TransactionClient,input:EducationAssessmentReportInput){
  const role=input.product==='SCHOOL'?'STUDENT':'TEACHER'
  const rows=await tx.$queryRaw<Own[]>(Prisma.sql`
    SELECT e.organization_id AS "organizationId",t.resource_key AS "resourceKey",t.resource_version AS "resourceVersion",
      e.runtime_binding_ref AS "attemptId",e.relational_assignment_id AS "assignmentId",
      t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash"
    FROM assessment_run_executions e
    JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    JOIN assessment_runs run ON run.organization_id=e.organization_id AND run.id=e.run_id AND run.status IN ('PUBLISHED','CLOSED')
    JOIN organizations org ON org.id=e.organization_id AND org.status='ACTIVE' AND org.product_domain='SCHOOL'
    JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
    JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
    JOIN organization_memberships m ON m.id=r.membership_id AND m.organization_id=r.organization_id AND m.user_id=r.user_id
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    JOIN organization_persona_grants pg ON pg.organization_id=m.organization_id AND pg.membership_id=m.id
      AND pg.id=r.snapshot_payload->>'personaGrantId' AND pg.persona=${role} AND pg.revoked_at IS NULL
    WHERE e.id=${input.executionId} AND e.status IN ('STARTED','COMPLETED') AND e.runtime_binding_kind='COMPOSITE'
      AND t.resource_key LIKE 'education-assessment:%' AND t.resource_family IN ('BUNDLE','COGNITIVE','SITUATIONAL')
      AND r.user_id=${input.actorUserId} AND s.user_id=${input.actorUserId} AND r.actor_role=${role} AND s.actor_role=${role}
      AND r.provenance_kind='ORG_MEMBER' AND s.provenance_kind='ORG_MEMBER'
      AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT'
      AND a.respondent_user_id=${input.actorUserId} AND a.subject_user_id=${input.actorUserId}
      AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`,'REPORT_READ')}
      AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=e.organization_id AND d.user_id=${input.actorUserId}
        AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))
    LIMIT 1
  `)
  const own=rows[0]
  if(!own||!await resolveEducationProductMemberScope({actorUserId:input.actorUserId,organizationId:own.organizationId,
    product:input.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'},tx))return null
  return own
}

/** No permissive default adapter and no process/session authorization cache.
 * Inject the root's exact identity + current source authority readers at wiring. */
export function createEducationAssessmentReportReader<Source extends EducationAssessmentReportIdentity>(deps:EducationAssessmentReportDependencies<Source>){
  return async(input:EducationAssessmentReportInput)=>prisma.$transaction(async tx=>{
    // As in the Scale self-report reader, the exact execution anchors these
    // explicit joins. Bound planning in this transaction only; keep both
    // current-authority reads and restore the pooled setting on exit.
    await tx.$executeRaw`SET LOCAL join_collapse_limit = 1`
    const own=await readOwn(tx,input)
    if(!own)return null
    if(canonicalHash(own.policy)!==own.policyHash)hidden()
    const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:own.attemptId},include:{compositeAssessment:true}})
    if(!parent||parent.userId!==input.actorUserId||parent.respondentUserId!==input.actorUserId
      ||parent.subjectUserId!==input.actorUserId||parent.assignmentRef!==own.assignmentId)hidden()
    const sourceInput={executionId:input.executionId,compositeId:parent.compositeAssessmentId,product:input.product,organizationId:own.organizationId,resourceKey:own.resourceKey,resourceVersion:own.resourceVersion,purpose:'HISTORY' as const}
    const source=await deps.readSource(tx,sourceInput)
    if(!source||source.identityOnly!==true)hidden()
    const origin=source.origin
    if(origin.product!==input.product||origin.organizationId!==own.organizationId||educationAssessmentResourceKey(origin)!==own.resourceKey
      ||origin.adapterVersion!==own.resourceVersion||source.runtime.id!==origin.runtimeCompositeId
      ||source.entry.releaseStatus!=='PUBLISHED'||source.entry.applicability.resourceKey!==own.resourceKey
      ||source.entry.applicability.resourceVersion!==own.resourceVersion)hidden()
    const contract=validateResultDisclosureContract(own.policy.resultDisclosure)
    if(canonicalHash(contract)!==canonicalHash(source.entry.resultDisclosure))hidden()
    await deps.assertSourceAuthority(tx,{...input,organizationId:own.organizationId,source,purpose:'REPORT_READ'})
    if(parent.compositeAssessmentId!==origin.runtimeCompositeId)hidden()
    let openingIdentity:{releaseAt:string|null}|undefined
    const recheck=async()=>{
      const current=await readOwn(tx,input)
      if(!current||canonicalHash(current)!==canonicalHash(own))hidden()
      const latest=await deps.readSource(tx,sourceInput)
      if(!latest||canonicalHash(latest.origin)!==canonicalHash(origin)||canonicalHash(latest.entry)!==canonicalHash(source.entry)
        ||latest.runtime.id!==origin.runtimeCompositeId||canonicalHash(latest.authority)!==canonicalHash(source.authority))hidden()
      // Lifecycle is current; immutable hashes alone cannot retain a withdrawn report.
      for(const [id,release] of source.releases){const fresh=latest.releases.get(id);if(!fresh||fresh.contentHash!==release.contentHash||fresh.status!==release.status)hidden()}
      await deps.assertSourceAuthority(tx,{...input,organizationId:own.organizationId,source:latest,purpose:'REPORT_READ'})
      if(openingIdentity!==undefined){
        const currentOpening=await deps.readReportOpening!(tx,{...input,organizationId:own.organizationId,source:latest,attemptId:parent.id,attemptEpoch:parent.attemptEpoch})
        if(canonicalHash(currentOpening)!==canonicalHash(openingIdentity))hidden()
      }
    }
    const rule=contract.audiences.RESPONDENT
    if(rule.mode==='NONE'){await recheck();return response('WITHHELD','本次测评暂不提供个人反馈。')}
    const formOnly=origin.family==='BUNDLE'&&origin.units.length===0
    if(formOnly){
      // The source resolver validates the frozen pure-Form definition. No
      // measurement/reference/report receipt is needed to confirm a Form FINAL.
      if(!source.runtime.formSections?.length||source.runtime.items?.some(item=>item.type!=='FORM'))hidden()
      if(parent.status!=='COMPLETED'){await recheck();return response('WITHHELD','当前尚未收到整份表单的完成确认。')}
    }
    const job=!formOnly&&parent.asyncReportEpoch===parent.attemptEpoch?await tx.compositeReportJob.findUnique({where:{attemptId_attemptEpoch:{attemptId:parent.id,attemptEpoch:parent.attemptEpoch}},
      select:{status:true,attemptEpoch:true,slotSetHash:true,contextHash:true,aggregateInputHash:true,wholeAcceptedAt:true}}):null
    if(!formOnly&&(parent.status!=='COMPLETED'||!trainingFeedbackReportReady(parent,job))){
      // PENDING describes a real accepted asynchronous job, never missing facts.
      if(job&&['PENDING','PROCESSING'].includes(job.status)&&job.attemptEpoch===parent.attemptEpoch&&job.slotSetHash===parent.frozenActiveSlotSetHash
        &&job.contextHash===parent.contextSnapshotHash&&(parent.status==='COMPLETED'||job.wholeAcceptedAt)){
        await recheck();return response('PENDING','正式提交已接收，报告正在生成；无需再次交卷。')
      }
      await recheck();return response('WITHHELD','当前还没有可读取的正式完成报告。')
    }
    // The exact immutable education origin owns timing. A missing legacy field
    // means immediate; do not add defaults to the source or alter its hash.
    const frozenPolicy=(origin as EducationAssessmentOrigin&{feedbackPolicy?:unknown}).feedbackPolicy
    let timing:ReturnType<typeof trainingFeedbackAvailability>
    try{
      timing=trainingFeedbackAvailability({policy:trainingFeedbackPolicySchema.parse(frozenPolicy===undefined?{schemaVersion:1,mode:'IMMEDIATE'}:frozenPolicy),
        completed:parent.status==='COMPLETED',reportReady:true,now:new Date()})
    }catch{hidden()}
    if(timing.state!=='AVAILABLE'){await recheck();return response('WITHHELD','反馈尚未达到开放时间或披露条件。',timing.releaseAt)}
    // Optional workflow restrictions can only further withhold a frozen policy.
    const opening=await deps.readReportOpening?.(tx,{...input,organizationId:own.organizationId,source,attemptId:parent.id,attemptEpoch:parent.attemptEpoch})
    openingIdentity=opening
    if(opening?.releaseAt){
      const timestamp=Date.parse(opening.releaseAt)
      if(!Number.isFinite(timestamp))hidden()
      if(Date.now()<timestamp){await recheck();return response('WITHHELD','反馈尚未达到开放时间。',new Date(timestamp).toISOString())}
    }
    if(formOnly){await recheck();return response('COMPLETED','本次表单已正式完成，当前只提供完成确认。')}
    if(rule.mode==='COMPLETION_ONLY'){await recheck();return response('COMPLETED','本次作答已完成，当前仅提供完成确认。')}
    if(rule.mode!=='INDIVIDUAL_SUMMARY'||own.policy.analysisMode!=='INDIVIDUAL_ONLY'&&!isSelfGroupV2Entry(source.entry))hidden()
    // Existing current respondent disclosure remains an independent ceiling.
    const summary=await readRespondentRunSummary(input.actorUserId,input.executionId,{disclosureOnly:true,db:tx})
    if(summary.state!=='READY'||summary.mode!=='INDIVIDUAL_SUMMARY'){
      await recheck();return response('WITHHELD','当前反馈尚未获准显示。')
    }
    const binding=trainingBoundContent(parent),receipt=decodeTrainingFinalReceipt(parent),references=decodeTrainingReferenceBinding(parent)
    if(!binding||!receipt||!parent.frozenActiveSlotSetEncrypted||!parent.frozenActiveSlotSetHash){await recheck();return response('WITHHELD','本次测评缺少可校验的固定报告版本，暂不展示解释。')}
    if(binding.publicationHash!==origin.runtimeSnapshotHash||canonicalHash({schemaVersion:binding.schemaVersion,compositeId:binding.compositeId,units:binding.units})!==origin.runtimeSnapshotHash)hidden()
    const slots=await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted,tx)
    if(slots.snapshotHash!==parent.frozenActiveSlotSetHash||slots.attemptEpoch!==parent.attemptEpoch)hidden()
    const expected=origin.units.map(unit=>({unit,slotKey:compositeItemSlotKey(unit.itemId,unit.family==='SJT'?'SITUATIONAL':unit.family)}))
    const rows=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey:{in:expected.map(value=>value.slotKey)}}})
    if(rows.length!==expected.length||new Set(rows.map(row=>row.slotKey)).size!==expected.length)hidden()
    for(const row of rows){
      const frozen=slots.slots.find(slot=>slot.slotKey===row.slotKey),expectedUnit=expected.find(value=>value.slotKey===row.slotKey)?.unit
      if(!expectedUnit||!frozen||row.terminalState!=='COMPLETED'||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted
        ||row.compositeAttemptId!==parent.id||row.attemptEpoch!==parent.attemptEpoch||row.unitType!==frozen.unitType
        ||row.sourceDefinitionHash!==frozen.sourceDefinitionIdentity.hash)hidden()
    }
    const envelopes=await loadStoredCanonicalUnitResults(rows.map(row=>row.canonicalResultEncrypted!),tx)
    if(envelopes.length!==rows.length)hidden()
    const facts=new Map<string,typeof envelopes[number]>()
    for(const [index,row] of rows.entries()){
      const envelope=envelopes[index],unit=expected.find(value=>value.slotKey===row.slotKey)!.unit
      if(envelope.core.unitType!==row.unitType||envelope.core.sourceDefinitionHash!==row.sourceDefinitionHash
        ||envelope.core.compiledRuntimeHash!==row.compiledRuntimeHash||envelope.core.contextHash!==(parent.contextSnapshotHash??null)
        ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
        ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))hidden()
      facts.set(unit.itemId,envelope)
    }
    const available=new Set(Array.isArray(summary.metricKeys)?summary.metricKeys:[])
    const reports=projectEducationAssessmentReports({product:input.product,origin,binding,receipt,references,releases:source.releases,facts,
      metricKeys:new Set(rule.metricKeys.filter(key=>available.has(key))),
      ...(isSelfGroupV2Entry(source.entry)?{metricKeysByItem:new Map(origin.units.map(unit=>{
        const leaf=validateResultDisclosureContract(unit.groupDisclosure).audiences.RESPONDENT
        return [unit.itemId,new Set(leaf.mode==='INDIVIDUAL_SUMMARY'?leaf.metricKeys.filter(key=>available.has(key)&&rule.metricKeys.includes(key)):[])]
      }))}:{})})
    const nativeBundle=origin.nativeBundle&&source.runtime.bundleInstance?await readEducationNativeBundleFeedback({db:tx,attemptId:parent.id,instance:source.runtime.bundleInstance,identity:origin.nativeBundle,availableItemIds:new Set(reports.filter(r=>r.status==='READY').map(r=>r.itemId)),metricKeys:new Set(rule.metricKeys.filter(key=>available.has(key)))}):undefined
    await recheck()
    return {schemaVersion:1 as const,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT' as const,state:'READY' as const,mode:'INDIVIDUAL_SUMMARY' as const,
      message:'以下反馈依据本次作答冻结、且当前获准开放的工具与报告版本展示。',reports,...(nativeBundle?{nativeBundle}:{})}
  })
}
export type EducationAssessmentReportReader=ReturnType<typeof createEducationAssessmentReportReader>
