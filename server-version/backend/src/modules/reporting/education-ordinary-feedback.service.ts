import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {readFrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {readNativeEducationScaleFeedback,type NativeEducationFeedbackSource} from './education-native-scale-feedback'
import {reportingFail} from './types'

function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
type Input={executionId:string;actorUserId:string}
async function readOwn(tx:Prisma.TransactionClient,input:Input){
 const [row]=await tx.$queryRaw<Array<{organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;status:string;
  parentId:string|null;parentStatus:string|null;attemptEpoch:number|null;contextSnapshotHash:string|null;frozenSlots:string|null;frozenSlotsHash:string|null}>>(Prisma.sql`
  SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,t.frozen_resource_policy AS policy,
   t.resource_policy_hash AS "policyHash",e.status,p.id AS "parentId",p.status AS "parentStatus",p.attempt_epoch AS "attemptEpoch",
   p.context_snapshot_hash AS "contextSnapshotHash",p.frozen_active_slot_set_encrypted AS "frozenSlots",p.frozen_active_slot_set_hash AS "frozenSlotsHash"
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id AND r.status IN ('PUBLISHED','CLOSED')
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
   AND t.resource_family='BUNDLE' AND t.resource_key LIKE 'education-composition:TEACHER:%'
  JOIN huiteacher_evaluation_run_links link ON link.run_id=e.run_id AND link.organization_id=e.organization_id
  JOIN huiteacher_evaluation_events event ON event.id=link.event_id AND event.organization_id=e.organization_id AND event.status IN ('OPEN','CLOSED')
  JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.organization_id=e.organization_id
   AND subject.run_id=e.run_id AND subject.user_id=${input.actorUserId} AND subject.actor_role='TEACHER'
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id
   AND respondent.run_id=e.run_id AND respondent.user_id=${input.actorUserId} AND respondent.actor_role='TEACHER'
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
   AND a.subject_user_id=${input.actorUserId} AND a.respondent_user_id=${input.actorUserId} AND a.subject_role='TEACHER' AND a.respondent_role='TEACHER'
   AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT'
  LEFT JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND p.assignment_ref=a.id AND p.episode_id=a.episode_id AND p.user_id=${input.actorUserId}
   AND p.subject_user_id=${input.actorUserId} AND p.respondent_user_id=${input.actorUserId}
   AND p.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
   AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
  WHERE e.id=${input.executionId} AND ((e.status='COMPLETED' AND a.status='COMPLETED' AND p.status='COMPLETED')
    OR e.status IN ('ASSIGNED','STARTED') AND a.status IN ('OPEN','STARTED'))
   AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)
   AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`,'REPORT_READ')}
   AND NOT EXISTS(SELECT 1 FROM organization_access_denies deny WHERE deny.organization_id=e.organization_id AND deny.user_id=${input.actorUserId}
    AND deny.lifted_at IS NULL AND deny.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))`)
 return row
}
/** Respondent report rights are independent from authorship. Read stored FINAL
 * facts once; each immutable block's own ceiling controls its native projector.
 * No overall score, Form score/norm, raw answers or internal receipt is exposed. */
export async function readTeacherOrdinaryFeedback(input:Input){
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SET LOCAL join_collapse_limit = 1`
  const own=await readOwn(tx,input)
  if(!own)hidden()
  const identity=await readFrozenCompositionIdentity(tx,own)
  if(identity.origin.entry!=='TEACHER')hidden()
  if(own.status!=='COMPLETED')return {schemaVersion:1 as const,kind:'EDUCATION_FEEDBACK' as const,mode:'COMPOSITION' as const,state:'IN_PROGRESS' as const,title:identity.title,units:[]}
  if(!own.parentId||own.parentStatus!=='COMPLETED'||!own.attemptEpoch)hidden()
  const sources:NativeEducationFeedbackSource[]=[]
  for(const block of identity.manifest.filter(block=>block.kind==='SCALE')){
   const ceiling=identity.binding.unitReports.find(unit=>unit.blockId===block.blockId)
   if(!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash||block.itemIds.length!==1)hidden()
   if(ceiling.respondent.mode!=='INDIVIDUAL_SUMMARY')continue
   const unit=identity.units.find(unit=>unit.itemId===block.itemIds[0]&&unit.versionId===block.versionId)
   if(!unit)hidden()
   const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
   const contract:ResultDisclosureContractV1={schemaVersion:1,policyKey:'EDUCATION_PRIVATE_TOOL_V1',minimumRespondents:null,
    audiences:{RESPONDENT:ceiling.respondent,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
   sources.push({itemId:unit.itemId,scaleId:unit.scaleId,title:block.title,sourceDefinitionHash:unit.definitionHash,
    resultDisclosure:contract,privateVersion:{versionId:block.versionId,contentHash:block.contentHash}})
  }
  const reports=await readNativeEducationScaleFeedback(tx,{actorUserId:input.actorUserId,parent:{id:own.parentId!,status:own.parentStatus!,
   userId:input.actorUserId,subjectUserId:input.actorUserId,respondentUserId:input.actorUserId,attemptEpoch:own.attemptEpoch!,
   contextSnapshotHash:own.contextSnapshotHash,frozenActiveSlotSetEncrypted:own.frozenSlots,frozenActiveSlotSetHash:own.frozenSlotsHash},sources})
  const units=identity.manifest.map(block=>{
   const base={blockId:block.blockId,kind:block.kind,title:block.title}
   if(block.kind==='FORM')return {...base,state:'COMPLETION_ONLY' as const}
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
