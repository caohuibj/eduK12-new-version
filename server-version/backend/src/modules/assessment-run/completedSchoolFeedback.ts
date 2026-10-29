import {Prisma} from '@prisma/client'
import {currentRunPopulationAuthoritySql} from './currentPopulationAuthority'

/** Discovery of an own completed ordinary observer questionnaire. This is a
 * REPORT_READ branch only: closing intake or pausing an Activity cannot reopen
 * START, and RUN_START denial is independent from reading permitted history.
 * The feedback endpoint still projects the frozen per-unit disclosure limits.
 */
export const completedSchoolOrdinaryFeedbackSql=(executionId:Prisma.Sql,userId:string):Prisma.Sql=>Prisma.sql`EXISTS (
 SELECT 1 FROM assessment_run_executions history
 JOIN assessment_runs run ON run.id=history.run_id AND run.organization_id=history.organization_id
  AND run.status IN ('PUBLISHED','CLOSED')
 JOIN assessment_run_tracks track ON track.id=history.track_id AND track.run_id=history.run_id
  AND track.organization_id=history.organization_id AND track.resource_family='BUNDLE'
  AND track.resource_key LIKE 'education-composition:SCHOOL:%'
 JOIN assessment_run_actor_snapshots subject ON subject.id=history.subject_actor_snapshot_id
  AND subject.run_id=history.run_id AND subject.organization_id=history.organization_id AND subject.actor_role='STUDENT'
 JOIN assessment_run_actor_snapshots respondent ON respondent.id=history.respondent_actor_snapshot_id
  AND respondent.run_id=history.run_id AND respondent.organization_id=history.organization_id
  AND respondent.user_id=${userId} AND respondent.actor_role IN ('PARENT','TEACHER')
 JOIN relational_assessment_assignments assignment ON assignment.id=history.relational_assignment_id
  AND assignment.policy_domain='ORGANIZATION_RUN' AND assignment.status='COMPLETED'
  AND assignment.resource_kind=track.resource_family AND assignment.resource_key=track.resource_key
  AND assignment.resource_version=track.resource_version AND assignment.analysis_mode='INDIVIDUAL_ONLY'
  AND assignment.perspective='OBSERVER_REPORT' AND assignment.subject_user_id=subject.user_id
  AND assignment.respondent_user_id=respondent.user_id AND assignment.subject_role=subject.actor_role
  AND assignment.respondent_role=respondent.actor_role
 JOIN composite_assessment_attempts parent ON parent.id=history.runtime_binding_ref
  AND parent.assignment_ref=assignment.id AND parent.episode_id=assignment.episode_id
  AND parent.user_id=${userId} AND parent.respondent_user_id=${userId}
  AND parent.subject_user_id=subject.user_id AND parent.status='COMPLETED'
  AND parent.composite_assessment_id=track.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
  AND parent.delivery_mode='FINAL_ONLY' AND parent.runtime_generation='UNIFIED_V1'
 WHERE history.id=${executionId} AND history.status='COMPLETED' AND history.runtime_binding_kind='COMPOSITE'
  AND ${currentRunPopulationAuthoritySql(Prisma.sql`history.id`,'REPORT_READ')}
)`
