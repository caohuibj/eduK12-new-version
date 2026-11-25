import {readOrdinaryDeclaredFeedback,tryReadPreMaterializedDeclaredFeedback,tryReadPreMaterializedNativeScaleFeedback,type OrdinaryStoredContent} from './education-ordinary-declared-feedback'
import {decryptCompactField} from '../assessment-runtime/compact-field-codec'
import {schoolSelfGroupAssignmentSql} from '../assessment-run/educationCompositionExecution'
import {readOrdinaryNativeFeedback} from './education-ordinary-native-feedback'
import {loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {withBoundedPlannerRead,type PlannerBoundReadDb} from '../assessment-run/plannerBound'
import {readFrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {readNativeEducationScaleFeedback,type NativeEducationFeedbackSource} from './education-native-scale-feedback'
import {getContentReleaseBatch} from '../measurement-content/repository'
import {reportingFail} from './types'
import {matchesEducationCompositionRespondent} from '../education-tools/private-tool.composition-contracts'

function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
type Input={executionId:string;actorUserId:string}
type ScopedInput=Input&{entry:'SCHOOL'|'TEACHER'}
type ReadOwnDb = Pick<PlannerBoundReadDb, '$queryRaw'>
async function readOwn(tx:ReadOwnDb,input:ScopedInput,loadContent=false){
 const population=input.entry==='SCHOOL'?'STUDENT':'TEACHER'
 const [row]=await tx.$queryRaw<Array<{organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;status:string;
  subjectUserId:string;respondentUserId:string;subjectRole:string;respondentRole:string;relationshipKind:string;perspective:string;
  receiptOnly:boolean|null;contentState:OrdinaryStoredContent|null;preMaterializedReport?:string|null;parentId:string|null;parentStatus:string|null;attemptEpoch:number|null;publicationHash?:string|null;finalFeedbackCipher?:string|null;contextSnapshotHash:string|null;frozenSlots:string|null;frozenSlotsHash:string|null}>>(Prisma.sql`
  WITH target_exec AS MATERIALIZED (
   SELECT e.* FROM assessment_run_executions e WHERE e.id=${input.executionId} LIMIT 1
  )
  SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,t.frozen_resource_policy AS policy,
   t.resource_policy_hash AS "policyHash",e.status,p.receipt_only AS "receiptOnly",p.id AS "parentId",p.status AS "parentStatus",p.attempt_epoch AS "attemptEpoch",p.publication_hash AS "publicationHash",
   a.subject_user_id AS "subjectUserId",a.respondent_user_id AS "respondentUserId",a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",
   a.relationship_kind AS "relationshipKind",a.perspective,p.context_snapshot_hash AS "contextSnapshotHash",
   CASE WHEN a.relationship_kind='SELF' AND e.status='COMPLETED' AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE) THEN final.feedback_cipher END AS "finalFeedbackCipher",
   CASE WHEN p.publication_hash IS NULL AND a.relationship_kind='SELF' AND e.status='COMPLETED' AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE)
     AND NOT (${loadContent} AND j.status='READY' AND j.report_encrypted IS NOT NULL)
    THEN p.frozen_active_slot_set_encrypted END AS "frozenSlots",
   CASE WHEN p.publication_hash IS NULL AND a.relationship_kind='SELF' AND e.status='COMPLETED' AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE) THEN p.frozen_active_slot_set_hash END AS "frozenSlotsHash",
   ${loadContent?Prisma.sql`CASE WHEN p.publication_hash IS NULL AND a.relationship_kind='SELF' AND e.status='COMPLETED' AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE) AND j.status='READY' THEN j.report_encrypted END`:Prisma.sql`NULL::text`} AS "preMaterializedReport",
   ${loadContent?Prisma.sql`CASE WHEN p.publication_hash IS NULL AND a.relationship_kind='SELF' AND e.status='COMPLETED' AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE) THEN jsonb_build_object(
    'trainingContentBinding',CASE WHEN j.status='READY' AND j.report_encrypted IS NOT NULL THEN NULL::jsonb ELSE p.training_content_binding END,
    'trainingContentBindingHash',p.training_content_binding_hash,
    'trainingReferenceBinding',CASE WHEN j.status='READY' AND j.report_encrypted IS NOT NULL THEN NULL::jsonb ELSE p.training_reference_binding END,
    'trainingReferenceBindingHash',p.training_reference_binding_hash,
    'trainingContentInterpretationEncrypted',CASE WHEN j.status='READY' AND j.report_encrypted IS NOT NULL THEN NULL::text ELSE p.training_content_interpretation_encrypted END,
    'trainingContentInterpretationHash',p.training_content_interpretation_hash,
    'aggregateInputHash',p.aggregate_input_hash) END`:Prisma.sql`NULL::jsonb`} AS "contentState"
  FROM target_exec e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id AND r.status IN ('PUBLISHED','CLOSED')
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
   AND t.resource_family='BUNDLE' AND t.resource_key LIKE ${'education-composition:'+input.entry+':%'}
  JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.organization_id=e.organization_id
   AND subject.run_id=e.run_id AND subject.actor_role=${population}
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id
   AND respondent.run_id=e.run_id AND respondent.user_id=${input.actorUserId}
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
   AND a.subject_user_id=subject.user_id AND a.respondent_user_id=respondent.user_id
   AND a.subject_role=subject.actor_role AND a.respondent_role=respondent.actor_role
   AND (a.analysis_mode='INDIVIDUAL_ONLY' OR (a.analysis_mode='COHORT_AGGREGATE' AND a.subject_role='TEACHER' AND a.respondent_role='STUDENT'
    AND t.resource_key LIKE 'education-composition:TEACHER:%:TEACHER:STUDENT_REPORT:1.0.0')
    OR ${schoolSelfGroupAssignmentSql(Prisma.sql`t`,Prisma.sql`a`)})
  LEFT JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND p.assignment_ref=a.id AND p.episode_id=a.episode_id AND p.user_id=${input.actorUserId}
   AND p.subject_user_id=a.subject_user_id AND p.respondent_user_id=a.respondent_user_id
   AND p.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
   AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
  LEFT JOIN composite_report_jobs j ON p.publication_hash IS NULL AND j.attempt_id=p.id AND j.attempt_epoch=p.attempt_epoch
   AND j.slot_set_hash=p.frozen_active_slot_set_hash
   AND j.context_hash IS NOT DISTINCT FROM p.context_snapshot_hash
   AND j.aggregate_input_hash=p.aggregate_input_hash
  LEFT JOIN composite_attempt_finals final ON p.publication_hash IS NOT NULL
   AND final.attempt_id=p.id AND final.attempt_epoch=p.attempt_epoch AND final.publication_hash=p.publication_hash
  WHERE ((e.status='COMPLETED' AND a.status='COMPLETED' AND p.status='COMPLETED')
    OR e.status IN ('ASSIGNED','STARTED') AND a.status IN ('OPEN','STARTED'))
   AND ${input.entry==='TEACHER'?Prisma.sql`EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links link
     JOIN huiteacher_evaluation_events event ON event.id=link.event_id AND event.organization_id=link.organization_id
      AND event.status IN ('OPEN','CLOSED') WHERE link.organization_id=e.organization_id AND link.run_id=e.run_id)
    AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)`:
    Prisma.sql`EXISTS(SELECT 1 FROM campus_activity_runs link JOIN campus_activities activity
     ON activity.course_id=link.course_id AND activity.organization_id=link.organization_id AND activity.status IN ('OPEN','PAUSED','CLOSED')
     WHERE link.organization_id=e.organization_id AND link.run_id=e.run_id)
    AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id)`}
   AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`,'REPORT_READ')}
   AND NOT EXISTS(SELECT 1 FROM organization_access_denies deny WHERE deny.organization_id=e.organization_id AND deny.user_id=${input.actorUserId}
    AND deny.lifted_at IS NULL AND deny.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))`)
 return row
}
/** Respondent report rights are independent from authorship. Read stored FINAL
 * facts once; each immutable block's own ceiling controls its native projector.
 * No overall score, Form score/norm, raw answers or internal receipt is exposed. */
export const readTeacherOrdinaryFeedback=(input:Input)=>readOrdinaryFeedback({...input,entry:'TEACHER'})
export const readSchoolOrdinaryFeedback=(input:Input)=>readOrdinaryFeedback({...input,entry:'SCHOOL'})
async function readOrdinaryFeedback(input:ScopedInput){
 // Run the bounded-planner authority & live revocation query once; contentState
 // is materialized only for COMPLETED, non-receiptOnly SELF executions.
 const own=await withBoundedPlannerRead(prisma,tx=>readOwn(tx,input,true))
 if(!own || own.receiptOnly)hidden()
 // Reading through root prisma safely warms/reuses frozenCompositionIdentityCache
 // and verifies policyHash + live composition anchor without holding an interactive tx.
 const identity=await readFrozenCompositionIdentity(prisma,own)
 if(identity.origin.entry!==input.entry||!matchesEducationCompositionRespondent(identity.origin,own))hidden()
 if(own.status!=='COMPLETED')return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,state:'IN_PROGRESS' as const,title:identity.title,units:[]}
 if(!own.parentId||own.parentStatus!=='COMPLETED'||!own.attemptEpoch)hidden()
 // Reuse the existing observer contract: no new individual report right is
 // inferred from library U, authorship or becoming a parent/teacher respondent.
 // Its completion receipt needs no result decryption, scoring or report body.
 if(own.relationshipKind!=='SELF')return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,
  state:'COMPLETION_ONLY' as const,title:identity.title,units:identity.manifest.map(block=>({blockId:block.blockId,kind:block.kind,title:block.title,
   state:block.kind==='FORM'?'COMPLETION_ONLY' as const:'WITHHELD' as const}))}
 // V2 feedback_cipher is already joined into the bounded authority read.
 type CachedOrdinaryFeedback = {
  schemaVersion: 1
  kind: 'EDUCATION_FEEDBACK'
  mode: 'COMPOSITION'
  state: 'READY' | 'COMPLETION_ONLY'
  title: string
  units: Array<{
   blockId: string
   kind: string
   title: string
   state: 'READY' | 'COMPLETION_ONLY' | 'WITHHELD'
   nativeScaleUnits?: any[]
   declaredReport?: any
   message?: string
  }>
 }
 const singleRowFeedback = own.publicationHash && own.finalFeedbackCipher
  ? decryptCompactField<CachedOrdinaryFeedback & { _v2Verify?: { policyHash?: string; manifestHash?: string; releaseIds?: string[] } }>(own.finalFeedbackCipher)
  : null
 if (singleRowFeedback && singleRowFeedback.kind === 'EDUCATION_FEEDBACK') {
  const verify = singleRowFeedback._v2Verify
  let valid = true
  if (verify) {
    valid = verify.policyHash === own.policyHash && verify.manifestHash === identity.binding.manifestHash
    if (valid && verify.releaseIds?.length) {
      const liveReleases = await getContentReleaseBatch(prisma, verify.releaseIds)
      valid = verify.releaseIds.every(releaseId => {
        const release = liveReleases.get(releaseId)
        return Boolean(release && release.status !== 'REVOKED')
      })
    }
  }
  if (valid) {
    const { _v2Verify: _ignored, ...dto } = singleRowFeedback
    return dto
  }
 }
 const sources:NativeEducationFeedbackSource[]=[],declaredBlocks=new Set<string>(),nativeBlocks=new Set<string>()
 for(const block of identity.manifest.filter(block=>block.kind==='COGNITIVE'||block.kind==='SJT')){
  const ceiling=identity.binding.unitReports.find(unit=>unit.blockId===block.blockId)
  if(!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash)hidden()
  if(ceiling.respondent.mode==='INDIVIDUAL_SUMMARY')nativeBlocks.add(block.blockId)
 }
 for(const block of identity.manifest.filter(block=>block.kind==='SCALE')){
  const ceiling=identity.binding.unitReports.find(unit=>unit.blockId===block.blockId)
  if(!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash||block.itemIds.length!==1)hidden()
  if(ceiling.respondent.mode!=='INDIVIDUAL_SUMMARY')continue
  if(block.sourceProvider==='STANDARD_SCALE'){declaredBlocks.add(block.blockId);continue}
  const unit=identity.units.find(unit=>unit.itemId===block.itemIds[0]&&unit.versionId===block.versionId)
  if(!unit||unit.family!=='SCALE'||!unit.scaleId)hidden()
  const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
  const contract:ResultDisclosureContractV1={schemaVersion:1,policyKey:'EDUCATION_PRIVATE_TOOL_V1',minimumRespondents:null,
   audiences:{RESPONDENT:ceiling.respondent,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
  sources.push({itemId:unit.itemId,scaleId:unit.scaleId,title:block.title,sourceDefinitionHash:unit.definitionHash,
   resultDisclosure:contract,...(block.sourceProvider==='LIBRARY_SCALE'?{approvedLibrary:{approvedSnapshotHash:block.contentHash}}:
    {privateVersion:{versionId:block.versionId,contentHash:block.contentHash}})})
 }
 // Completion-only / withheld respondent feedback needs no snapshot decryption.
 if(!sources.length&&!declaredBlocks.size&&!nativeBlocks.size){
  return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,
   state:'COMPLETION_ONLY' as const,title:identity.title,
   units:identity.manifest.map(block=>({blockId:block.blockId,kind:block.kind,title:block.title,
    state:block.kind==='FORM'?'COMPLETION_ONLY' as const:'WITHHELD' as const}))}
 }
 // Immutable completed snapshots and content releases do not need an interactive
 // ReadCommitted transaction pinning a Prisma pool connection across CPU projection.
 const preMaterializedDeclared=declaredBlocks.size&&own.preMaterializedReport
  ?await tryReadPreMaterializedDeclaredFeedback(prisma,{
   preMaterializedReport:own.preMaterializedReport,
   identity,
   own:{parentId:own.parentId!,attemptEpoch:own.attemptEpoch!,policyHash:own.policyHash,contentState:own.contentState},
   declaredBlocks,
  })
  :null
 const preMaterializedNativeScales=sources.length&&own.preMaterializedReport
  ?tryReadPreMaterializedNativeScaleFeedback({
   preMaterializedReport:own.preMaterializedReport,
   identity,
   own:{parentId:own.parentId!,attemptEpoch:own.attemptEpoch!,policyHash:own.policyHash,contentState:own.contentState},
   sources,
  })
  :null
 const isWholeV2=Boolean(own.publicationHash)
 const needsDeclaredLive=Boolean(declaredBlocks.size&&!preMaterializedDeclared)
 const needsNativeScaleLive=Boolean(sources.length&&!preMaterializedNativeScales)
 const needsSlots=!isWholeV2&&Boolean(nativeBlocks.size||needsNativeScaleLive||needsDeclaredLive)
 let frozenSlots=own.frozenSlots
 let contentState=own.contentState
 const needsDeferredParentFields=(isWholeV2&&!contentState&&Boolean(needsDeclaredLive||nativeBlocks.size||needsNativeScaleLive))
  ||(needsSlots&&!frozenSlots)
  ||((needsDeclaredLive||nativeBlocks.size>0)&&contentState!=null&&contentState.trainingContentBinding==null&&contentState.trainingContentBindingHash!=null)
 if(needsDeferredParentFields){
  const [deferred]=await prisma.$queryRaw<Array<{
   frozenSlots:string|null
   trainingContentBindingHash:string|null
   trainingReferenceBindingHash:string|null
   trainingContentInterpretationHash:string|null
   aggregateInputHash:string|null
   trainingContentBinding:OrdinaryStoredContent['trainingContentBinding']
   trainingReferenceBinding:OrdinaryStoredContent['trainingReferenceBinding']
   trainingContentInterpretationEncrypted:string|null
  }>>(Prisma.sql`
   SELECT p.frozen_active_slot_set_encrypted AS "frozenSlots",
    p.training_content_binding_hash AS "trainingContentBindingHash",p.training_reference_binding_hash AS "trainingReferenceBindingHash",
    p.training_content_interpretation_hash AS "trainingContentInterpretationHash",p.aggregate_input_hash AS "aggregateInputHash",
    p.training_content_binding AS "trainingContentBinding",
    p.training_reference_binding AS "trainingReferenceBinding",
    p.training_content_interpretation_encrypted AS "trainingContentInterpretationEncrypted"
   FROM composite_assessment_attempts p
   WHERE p.id=${own.parentId!} AND p.attempt_epoch=${own.attemptEpoch!} AND p.user_id=${input.actorUserId}
   LIMIT 1
  `)
  if(!deferred)hidden()
  frozenSlots=deferred.frozenSlots
  if(contentState||isWholeV2){
   contentState={
    ...(contentState??{trainingContentBindingHash:deferred.trainingContentBindingHash,
      trainingReferenceBindingHash:deferred.trainingReferenceBindingHash,
      trainingContentInterpretationHash:deferred.trainingContentInterpretationHash,aggregateInputHash:deferred.aggregateInputHash}),
    trainingContentBinding:deferred.trainingContentBinding,
    trainingReferenceBinding:deferred.trainingReferenceBinding,
    trainingContentInterpretationEncrypted:deferred.trainingContentInterpretationEncrypted,
   }
  }
 }
 const slots=needsSlots&&frozenSlots?await loadFrozenActiveSlotSet(frozenSlots,prisma):undefined
 if(needsSlots&&(!slots||slots.snapshotHash!==own.frozenSlotsHash||slots.attemptEpoch!==own.attemptEpoch))hidden()
 const [native,declared,reports]=await Promise.all([
  nativeBlocks.size?readOrdinaryNativeFeedback(prisma,{identity,parent:{...contentState!,id:own.parentId!,attemptEpoch:own.attemptEpoch!,contextSnapshotHash:own.contextSnapshotHash,publicationHash:own.publicationHash??null},slots,actorUserId:input.actorUserId,blockIds:nativeBlocks}):Promise.resolve(new Map()),
  preMaterializedDeclared
   ?Promise.resolve(preMaterializedDeclared)
   :declaredBlocks.size?readOrdinaryDeclaredFeedback(prisma,{identity,parent:{...contentState!,id:own.parentId!,attemptEpoch:own.attemptEpoch!,contextSnapshotHash:own.contextSnapshotHash,publicationHash:own.publicationHash??null},slots,blockIds:declaredBlocks}):Promise.resolve(new Map()),
  preMaterializedNativeScales
   ?Promise.resolve(preMaterializedNativeScales)
   :sources.length?readNativeEducationScaleFeedback(prisma,{actorUserId:input.actorUserId,parent:{id:own.parentId!,status:own.parentStatus!,
    userId:input.actorUserId,subjectUserId:input.actorUserId,respondentUserId:input.actorUserId,attemptEpoch:own.attemptEpoch!,
    contextSnapshotHash:own.contextSnapshotHash,publicationHash:own.publicationHash??null,frozenActiveSlotSetEncrypted:frozenSlots,frozenActiveSlotSetHash:own.frozenSlotsHash},sources,slotSet:slots}):Promise.resolve(new Map()),
 ])
 const units=identity.manifest.map(block=>{
  const base={blockId:block.blockId,kind:block.kind,title:block.title}
  if(block.kind==='FORM')return {...base,state:'COMPLETION_ONLY' as const}
  if(block.kind==='COGNITIVE'||block.kind==='SJT'){
   const report=native.get(block.itemIds[0])
   return report?{...base,state:'READY' as const,...report}:{...base,state:'WITHHELD' as const}
  }
  if(block.sourceProvider==='STANDARD_SCALE'){
   const report=declared.get(block.itemIds[0])
   return report?.status==='READY'&&report.rendered?{...base,state:'READY' as const,declaredReport:report.rendered,...(report.message?{message:report.message}:{})}:{...base,state:'WITHHELD' as const}
  }
  const report=reports.get(block.itemIds[0])
  return report?.state==='PROJECTED'?{...base,state:'READY' as const,nativeScaleUnits:report.unitReports}:{...base,state:'WITHHELD' as const}
 })
 return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,
  state:units.some(unit=>unit.state==='READY')?'READY' as const:'COMPLETION_ONLY' as const,title:identity.title,units}
}
