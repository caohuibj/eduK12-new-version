import {readOrdinaryDeclaredFeedback,type OrdinaryStoredContent} from './education-ordinary-declared-feedback'
import {loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {readFrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {readNativeEducationScaleFeedback,type NativeEducationFeedbackSource} from './education-native-scale-feedback'
import {reportingFail} from './types'
import {matchesEducationCompositionRespondent} from '../education-tools/private-tool.composition-contracts'

function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
type Input={executionId:string;actorUserId:string}
type ScopedInput=Input&{entry:'SCHOOL'|'TEACHER'}
async function readOwn(tx:Prisma.TransactionClient,input:ScopedInput,loadContent=false){
 const population=input.entry==='SCHOOL'?'STUDENT':'TEACHER'
 const [row]=await tx.$queryRaw<Array<{organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;status:string;
  subjectUserId:string;respondentUserId:string;subjectRole:string;respondentRole:string;relationshipKind:string;perspective:string;
  contentState:OrdinaryStoredContent|null;parentId:string|null;parentStatus:string|null;attemptEpoch:number|null;contextSnapshotHash:string|null;frozenSlots:string|null;frozenSlotsHash:string|null}>>(Prisma.sql`
  SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,t.frozen_resource_policy AS policy,
   t.resource_policy_hash AS "policyHash",e.status,p.id AS "parentId",p.status AS "parentStatus",p.attempt_epoch AS "attemptEpoch",
   a.subject_user_id AS "subjectUserId",a.respondent_user_id AS "respondentUserId",a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",
   a.relationship_kind AS "relationshipKind",a.perspective,p.context_snapshot_hash AS "contextSnapshotHash",
   CASE WHEN a.relationship_kind='SELF' THEN p.frozen_active_slot_set_encrypted END AS "frozenSlots",
   CASE WHEN a.relationship_kind='SELF' THEN p.frozen_active_slot_set_hash END AS "frozenSlotsHash",
   ${loadContent?Prisma.sql`CASE WHEN a.relationship_kind='SELF' THEN jsonb_build_object('trainingContentBinding',p.training_content_binding,'trainingContentBindingHash',p.training_content_binding_hash,
    'trainingReferenceBinding',p.training_reference_binding,'trainingReferenceBindingHash',p.training_reference_binding_hash,
    'trainingContentInterpretationEncrypted',p.training_content_interpretation_encrypted,'trainingContentInterpretationHash',p.training_content_interpretation_hash,
    'aggregateInputHash',p.aggregate_input_hash) END`:Prisma.sql`NULL::jsonb`} AS "contentState"
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id AND r.status IN ('PUBLISHED','CLOSED')
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
    AND t.resource_key LIKE 'education-composition:TEACHER:%:TEACHER:STUDENT_REPORT:1.0.0'))
  LEFT JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND p.assignment_ref=a.id AND p.episode_id=a.episode_id AND p.user_id=${input.actorUserId}
   AND p.subject_user_id=a.subject_user_id AND p.respondent_user_id=a.respondent_user_id
   AND p.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
   AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
  WHERE e.id=${input.executionId} AND ((e.status='COMPLETED' AND a.status='COMPLETED' AND p.status='COMPLETED')
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
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SET LOCAL join_collapse_limit = 1`
  const own=await readOwn(tx,input,true)
  if(!own)hidden()
  const identity=await readFrozenCompositionIdentity(tx,own)
  if(identity.origin.entry!==input.entry||!matchesEducationCompositionRespondent(identity.origin,own))hidden()
  if(own.status!=='COMPLETED')return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,state:'IN_PROGRESS' as const,title:identity.title,units:[]}
  if(!own.parentId||own.parentStatus!=='COMPLETED'||!own.attemptEpoch)hidden()
  // Reuse the existing observer contract: no new individual report right is
  // inferred from library U, authorship or becoming a parent/teacher respondent.
  // Its completion receipt needs no result decryption, scoring or report body.
  if(own.relationshipKind!=='SELF')return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,
   state:'COMPLETION_ONLY' as const,title:identity.title,units:identity.manifest.map(block=>({blockId:block.blockId,kind:block.kind,title:block.title,
    state:block.kind==='FORM'?'COMPLETION_ONLY' as const:'WITHHELD' as const}))}
  const sources:NativeEducationFeedbackSource[]=[],declaredBlocks=new Set<string>()
  for(const block of identity.manifest.filter(block=>block.kind==='SCALE')){
   const ceiling=identity.binding.unitReports.find(unit=>unit.blockId===block.blockId)
   if(!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash||block.itemIds.length!==1)hidden()
   if(ceiling.respondent.mode!=='INDIVIDUAL_SUMMARY')continue
   if(block.sourceProvider==='STANDARD_SCALE'){declaredBlocks.add(block.blockId);continue}
   const unit=identity.units.find(unit=>unit.itemId===block.itemIds[0]&&unit.versionId===block.versionId)
   if(!unit)hidden()
   const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
   const contract:ResultDisclosureContractV1={schemaVersion:1,policyKey:'EDUCATION_PRIVATE_TOOL_V1',minimumRespondents:null,
    audiences:{RESPONDENT:ceiling.respondent,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
   sources.push({itemId:unit.itemId,scaleId:unit.scaleId,title:block.title,sourceDefinitionHash:unit.definitionHash,
    resultDisclosure:contract,...(block.sourceProvider==='LIBRARY_SCALE'?{approvedLibrary:{approvedSnapshotHash:block.contentHash}}:
     {privateVersion:{versionId:block.versionId,contentHash:block.contentHash}})})
  }
  const slots=(sources.length||declaredBlocks.size)&&own.frozenSlots?await loadFrozenActiveSlotSet(own.frozenSlots,tx):undefined
  if((sources.length||declaredBlocks.size)&&(!slots||slots.snapshotHash!==own.frozenSlotsHash||slots.attemptEpoch!==own.attemptEpoch))hidden()
  const declared=declaredBlocks.size?await readOrdinaryDeclaredFeedback(tx,{identity,parent:{...own.contentState!,id:own.parentId!,attemptEpoch:own.attemptEpoch!,contextSnapshotHash:own.contextSnapshotHash},slots:slots!,blockIds:declaredBlocks}):new Map()
  const reports=await readNativeEducationScaleFeedback(tx,{actorUserId:input.actorUserId,parent:{id:own.parentId!,status:own.parentStatus!,
   userId:input.actorUserId,subjectUserId:input.actorUserId,respondentUserId:input.actorUserId,attemptEpoch:own.attemptEpoch!,
   contextSnapshotHash:own.contextSnapshotHash,frozenActiveSlotSetEncrypted:own.frozenSlots,frozenActiveSlotSetHash:own.frozenSlotsHash},sources,slotSet:slots})
  const units=identity.manifest.map(block=>{
   const base={blockId:block.blockId,kind:block.kind,title:block.title}
   if(block.kind==='FORM')return {...base,state:'COMPLETION_ONLY' as const}
   if(block.sourceProvider==='STANDARD_SCALE'){
    const report=declared.get(block.itemIds[0])
    return report?.status==='READY'&&report.rendered?{...base,state:'READY' as const,declaredReport:report.rendered,...(report.message?{message:report.message}:{})}:{...base,state:'WITHHELD' as const}
   }
   const report=reports.get(block.itemIds[0])
   return report?.state==='PROJECTED'?{...base,state:'READY' as const,nativeScaleUnits:report.unitReports}:{...base,state:'WITHHELD' as const}
  })
  // Preserve the existing report reader's fresh post-materialization fence;
  // source/units/score facts remain immutable and are not loaded a second time.
  const current=await readOwn(tx,input)
  if(!current||current.parentId!==own.parentId||current.policyHash!==own.policyHash||canonicalHash(current.policy)!==own.policyHash)hidden()
  return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,
   state:units.some(unit=>unit.state==='READY')?'READY' as const:'COMPLETION_ONLY' as const,title:identity.title,units}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
