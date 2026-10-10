import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext, contextHasCapability } from '../organization/access'
import { listOrganizationReportingSources, listPublishedReportingSpecs } from '../reporting/discovery'
import { getPublishedReportingSpec } from '../reporting/spec'
import { readReportingCohort } from '../reporting/cohort'
import { generateOrganizationGroupAnalysis } from '../reporting/service'
import { readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail } from '../reporting/types'

/** PR5 first tranche: INTERNAL school-only, whole frozen SELF/STUDENT Run.
 * This route never publishes peer/teacher ratings or longitudinal comparisons.
 * A technical floor is not a substitute for a separate school privacy review.
 */
export const CAMPUS_GROUP_MIN_N = 10
const hidden = ():never=>reportingFail('CAMPUS_GROUP_REPORT_NOT_FOUND','school report unavailable',404)

export async function requireCampusGroupManager(actor:AuthenticatedPrincipal, organizationId:string){
  if(actor.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(actor.role))hidden()
  const c=await resolveOrganizationAccessContext({principal:actor,organizationId})
  if(!c)return hidden()
  if(c.productDomain!=='SCHOOL' || c.organizationStatus!=='ACTIVE' || !c.membershipId
    || c.explicitDenies.some(d=>['*','REPORT_READ','ORG_GROUP_REPORT_V1','PSYCHOLOGY_STAFF'].includes(d)))return hidden()
  // School governance may read non-identifying GROUP reports, never individual
  // results. A professional is distinct from an ordinary TEACHER persona.
  if(c.orgRole!=='ORG_ADMIN'
    && !(c.personas.includes('COUNSELOR')&&contextHasCapability(c,'PSYCHOLOGY_STAFF')))hidden()
  return {userId:actor.userId,platformRole:actor.platformRole}
}

export function assertReviewedCampusGroupSpec(input:{
  analysisKind:string;minimumCohortN?:number;minimumContributorN?:number;
  metricRules?:Array<{minimumMetricN?:number}>
}):void{
  if(input.analysisKind!=='GROUP' || !input.metricRules?.length
    || (input.minimumCohortN??0)<CAMPUS_GROUP_MIN_N
    || (input.minimumContributorN??0)<CAMPUS_GROUP_MIN_N
    || input.metricRules.some(r=>(r.minimumMetricN??0)<CAMPUS_GROUP_MIN_N)){
    reportingFail('CAMPUS_GROUP_REVIEW_REQUIRED',
      'school aggregate requires a reviewed GROUP spec with cohort, contributor and metric privacy floors',409)
  }
}

/** Avoid pre-close/time-window differencing and single-person cohorts. */
async function assertCampusWholeRunSource(input:{
  organizationId:string;runId:string;trackId:string
}):Promise<number>{
  const rows=await prisma.$queryRaw<Array<{
    total:number;respondents:number;allSelfStudents:boolean;runReady:boolean;activityReady:boolean
  }>>`
    SELECT COUNT(e.id)::int AS "total",
      COUNT(DISTINCT subject.user_id)::int AS "respondents",
      COALESCE(BOOL_AND(subject.actor_role='STUDENT'
        AND respondent.actor_role='STUDENT'
        AND subject.user_id=respondent.user_id
        AND assignment.relationship_kind='SELF'
        AND assignment.perspective='SELF_REPORT'
        AND subject.membership_id IS NOT NULL),FALSE) AS "allSelfStudents",
      BOOL_AND(r.status='CLOSED' AND r.closed_at <= statement_timestamp()-interval '24 hours') AS "runReady",
      BOOL_AND(activity.status='CLOSED'
        AND activity.closed_at <= statement_timestamp()-interval '24 hours') AS "activityReady"
    FROM assessment_run_executions e
    JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
    JOIN assessment_run_tracks track ON track.id=e.track_id
      AND track.run_id=e.run_id AND track.organization_id=e.organization_id
    JOIN campus_activity_runs ar ON ar.run_id=e.run_id AND ar.organization_id=e.organization_id
    JOIN campus_activities activity ON activity.organization_id=ar.organization_id
      AND activity.course_id=ar.course_id
    JOIN organizations org ON org.id=r.organization_id
      AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
    LEFT JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id
      AND subject.organization_id=e.organization_id AND subject.run_id=e.run_id
    LEFT JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
      AND respondent.organization_id=e.organization_id AND respondent.run_id=e.run_id
    LEFT JOIN relational_assessment_assignments assignment ON assignment.id=e.relational_assignment_id
    WHERE e.organization_id=${input.organizationId}
      AND e.run_id=${input.runId} AND e.track_id=${input.trackId}
  `
  const row=rows[0]
  if(!row||row.total<CAMPUS_GROUP_MIN_N||row.respondents!==row.total
    ||!row.allSelfStudents||!row.runReady||!row.activityReady) {
    reportingFail('CAMPUS_GROUP_SOURCE_WITHHELD',
      'school aggregate is unavailable until the whole approved cohort and release delay are satisfied',409)
  }
  return row.total
}

/** Prevent differently constituted school GROUP and longitudinal artifacts from
 * being combined as differencing oracles. This bound is intentionally conservative:
 * a different Run can be compared only when its contributor identities are
 * identical across all previously released GROUP/REPEATED/MATCHED reports.
 * Frozen membership stays inside SQL and the withholding error is constant.
 * The guard is repeated after generate.
 */
export async function assertCampusNoGroupDifferencing(input:{
  organizationId:string;runId:string;trackId:string
}):Promise<void>{
  const prior=await prisma.$queryRaw<Array<{priorN:number;shared:number;currentN:number}>>(Prisma.sql`
    WITH current_members AS (
      SELECT DISTINCT subject.user_id AS user_id
      FROM assessment_run_executions execution
      JOIN assessment_run_actor_snapshots subject
        ON subject.organization_id=execution.organization_id
        AND subject.run_id=execution.run_id AND subject.id=execution.subject_actor_snapshot_id
      WHERE execution.organization_id=${input.organizationId}
        AND execution.run_id=${input.runId} AND execution.track_id=${input.trackId}
    ),
    historical_cohorts AS (
      -- A released school GROUP is one privacy disclosure. Each frozen Wave in
      -- a released longitudinal artifact is also a disclosure of that cohort.
      -- Query by frozen cohort identity, not current class membership.
      SELECT artifact.cohort_snapshot_id AS cohort_id, artifact.generated_at
      FROM reporting_analysis_artifacts artifact
      WHERE artifact.organization_id=${input.organizationId}
        AND artifact.analysis_kind='GROUP'
        AND artifact.cohort_snapshot_id IS NOT NULL
      UNION ALL
      SELECT wave.cohort_snapshot_id AS cohort_id, artifact.generated_at
      FROM reporting_analysis_artifacts artifact
      JOIN reporting_analysis_artifact_waves aw
        ON aw.organization_id=artifact.organization_id AND aw.artifact_id=artifact.id
      JOIN reporting_series_waves wave
        ON wave.organization_id=aw.organization_id AND wave.series_id=aw.series_id
        AND wave.id=aw.wave_id
      WHERE artifact.organization_id=${input.organizationId}
        AND artifact.analysis_kind IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
    ),
    previous_distinct_cohorts AS (
      SELECT old.id AS cohort_id, MAX(historic.generated_at) AS last_generated_at
      FROM historical_cohorts historic
      JOIN reporting_cohort_snapshots old ON old.id=historic.cohort_id
        AND old.organization_id=${input.organizationId}
      WHERE (old.source_run_id<>${input.runId} OR old.source_track_id<>${input.trackId}
        OR old.selector->>'kind' IS DISTINCT FROM 'RUN_TRACK_SUBJECTS')
      GROUP BY old.id
      ORDER BY MAX(historic.generated_at) DESC, old.id DESC
      LIMIT 101
    )
    SELECT old.eligible_n AS "priorN",
      (SELECT COUNT(*)::int FROM jsonb_array_elements(old.members) member
        JOIN current_members cm ON cm.user_id=member->>'userId') AS "shared",
      (SELECT COUNT(*)::int FROM current_members) AS "currentN"
    FROM previous_distinct_cohorts prior
    JOIN reporting_cohort_snapshots old ON old.id=prior.cohort_id
      AND old.organization_id=${input.organizationId}
    ORDER BY prior.last_generated_at DESC, old.id DESC
  `)
  if(prior.length>100 || prior.some(p=>p.shared>0
    &&(p.priorN!==p.currentN||p.shared!==p.currentN))){
    reportingFail('CAMPUS_GROUP_DIFFERENCING_WITHHELD',
      'overlapping populations require independent privacy adjudication',409)
  }
}

type SafeMetric={state:'present';validN?:number;missingN?:number;aggregations?:{mean?:unknown}}
type GroupProjection={
  kind?:string;state?:string;eligibleN?:number;resultContributorN?:number;
  metrics?:Record<string,SafeMetric>;evidence?:{level?:string;limitations?:string[]}
}

/** Never send exact N, timestamps of responses, identities, variance,
 * distribution cells, source selector or precise outcome values to the UI.
 * A partial contribution cannot produce a comparable school aggregate.
 */
export function projectCampusGroupReport(input:{
  artifactId:string;generatedAt:string;projection:unknown
}){
  const p=input.projection as GroupProjection
  const n=p?.eligibleN??0
  const permitted=p?.kind==='GROUP'&&p?.state==='present'
    &&Number.isInteger(n)&&n>=CAMPUS_GROUP_MIN_N
    &&p.resultContributorN===n
  const metrics:Record<string,{mean:number}>={}
  if(permitted){
    for(const [key,value] of Object.entries(p.metrics??{})){
      if(value.state!=='present'||value.validN!==n||value.missingN!==0)continue
      const mean=value.aggregations?.mean
      if(typeof mean==='number'&&Number.isFinite(mean)){
        metrics[key]={mean:Math.round(mean*10)/10}
      }
    }
  }
  const usable=permitted&&Object.keys(metrics).length>0
  return {
    artifactId:input.artifactId,
    state:usable?'READY' as const:'WITHHELD' as const,
    kind:'SCHOOL_GROUP' as const,
    metrics:usable?metrics:{},
    limitations:[
      '仅用于学校内部支持性研究与群体改善，不用于个人诊断、教师绩效或学生评价者追踪。',
      '仅展示完整样本的有限均值，隐藏人数、方差、分布和精确原始结果。',
      '请使用正式科学方案手册解释指标；当前投影不提供常模、临床阈值或因果结论。',
    ],
  }
}

async function reviewedSpec(specId:string){
  const spec=await getPublishedReportingSpec(specId)
  if(spec.definition.analysisKind!=='GROUP'){
    return reportingFail('CAMPUS_GROUP_REVIEW_REQUIRED','not an approved campus GROUP analysis',409)
  }
  assertReviewedCampusGroupSpec(spec.definition)
  return spec
}

export async function listCampusGroupReportCatalog(actor:AuthenticatedPrincipal,organizationId:string){
  const principal=await requireCampusGroupManager(actor,organizationId)
  const [specs,sources]=await Promise.all([
    listPublishedReportingSpecs({principal,organizationId,analysisKind:'GROUP',page:1,pageSize:50}),
    listOrganizationReportingSources({principal,organizationId,page:1,pageSize:100}),
  ])
  // Published reporting specs are reviewed independently, but campus floor
  // qualification is a separate requirement.
  const allowedSpecs=specs.list.filter(s=>s.analysisKind==='GROUP'
    &&(s.privacy.minimumCohortN??0)>=CAMPUS_GROUP_MIN_N
    &&(s.privacy.minimumContributorN??0)>=CAMPUS_GROUP_MIN_N)
  const sourceList=sources.list.filter(s=>s.resource.family!=='COGNITIVE')
  return {specs:allowedSpecs.map(s=>({
    specId:s.specId,title:s.specKey,version:s.version,
    privacy:s.privacy,metricIds:s.metricIds,
  })),sources:sourceList.map(s=>({
    runId:s.runId,trackId:s.trackId,name:s.runName,
    resource:{family:s.resource.family,key:s.resource.key,version:s.resource.version},
  })),truncated:!!sources.truncated||specs.total>50}
}

export async function generateCampusGroupReport(input:{
  actor:AuthenticatedPrincipal;organizationId:string;runId:string;trackId:string;specId:string
}){
  const principal=await requireCampusGroupManager(input.actor,input.organizationId)
  await reviewedSpec(input.specId)
  await assertCampusWholeRunSource(input)
  await assertCampusNoGroupDifferencing(input)
  // No cohortSelector option exists here. Arbitrary filters must never become
  // a child- or teacher-targeted reporting tool.
  const result=await generateOrganizationGroupAnalysis({
    principal,organizationId:input.organizationId,
    runId:input.runId,trackId:input.trackId,specId:input.specId,
  })
  const authorized=await readOrganizationReportingArtifact({
    principal,organizationId:input.organizationId,artifactId:result.artifactId,
  })
  await assertCampusNoGroupDifferencing(input)
  await requireCampusGroupManager(input.actor,input.organizationId)
  return projectCampusGroupReport(authorized)
}

export async function readCampusGroupReport(input:{
  actor:AuthenticatedPrincipal;organizationId:string;artifactId:string
}){
  const principal=await requireCampusGroupManager(input.actor,input.organizationId)
  const target=await prisma.$queryRaw<Array<{
    specId:string;runId:string;trackId:string;cohortSnapshotId:string|null
  }>>`
    SELECT a.spec_id AS "specId",a.cohort_snapshot_id AS "cohortSnapshotId",
      a.artifact_payload->'source'->>'runId' AS "runId",
      a.artifact_payload->'source'->>'trackId' AS "trackId"
    FROM reporting_analysis_artifacts a
    WHERE a.id=${input.artifactId} AND a.organization_id=${input.organizationId}
      AND a.analysis_kind='GROUP' AND a.policy_domain='ORG_GROUP_REPORT_V1'
    LIMIT 1
  `
  if(!target[0]?.specId||!target[0]?.runId||!target[0]?.trackId)hidden()
  await reviewedSpec(target[0].specId)
  const size=await assertCampusWholeRunSource({organizationId:input.organizationId,
    runId:target[0].runId,trackId:target[0].trackId})
  // An unrelated reporting route may previously have created an arbitrary
  // subgroup cohort. Trusted managers bypass ordinary fixed-population
  // disclosure checks, so the SCHOOL wrapper must independently reject that
  // historical artifact and require the exact frozen Run/Track population.
  if(!target[0].cohortSnapshotId)return hidden()
  const cohort=await readReportingCohort(target[0].cohortSnapshotId)
  if(cohort.organizationId!==input.organizationId
    ||cohort.sourceRunId!==target[0].runId ||cohort.sourceTrackId!==target[0].trackId
    ||cohort.selector.kind!=='RUN_TRACK_SUBJECTS'
    ||cohort.eligibleN!==size ||cohort.members.length!==size
    ||new Set(cohort.members.map(member=>member.userId)).size!==size)return hidden()
  await assertCampusNoGroupDifferencing({
    organizationId:input.organizationId,runId:target[0].runId,trackId:target[0].trackId,
  })
  const report=await readOrganizationReportingArtifact({
    principal,organizationId:input.organizationId,artifactId:input.artifactId,
  })
  await assertCampusNoGroupDifferencing({
    organizationId:input.organizationId,runId:target[0].runId,trackId:target[0].trackId,
  })
  await requireCampusGroupManager(input.actor,input.organizationId)
  return projectCampusGroupReport(report)
}
