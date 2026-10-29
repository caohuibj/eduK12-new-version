import {Prisma} from '@prisma/client'

type Tx=Prisma.TransactionClient
type Scenario='TEACHER_ADULT_FORM_GROUP'|'TEACHER_STUDENT_EVALUATION'
type Prior={runId:string;enhanced:boolean}
type Contributor={runId:string;userId:string}

/** Compare only an identical immutable Form, never a different questionnaire.
 * Both historical and new releases are checked using actual FINAL submitters.
 * No student/teacher user IDs are stored in the release record.
 */
export function unsafeTeacherDisclosureOverlap(
  current:readonly string[],prior:readonly string[],minimumChange=5,
):boolean{
  const known=new Set(prior)
  const overlap=new Set(current.filter(id=>known.has(id))).size
  const added=current.length-overlap,removed=prior.length-overlap
  return overlap>0&&((added>0&&added<minimumChange)
    ||(removed>0&&removed<minimumChange))
}

export class TeacherComparableDisclosureError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherComparableDisclosureError'
  }
}
const fail=(code:string):never=>{throw new TeacherComparableDisclosureError(code)}

/** This runs ONLY in a first-release transaction under the Teacher school's
 * shared advisory xact lock. Read Committed for legacy GET is intentional:
 * a release committed while waiting for the lock must become visible.
 */
export async function assertTeacherComparableDisclosure(tx:Tx,input:{
  organizationId:string;runId:string;definitionDigest:string;
  scenario:Scenario;respondents:readonly string[];
  enhanced:boolean;teacherUserId?:string;
  comparableKeys?:readonly string[];
}){
  if(input.respondents.length<5||new Set(input.respondents).size!==input.respondents.length)
    fail('TEACHER_REPORT_CURRENT_POPULATION_INVALID')
  const comparableKeys=input.comparableKeys??['FORM:'+input.definitionDigest]
  let previous:Prior[]
  if(input.scenario==='TEACHER_ADULT_FORM_GROUP'){
    previous=await tx.$queryRaw<Prior[]>(Prisma.sql`
      SELECT prior."runId",BOOL_OR(prior.enhanced) AS enhanced FROM (
        SELECT release.source_run_id AS "runId",
          COALESCE(snapshot.effective_json->'options'->>'crossReleaseOverlapGuard'='true',FALSE)
            AS enhanced
        FROM education_report_release_records release
        LEFT JOIN education_report_policy_snapshots snapshot
          ON snapshot.id=release.policy_snapshot_id
          AND snapshot.organization_id=release.organization_id
        WHERE release.organization_id=${input.organizationId}
          AND release.report_kind='TEACHER_ADULT_FORM_GROUP'
          AND release.report_projection->>'definitionDigest'=${input.definitionDigest}
        UNION ALL
        SELECT ledger.first_run_id AS "runId",TRUE AS enhanced
        FROM huiteacher_group_disclosure_ledgers ledger
        WHERE ledger.organization_id=${input.organizationId}
          AND ledger.definition_digest=${input.definitionDigest}
      ) prior
      WHERE prior."runId"<>${input.runId}
      GROUP BY prior."runId" ORDER BY prior."runId" LIMIT 101
    `)
  }else{
    if(!input.teacherUserId)fail('TEACHER_REPORT_TARGET_MISSING')
    if(input.comparableKeys&&(!comparableKeys.length||comparableKeys.length>50||comparableKeys.some(key=>!/^(FORM|SCALE):[a-f0-9]{64}$/.test(key))))fail('TEACHER_REPORT_COMPARABLE_SOURCE_INVALID')
    previous=await tx.$queryRaw<Prior[]>(Prisma.sql`
      SELECT prior."runId",BOOL_OR(prior.enhanced) AS enhanced FROM (
        SELECT release.source_run_id AS "runId",
          COALESCE(snapshot.effective_json->'options'->>'crossReleaseOverlapGuard'='true',FALSE)
            AS enhanced
        FROM education_report_release_records release
        JOIN huiteacher_evaluation_run_links link
          ON link.organization_id=release.organization_id
          AND link.run_id=release.source_run_id
        JOIN huiteacher_evaluation_events event
          ON event.organization_id=link.organization_id AND event.id=link.event_id
        JOIN huiteacher_evaluation_targets target
          ON target.organization_id=event.organization_id AND target.id=event.target_id
        LEFT JOIN education_report_policy_snapshots snapshot
          ON snapshot.id=release.policy_snapshot_id
          AND snapshot.organization_id=release.organization_id
        WHERE release.organization_id=${input.organizationId}
          AND release.report_kind='TEACHER_STUDENT_EVALUATION'
          AND target.subject_user_id=${input.teacherUserId}
          AND (('FORM:'||(release.report_projection->>'definitionDigest'))=ANY(${[...comparableKeys]}::text[])
            OR release.report_projection->'comparableKeys' ?| ${[...comparableKeys]}::text[])
        UNION ALL
        SELECT ledger.first_run_id AS "runId",TRUE AS enhanced
        FROM huiteacher_student_disclosure_ledgers ledger
        WHERE ledger.organization_id=${input.organizationId}
          AND ledger.teacher_user_id=${input.teacherUserId}
          AND (('FORM:'||ledger.form_digest)=ANY(${[...comparableKeys]}::text[]) OR ledger.comparable_keys&&${[...comparableKeys]}::text[])
      ) prior
      WHERE prior."runId"<>${input.runId}
      GROUP BY prior."runId" ORDER BY prior."runId" LIMIT 101
    `)
  }
  // Standard V2 against only other Standard V2 does not opt into the
  // extra cross-release guard. A protected previous release cannot be
  // bypassed merely by choosing Standard on a subsequent new Run.
  if(!input.enhanced&&!previous.some(x=>x.enhanced))return
  if(previous.length>100)fail('TEACHER_REPORT_COMPARABLE_HISTORY_LIMIT')
  if(!previous.length)return
  const prefix=input.scenario==='TEACHER_ADULT_FORM_GROUP'
    ?'huiteacher-form:%':'huiteacher-student-form:%'
  const contributors=input.scenario==='TEACHER_STUDENT_EVALUATION'?await studentContributors(tx,{...input,teacherUserId:input.teacherUserId!,runIds:previous.map(record=>record.runId),comparableKeys}):await tx.$queryRaw<Contributor[]>(Prisma.sql`
    SELECT execution.run_id AS "runId",respondent.user_id AS "userId"
    FROM assessment_run_executions execution
    JOIN assessment_run_tracks track
      ON track.organization_id=execution.organization_id
      AND track.run_id=execution.run_id AND track.id=execution.track_id
      AND track.resource_family='FORM'
      AND track.resource_key LIKE ${prefix}
      AND track.resource_version=${input.definitionDigest}
    JOIN assessment_run_actor_snapshots respondent
      ON respondent.organization_id=execution.organization_id
      AND respondent.run_id=execution.run_id
      AND respondent.id=execution.respondent_actor_snapshot_id
      AND respondent.actor_role=${input.scenario==='TEACHER_ADULT_FORM_GROUP'?'TEACHER':'STUDENT'}
    JOIN huiteacher_form_attempts attempt
      ON attempt.organization_id=execution.organization_id
      AND attempt.run_id=execution.run_id AND attempt.run_execution_id=execution.id
      AND attempt.status='COMPLETED'
      AND attempt.definition_digest=${input.definitionDigest}
    JOIN huiteacher_form_finals final
      ON final.organization_id=attempt.organization_id
      AND final.attempt_id=attempt.id
      AND final.definition_digest=${input.definitionDigest}
    WHERE execution.organization_id=${input.organizationId}
      AND execution.run_id IN (${Prisma.join(previous.map(x=>x.runId))})
      AND execution.status='COMPLETED'
    ORDER BY execution.run_id,respondent.user_id
  `)
  const byRun=new Map<string,string[]>()
  for(const row of contributors){
    const ids=byRun.get(row.runId)??[]
    ids.push(row.userId);byRun.set(row.runId,ids)
  }
  for(const record of previous){
    const ids=byRun.get(record.runId)??[]
    if(ids.length<5||new Set(ids).size!==ids.length)
      fail('TEACHER_REPORT_COMPARABLE_SOURCE_INVALID')
    if(unsafeTeacherDisclosureOverlap(input.respondents,ids))
      fail('TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED')
  }
}

/** Exact historical FINAL contributors across both approved student runtimes.
 * This is a single batch; current membership withdrawal cannot trim history. */
async function studentContributors(tx:Tx,input:{organizationId:string;teacherUserId:string;runIds:string[];comparableKeys:readonly string[]}){
 const forms=input.comparableKeys.filter(key=>key.startsWith('FORM:')).map(key=>key.slice(5))
 return tx.$queryRaw<Contributor[]>(Prisma.sql`
  SELECT e.run_id AS "runId",respondent.user_id AS "userId" FROM assessment_run_executions e
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id
   AND respondent.run_id=e.run_id AND respondent.actor_role='STUDENT'
  JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.organization_id=e.organization_id
   AND subject.run_id=e.run_id AND subject.actor_role='TEACHER' AND subject.user_id=${input.teacherUserId}
  WHERE e.organization_id=${input.organizationId} AND e.run_id IN (${Prisma.join(input.runIds)}) AND e.status='COMPLETED' AND (
   (t.resource_family='FORM' AND t.resource_key LIKE 'huiteacher-student-form:%' AND t.resource_version=ANY(${forms}::text[])
    AND EXISTS(SELECT 1 FROM huiteacher_form_attempts a JOIN huiteacher_form_finals f ON f.attempt_id=a.id AND f.organization_id=a.organization_id AND f.definition_digest=a.definition_digest
     WHERE e.runtime_binding_kind='HUITEACHER_FORM_V2' AND a.id=e.runtime_binding_ref AND a.run_execution_id=e.id AND a.run_id=e.run_id
      AND a.organization_id=e.organization_id AND a.status='COMPLETED' AND a.respondent_user_id=respondent.user_id AND a.definition_digest=t.resource_version))
   OR (t.resource_family='BUNDLE' AND t.resource_version='1.0.0' AND EXISTS(
    SELECT 1 FROM huiteacher_evaluation_run_links link JOIN huiteacher_student_eval_configs cfg ON cfg.organization_id=link.organization_id AND cfg.event_id=link.event_id
    JOIN relational_assessment_assignments assignment ON assignment.id=e.relational_assignment_id AND assignment.status='COMPLETED'
     AND assignment.policy_domain='ORGANIZATION_RUN' AND assignment.analysis_mode='COHORT_AGGREGATE'
     AND assignment.subject_user_id=subject.user_id AND assignment.respondent_user_id=respondent.user_id
    JOIN composite_assessment_attempts parent ON e.runtime_binding_kind='COMPOSITE' AND parent.id=e.runtime_binding_ref AND parent.assignment_ref=assignment.id
     AND parent.episode_id=assignment.episode_id AND parent.user_id=respondent.user_id AND parent.respondent_user_id=respondent.user_id
     AND parent.subject_user_id=subject.user_id AND parent.status='COMPLETED' AND parent.delivery_mode='FINAL_ONLY' AND parent.runtime_generation='UNIFIED_V1'
     AND parent.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
    WHERE link.organization_id=e.organization_id AND link.run_id=e.run_id AND cfg.composition_version_id IS NOT NULL
     AND t.resource_key='education-composition:TEACHER:'||cfg.composition_version_id||':TEACHER:STUDENT_REPORT:1.0.0'
     AND t.frozen_resource_policy#>>'{educationComposition,origin,contentHash}'=cfg.composition_content_hash)))
  ORDER BY e.run_id,respondent.user_id`)
}
