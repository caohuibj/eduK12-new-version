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
}){
  if(input.respondents.length<5||new Set(input.respondents).size!==input.respondents.length)
    fail('TEACHER_REPORT_CURRENT_POPULATION_INVALID')
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
          AND release.report_projection->>'definitionDigest'=${input.definitionDigest}
        UNION ALL
        SELECT ledger.first_run_id AS "runId",TRUE AS enhanced
        FROM huiteacher_student_disclosure_ledgers ledger
        WHERE ledger.organization_id=${input.organizationId}
          AND ledger.teacher_user_id=${input.teacherUserId}
          AND ledger.form_digest=${input.definitionDigest}
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
  const contributors=await tx.$queryRaw<Contributor[]>(Prisma.sql`
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
