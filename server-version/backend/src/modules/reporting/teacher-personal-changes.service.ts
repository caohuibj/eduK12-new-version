import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {resolveHistoricalRelationalEntry} from '../assessment-run/registeredResources'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {readTrainingPersonalLeafs} from '../composite/personal-tracking-results'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {educationTrackingSchema} from './education-personal-tracking'
import {projectPersonalChanges,type PersonalChanges} from './personal-tracking'
import {reportingFail} from './types'
const denied=():never=>reportingFail('REPORT_NOT_FOUND','本人变化报告不可访问',404)
/** Current Teacher SELF and organization authority. Canonical leaf reading and
 * projection are shared with Training without sharing its identity scope. */
export async function readTeacherPersonalChanges(input:{actorUserId:string;executionId:string}){
 return prisma.$transaction(async tx=>{
  type Wave={id:string;organizationId:string;runId:string;trackId:string;ordinal:number;baselineId:string;tracking:unknown;assignmentId:string;policy:any;policyHash:string;family:any;key:string;version:string;episodeId:string}
  const read=(baselineId?:string)=>tx.$queryRaw<Wave[]>(Prisma.sql`
   SELECT e.id,e.organization_id AS "organizationId",e.run_id AS "runId",e.track_id AS "trackId",run.personal_tracking_ordinal AS ordinal,
    run.personal_tracking_baseline_id AS "baselineId",run.personal_tracking AS tracking,e.relational_assignment_id AS "assignmentId",
    track.frozen_resource_policy AS policy,track.resource_policy_hash AS "policyHash",track.resource_family AS family,track.resource_key AS key,track.resource_version AS version,a.episode_id AS "episodeId"
   FROM assessment_run_executions e JOIN assessment_runs run ON run.id=e.run_id AND run.organization_id=e.organization_id AND run.status IN ('PUBLISHED','CLOSED')
   JOIN assessment_run_tracks track ON track.id=e.track_id AND track.organization_id=e.organization_id AND track.run_id=e.run_id
   JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.organization_id=e.organization_id AND subject.run_id=e.run_id AND subject.user_id=${input.actorUserId} AND subject.actor_role='TEACHER'
   JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id AND respondent.run_id=e.run_id AND respondent.user_id=${input.actorUserId} AND respondent.actor_role='TEACHER'
   JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
    AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT' AND a.subject_user_id=${input.actorUserId} AND a.respondent_user_id=${input.actorUserId}
    AND a.resource_kind=track.resource_family AND a.resource_key=track.resource_key AND a.resource_version=track.resource_version AND a.status NOT IN ('REVOKED','CANCELLED')
   JOIN huiteacher_evaluation_run_links link ON link.run_id=e.run_id AND link.organization_id=e.organization_id
   JOIN users person ON person.id=${input.actorUserId} AND person.account_domain='SCHOOL' AND person.role IN ('TEACHER','ADMIN') AND person.teacher_approved AND person.is_active AND NOT person.is_frozen
   WHERE e.status NOT IN ('REVOKED','CANCELLED') AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`,'REPORT_READ')}
    AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=e.organization_id AND d.user_id=${input.actorUserId} AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))
    AND ${baselineId?Prisma.sql`run.personal_tracking_baseline_id=${baselineId}`:Prisma.sql`e.id=${input.executionId}`}
   ORDER BY run.personal_tracking_ordinal,e.id LIMIT 101`)
  const end=(await read())[0]
  if(!end)denied()
  if(!await resolveEducationProductMemberScope({actorUserId:input.actorUserId,organizationId:end.organizationId,product:'HUITEACHER'}))denied()
  if(!end.baselineId)return {status:'NOT_CONFIGURED' as const}
  const [baseline]=await tx.$queryRaw<Array<{tracking:unknown}>>`SELECT personal_tracking AS tracking FROM assessment_runs WHERE organization_id=${end.organizationId} AND id=${end.baselineId}`
  const plan=educationTrackingSchema.parse(baseline?.tracking).plan
  if(!plan||plan.baselineWaveId!==end.baselineId)denied()
  const waves=await tx.$queryRaw<Array<{id:string;ordinal:number}>>`SELECT id,personal_tracking_ordinal AS ordinal FROM assessment_runs
   WHERE organization_id=${end.organizationId} AND personal_tracking_baseline_id=${end.baselineId} AND personal_tracking_ordinal<=${end.ordinal} AND status IN ('PUBLISHED','CLOSED') ORDER BY personal_tracking_ordinal LIMIT 101`
  if(waves.length>100)denied()
  const own=(await read(end.baselineId)).filter(w=>w.ordinal<=end.ordinal&&w.organizationId===end.organizationId)
  const eligible=own.filter(w=>educationTrackingSchema.parse(w.tracking).bindings.some(b=>b.trackId===w.trackId))
  if(eligible.length>100)denied()
  for(const wave of eligible){
   if(!wave.policy?.resultDisclosure||canonicalHash(wave.policy)!==wave.policyHash)denied()
   const entry=await resolveHistoricalRelationalEntry({resourceKind:wave.family,resourceKey:wave.key,resourceVersion:wave.version},tx)
   if(!entry||entry.releaseStatus!=='PUBLISHED'||!entry.resultDisclosure||canonicalHash(entry.resultDisclosure)!==canonicalHash(wave.policy.resultDisclosure))denied()
  }
  // Latest whole completed parent per assignment, independently of an
  // unfinished later runtime binding. No metric-wise fallback.
  const latest=eligible.length?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT DISTINCT ON (a.assignment_ref) a.id FROM composite_assessment_attempts a
   WHERE a.assignment_ref IN (${Prisma.join(eligible.map(w=>w.assignmentId))}) AND a.status='COMPLETED' AND a.completed_at IS NOT NULL
    AND a.user_id=${input.actorUserId} AND a.subject_user_id=${input.actorUserId} AND a.respondent_user_id=${input.actorUserId}
    AND a.delivery_mode='FINAL_ONLY' AND a.runtime_generation='UNIFIED_V1'
   ORDER BY a.assignment_ref,a.completed_at DESC,a.id DESC`):[]
  const parents=await tx.compositeAssessmentAttempt.findMany({where:{id:{in:latest.map(r=>r.id)}},include:{compositeAssessment:true}})
  const adapted=parents.map(parent=>{
   const wave=eligible.find(w=>w.assignmentId===parent.assignmentRef)!
   if(parent.compositeAssessmentId!==wave.policy.runtimeLaunchTarget?.ref||parent.episodeId!==wave.episodeId)denied()
   const tracking=educationTrackingSchema.parse(wave.tracking),rule=validateResultDisclosureContract(wave.policy.resultDisclosure).audiences.RESPONDENT
   return {...parent,compositeAssessment:{...parent.compositeAssessment,personalTrackingOrdinal:wave.ordinal,personalTracking:{schemaVersion:1,bindings:tracking.bindings.map(({metricId,itemId,scoreKey})=>({metricId,itemId,scoreKey,visible:rule.mode==='INDIVIDUAL_SUMMARY'&&rule.metricKeys.includes(scoreKey)&&rule.longitudinalMetricKeys.includes(scoreKey)}))}}}
  })
  const leaves=await readTrainingPersonalLeafs(tx,{scopedSubjectId:end.organizationId+':'+input.actorUserId,plan:plan!,parents:adapted})
  for(const leaf of leaves){const parent=parents.find(p=>p.id===leaf.attemptId)!;leaf.waveId=eligible.find(w=>w.assignmentId===parent.assignmentRef)!.runId}
  await tx.$queryRaw`SELECT id FROM assessment_run_executions WHERE id=${input.executionId} FOR UPDATE`
  const sourceHash=canonicalHash({kind:'TEACHER_PERSONAL_CHANGES_V1',plan,subject:input.actorUserId,organizationId:end.organizationId,waves,leaves})
  const [cached]=await tx.$queryRaw<Array<{cipher:string|null}>>`SELECT personal_changes_snapshots->>${sourceHash} AS cipher FROM assessment_run_executions WHERE id=${input.executionId}`
  if(cached?.cipher){const saved=decryptUnifiedRuntimePayload<{sourceHash:string;generatedAt:string;report:PersonalChanges}>(cached.cipher);if(saved.sourceHash!==sourceHash)denied();return {...saved.report,reportId:sourceHash,generatedAt:saved.generatedAt}}
  const report=projectPersonalChanges(plan!,waves,leaves)
  if(report.status!=='AVAILABLE')return report
  const generatedAt=new Date().toISOString(),cipher=encryptUnifiedRuntimePayload({sourceHash,generatedAt,report})
  await tx.$executeRaw`UPDATE assessment_run_executions SET personal_changes_snapshots=personal_changes_snapshots||jsonb_build_object(${sourceHash},${cipher}) WHERE id=${input.executionId}`
  return {...report,reportId:sourceHash,generatedAt}
 })
}
