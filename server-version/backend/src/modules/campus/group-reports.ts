import { Prisma } from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext, contextHasCapability } from '../organization/access'
import { listOrganizationReportingSources, listPublishedReportingSpecs } from '../reporting/discovery'
import { getPublishedReportingSpec } from '../reporting/spec'
import { readReportingCohort } from '../reporting/cohort'
import {loadSchoolPrivateGroupDisclosure,schoolPrivateGroupLeafDisclosure} from '../education-tools/school-private-group-leaf'
import { readReportingArtifactRecord } from '../reporting/artifact'
import { listAuthoritativeRunLeafSources } from '../reporting/resultSource'
import { educationGroupSelector, educationGroupPresentation, listEducationGroupSelections, type EducationGroupSelection } from '../reporting/education-group-selection'
import { generateOrganizationGroupAnalysis } from '../reporting/service'
import { governedArtifactMetrics, narrowGovernedProjection, reportingAudienceForContext, reportingLeafDisclosureContract } from '../reporting/governedDisclosure'
import { readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail, type ReportingCohortSnapshotRecord, type ReportingLeafSourceV2 } from '../reporting/types'
import { withCampusReportReleaseLock } from './report-release-lock'
import { unsafeComparableGeneralOverlapCounts } from './generalGroupV2.differencing'
import {readFrozenPrivacyForRun} from '../report-privacy/snapshot.service'
import {ENHANCED} from '../report-privacy/registry'
import {parseFrozenSchoolOptions} from './privacyV2'
import {projectCampusGeneralGroupV2} from './generalGroupV2.projection'
import type {TaskArtifactCursor,TaskArtifactPointer} from '../reporting/task-artifact'
import {assertCampusMetricDifferencing} from './group-contributor-differencing'

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
  return {userId:actor.userId,platformRole:actor.platformRole,groupAudience:reportingAudienceForContext(c)}
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
      WHERE (old.source_run_id IS DISTINCT FROM ${input.runId} OR old.source_track_id IS DISTINCT FROM ${input.trackId}
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

/** Same existing overlap rule, applied to the actual frozen subgroup. A parent
 * container/slot/spec change cannot reset the identity of a leaf measurement.
 * Unknown legacy disclosures remain conservatively comparable. */
export async function assertCampusLeafGroupDifferencing(input:{
  organizationId:string;cohort:ReportingCohortSnapshotRecord;leaf:ReportingLeafSourceV2;minimumN?:number
}):Promise<void>{
  const current=input.cohort.members.map(member=>member.userId)
  const schoolSource=input.leaf.instrumentKey.startsWith('education-private-scale:')?await prisma.$transaction(tx=>loadSchoolPrivateGroupDisclosure(tx,{
    organizationId:input.organizationId,runId:input.cohort.sourceRunId,trackId:input.cohort.sourceTrackId})):null
  const leafContract=schoolSource?schoolPrivateGroupLeafDisclosure(schoolSource,input.leaf).contract:await reportingLeafDisclosureContract(input.leaf)
  const minimumN=Math.max(input.minimumN??CAMPUS_GROUP_MIN_N,leafContract.minimumRespondents??0)
  const rows=await prisma.$queryRaw<Array<{priorN:number;shared:number;minimumN:number}>>(Prisma.sql`
    WITH current_members AS (SELECT value AS user_id FROM jsonb_array_elements_text(${JSON.stringify(current)}::jsonb)),
    historical AS (
      SELECT a.cohort_snapshot_id AS cohort_id,a.generated_at
      FROM reporting_analysis_artifacts a
      WHERE a.organization_id=${input.organizationId} AND a.analysis_kind='GROUP'
        AND (a.artifact_payload->'source'->'leaf' IS NULL
          OR (a.artifact_payload->'source'->'leaf'->>'unitType'=${input.leaf.unitType}
            AND a.artifact_payload->'source'->'leaf'->>'instrumentKey'=${input.leaf.instrumentKey}))
      UNION ALL
      SELECT w.cohort_snapshot_id,a.generated_at FROM reporting_analysis_artifacts a
      JOIN reporting_analysis_artifact_waves aw ON aw.artifact_id=a.id AND aw.organization_id=a.organization_id
      JOIN reporting_series_waves w ON w.id=aw.wave_id AND w.organization_id=aw.organization_id
      WHERE a.organization_id=${input.organizationId} AND a.analysis_kind IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
    )
    SELECT jsonb_array_length(cohort.members) AS "priorN",
      (SELECT COUNT(*)::int FROM jsonb_array_elements(cohort.members) member
        JOIN current_members ON current_members.user_id=member->>'userId') AS shared,
      GREATEST(${minimumN},
      COALESCE((track.frozen_resource_policy->>'minimumRespondents')::int,0),
      COALESCE((track.requested_policy->>'minimumRespondents')::int,0))::int AS "minimumN" FROM historical
    JOIN reporting_cohort_snapshots cohort ON cohort.id=historical.cohort_id AND cohort.organization_id=${input.organizationId}
    JOIN assessment_run_tracks track ON track.organization_id=${input.organizationId}
      AND track.run_id=${input.cohort.sourceRunId} AND track.id=${input.cohort.sourceTrackId}
    GROUP BY cohort.id,cohort.members,track.id ORDER BY MAX(historical.generated_at) DESC,cohort.id DESC LIMIT 101
  `)
  if(rows.length>100||rows.some(row=>unsafeComparableGeneralOverlapCounts(current.length,row.priorN,row.shared,Math.max(CAMPUS_GROUP_MIN_N,row.minimumN??0))))
    reportingFail('CAMPUS_GROUP_DIFFERENCING_WITHHELD','overlapping populations have a smaller-than-permitted disclosure difference',409)
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

export function projectCampusLeafGroupReport(input:{artifactId:string;generatedAt:string;projection:unknown;
  presentation?:{sourceLabel:string;populationLabel:string};
  metricMetadata?:Record<string,{unit:string|null;minimumN?:number}>},leaf:ReportingLeafSourceV2){
  const p=input.projection as GroupProjection
  const n=p?.eligibleN??0
  const permitted=p?.kind==='GROUP'&&p?.state==='present'&&n>=CAMPUS_GROUP_MIN_N
  return {artifactId:input.artifactId,generatedAt:input.generatedAt,projection:{
    title:'学校群体报告',sourceLabel:`${input.presentation?.sourceLabel??leaf.instrumentKey} · ${leaf.instrumentKey} · ${leaf.instrumentVersion}`,
    cutoff:input.generatedAt,populationLabel:input.presentation?.populationLabel??'本任务选定叶工具的冻结群体',
    completedN:permitted&&p.resultContributorN===n?n:null,countUnit:'PERSON' as const,
    assignedN:permitted?n:null,tool:{key:leaf.instrumentKey,title:leaf.instrumentKey,kind:leaf.unitType},
    metrics:Object.entries(p.metrics??{}).map(([key,metric])=>{
      const aggregations=metric.aggregations as Record<string,unknown>|undefined
      const missing=metric.missingN??0
      const floor=Math.max(CAMPUS_GROUP_MIN_N,input.metricMetadata?.[key]?.minimumN??0)
      const present=permitted&&metric.state==='present'&&(metric.validN??0)>=floor
        &&(missing===0||missing>=floor)
      const numeric=(value:unknown)=>present&&typeof value==='number'&&Number.isFinite(value)?value:null
      const distribution=aggregations?.distribution as {state:string;cells?:Array<{value:number;count:number}>}|undefined
      return {key,label:key,type:'NUMBER' as const,unit:input.metricMetadata?.[key]?.unit??null,
        state:present?'present' as const:'suppressed' as const,validN:present?metric.validN??null:null,
        missingN:present?missing:null,mean:numeric(aggregations?.mean),sdSample:numeric(aggregations?.sdSample),
        range:null,observedRange:present?(aggregations?.minMax as {min:number;max:number}|undefined)??null:null,
        qualityCounts:{},measurement:leaf,distributionSuppressed:present&&distribution?.state==='suppressed',
        frequencies:present&&distribution?.state==='present'?(distribution.cells??[]).map(cell=>({value:String(cell.value),label:String(cell.value),count:cell.count,proportion:metric.validN?cell.count/metric.validN:null})):[],
      }
    }),
    limitations:['按已发布科学方案与原工具披露规则展示；人数不足及小缺失补集保持抑制。',
      '本报告呈现正式数值指标，选项编号和自由文本不转换为心理分数。',
      '均值与标准差只展示方案已定义的统计，不增设常模、阈值或因果结论。'],
  }}
}

/** Both new and historical leaf reads use the existing frozen privacy policy.
 * A legacy Run keeps its strict projection; selecting a leaf is not a policy reset. */
export async function projectCampusLeafGroupWithPolicy(input:Parameters<typeof projectCampusLeafGroupReport>[0]&{
  organizationId:string;runId:string
},leaf:ReportingLeafSourceV2){
  const frozen=await readFrozenPrivacyForRun(prisma,{organizationId:input.organizationId,runId:input.runId,
    product:'HUISCHOOL',scenario:['SCHOOL_GENERAL_EDUCATION_GROUP','SCHOOL_SENSITIVE_WELLBEING_GROUP']})
  let options=ENHANCED
  if(frozen.mode==='FROZEN_V1'){
    if(frozen.scenario!=='SCHOOL_GENERAL_EDUCATION_GROUP'&&frozen.scenario!=='SCHOOL_SENSITIVE_WELLBEING_GROUP')return hidden()
    options=parseFrozenSchoolOptions(frozen.effective,frozen.scenario)
  }
  const report=projectCampusLeafGroupReport(input,leaf)
  const safe=projectCampusGeneralGroupV2({artifactId:input.artifactId,projection:input.projection,options,
    minimumN:CAMPUS_GROUP_MIN_N,metricMinimums:Object.fromEntries(report.projection.metrics
      .map(metric=>[metric.key,Math.max(CAMPUS_GROUP_MIN_N,input.metricMetadata?.[metric.key]?.minimumN??0)]))})
  report.projection.completedN=safe.completedN
  report.projection.assignedN=safe.participantN
  report.projection.metrics=report.projection.metrics.map(metric=>{
    const approved=safe.metrics[metric.key]
    const present=metric.state==='present'&&!!approved
    return {...metric,state:present?'present' as const:'suppressed' as const,
      validN:present?approved.validN??null:null,missingN:present?approved.missingN??null:null,
      mean:present?approved.mean:null,sdSample:present?approved.sdSample??null:null,
      observedRange:null,frequencies:[],distributionSuppressed:false}
  })
  report.projection.limitations.push('人数、统计精度和可见项目遵循任务发布时冻结的披露政策；旧任务延续受限摘要。')
  return report
}

async function reviewedSpec(specId:string){
  const spec=await getPublishedReportingSpec(specId)
  if(spec.definition.analysisKind!=='GROUP'){
    return reportingFail('CAMPUS_GROUP_REVIEW_REQUIRED','not an approved campus GROUP analysis',409)
  }
  assertReviewedCampusGroupSpec(spec.definition)
  return {...spec,definition:spec.definition}
}

export async function listCampusGroupReportSources(actor:AuthenticatedPrincipal,organizationId:string,page=1){
  const principal=await requireCampusGroupManager(actor,organizationId)
  const result=await listOrganizationReportingSources({principal,organizationId,page,pageSize:100,analysisKind:'GROUP'})
  return {sources:result.list.map(s=>({runId:s.runId,trackId:s.trackId,name:s.runName,
    resource:{family:s.resource.family,key:s.resource.key,version:s.resource.version}})),nextSourcePage:result.nextPage}
}

export async function listCampusGroupReportCatalog(actor:AuthenticatedPrincipal,organizationId:string){
  const principal=await requireCampusGroupManager(actor,organizationId)
  const [specs,sources,artifacts]=await Promise.all([
    listPublishedReportingSpecs({principal,organizationId,analysisKind:'GROUP',page:1,pageSize:50}),
    listOrganizationReportingSources({principal,organizationId,page:1,pageSize:100,analysisKind:'GROUP'}),
    prisma.$queryRaw<Array<{artifactId:string;generatedAt:Date}>>`
      SELECT a.id AS "artifactId",a.generated_at AS "generatedAt" FROM reporting_analysis_artifacts a
      WHERE a.organization_id=${organizationId} AND a.analysis_kind='GROUP'
        AND a.artifact_payload->>'schemaVersion'='2'
        AND EXISTS(SELECT 1 FROM campus_activity_runs ar WHERE ar.organization_id=a.organization_id
          AND ar.run_id=a.artifact_payload->'source'->>'runId')
      ORDER BY a.generated_at DESC,a.id DESC LIMIT 100
    `,
  ])
  // Published reporting specs are reviewed independently, but campus floor
  // qualification is a separate requirement.
  const allowedSpecs=specs.list.filter(s=>s.analysisKind==='GROUP'
    &&(s.privacy.minimumCohortN??0)>=CAMPUS_GROUP_MIN_N
    &&(s.privacy.minimumContributorN??0)>=CAMPUS_GROUP_MIN_N)
  const sourceList=sources.list
  return {specs:allowedSpecs.map(s=>({
    specId:s.specId,title:s.specKey,version:s.version,
    privacy:s.privacy,metricIds:s.metricIds,
  })),sources:sourceList.map(s=>({
    runId:s.runId,trackId:s.trackId,name:s.runName,
    resource:{family:s.resource.family,key:s.resource.key,version:s.resource.version},
  })),artifacts,nextSourcePage:sources.nextPage,truncated:!!sources.truncated||specs.total>50}
}

async function campusGroupHistoryPage(input:{organizationId:string;runId:string;trackId:string;before?:TaskArtifactCursor}){
  const rows=await prisma.$queryRaw<TaskArtifactPointer[]>(Prisma.sql`
    SELECT a.id AS "artifactId",to_char(a.generated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "generatedAt"
    FROM reporting_analysis_artifacts a
    WHERE a.organization_id=${input.organizationId} AND a.analysis_kind='GROUP'
      AND a.artifact_payload->'source'->>'runId'=${input.runId}
      AND a.artifact_payload->'source'->>'trackId'=${input.trackId}
      AND a.artifact_payload->>'schemaVersion'='2'
      AND EXISTS(SELECT 1 FROM campus_activity_runs ar WHERE ar.organization_id=a.organization_id AND ar.run_id=${input.runId})
      ${input.before?Prisma.sql`AND (a.generated_at,a.id)<(${input.before.generatedAt}::timestamp,${input.before.artifactId})`:Prisma.empty}
    ORDER BY a.generated_at DESC,a.id DESC LIMIT 26`)
  const artifacts=rows.slice(0,25)
  return {artifacts,nextCursor:rows.length>25?artifacts[24]:null}
}
export async function listCampusGroupReportHistory(input:{actor:AuthenticatedPrincipal;organizationId:string;runId:string;trackId:string;before?:TaskArtifactCursor}){
  await requireCampusGroupManager(input.actor,input.organizationId)
  return campusGroupHistoryPage(input)
}
export async function listCampusGroupReportTools(input:{actor:AuthenticatedPrincipal;organizationId:string;runId:string;trackId:string}){
  const principal=await requireCampusGroupManager(input.actor,input.organizationId)
  await assertCampusWholeRunSource(input)
  const [tools,groups,history]=await Promise.all([
    listAuthoritativeRunLeafSources({...input,groupAudience:principal.groupAudience}),listEducationGroupSelections({...input,product:'SCHOOL'}),
    campusGroupHistoryPage(input),
  ])
  await requireCampusGroupManager(input.actor,input.organizationId)
  return {tools,groups,...history}
}

export async function generateCampusGroupReport(input:{
  actor:AuthenticatedPrincipal;organizationId:string;runId:string;trackId:string;specId:string;
  leaf?:ReportingLeafSourceV2;selection?:EducationGroupSelection
}){
  // Deny unprivileged callers before opening an extra PostgreSQL connection.
  await requireCampusGroupManager(input.actor,input.organizationId)
  return withCampusReportReleaseLock(input.organizationId, async () => {
    const principal=await requireCampusGroupManager(input.actor,input.organizationId)
    const spec=await reviewedSpec(input.specId)
    await assertCampusWholeRunSource(input)
    if(!input.leaf)await assertCampusNoGroupDifferencing(input)
    if(input.selection&&!input.leaf)reportingFail('REPORT_SELECTOR_INVALID','a subgroup requires an explicit leaf source',400)
    const cohortSelector=input.selection?await educationGroupSelector(input.organizationId,'SCHOOL',input.selection):undefined
    const presentation=input.leaf?await educationGroupPresentation({...input,selection:input.selection??{kind:'ALL'}}):undefined
    const result=await generateOrganizationGroupAnalysis({
      principal,organizationId:input.organizationId,
      runId:input.runId,trackId:input.trackId,specId:input.specId,
      leaf:input.leaf,cohortSelector,
      presentation,
      beforeCompute:input.leaf?async cohort=>{await assertCampusLeafGroupDifferencing({organizationId:input.organizationId,cohort,leaf:input.leaf!,minimumN:spec.definition.analysisKind==='GROUP'?Math.max(spec.definition.minimumCohortN,spec.definition.minimumContributorN,...spec.definition.metricRules.map(rule=>rule.minimumMetricN)):CAMPUS_GROUP_MIN_N})}:undefined,
      beforePersist:input.leaf?async({cohort,payload})=>{
        const allowed=await governedArtifactMetrics({principal,artifact:{id:payload.artifactId,organizationId:input.organizationId,
          specId:spec.id,analysisKind:'GROUP',policyDomain:'ORG_GROUP_REPORT_V1',cohortSnapshotId:cohort.id,
          seriesId:null,sourceRunId:null,sourceTrackId:null,subjectActorSnapshotId:null,relationshipKind:null,perspective:null,
          analysisIdentityHash:payload.analysisIdentityHash,snapshotHash:canonicalHash(payload),generatedByUserId:payload.generatedByUserId,
          generatedAt:new Date(payload.generatedAt),artifactPayload:payload}})
        const view=await projectCampusLeafGroupWithPolicy({artifactId:payload.artifactId,generatedAt:payload.generatedAt,
          organizationId:input.organizationId,runId:input.runId,projection:narrowGovernedProjection(payload.projection,allowed),
          metricMetadata:payload.schemaVersion===2?payload.metricMetadata:{}},input.leaf!)
        const contract=await reportingLeafDisclosureContract(input.leaf!,{organizationId:input.organizationId,runId:input.runId,trackId:input.trackId})
        await assertCampusMetricDifferencing({organizationId:input.organizationId,cohort,payload,metricRules:spec.definition.metricRules,
          visibleMetricIds:view.projection.metrics.filter(metric=>metric.state==='present').map(metric=>metric.key),
          minimumN:Math.max(CAMPUS_GROUP_MIN_N,contract.minimumRespondents??0,spec.definition.minimumCohortN,spec.definition.minimumContributorN)})
      }:undefined,
    })
    const authorized=await readOrganizationReportingArtifact({
      principal,organizationId:input.organizationId,artifactId:result.artifactId,
    })
    if(!input.leaf)await assertCampusNoGroupDifferencing(input)
    await requireCampusGroupManager(input.actor,input.organizationId)
    if(input.leaf)return projectCampusLeafGroupWithPolicy({...authorized,organizationId:input.organizationId,runId:input.runId},input.leaf)
    return projectCampusGroupReport(authorized)
  })
}

export async function readCampusGroupReport(input:{
  actor:AuthenticatedPrincipal;organizationId:string;artifactId:string
}){
  // Deny unprivileged callers before opening an extra PostgreSQL connection.
  await requireCampusGroupManager(input.actor,input.organizationId)
  return withCampusReportReleaseLock(input.organizationId, async () => {
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
    const spec=await reviewedSpec(target[0].specId)
    const size=await assertCampusWholeRunSource({organizationId:input.organizationId,
      runId:target[0].runId,trackId:target[0].trackId})
    // An unrelated reporting route may previously have created an arbitrary
    // subgroup cohort. Trusted managers bypass ordinary fixed-population
    // disclosure checks, so the SCHOOL wrapper must independently reject that
    // historical artifact and require the exact frozen Run/Track population.
    if(!target[0].cohortSnapshotId)return hidden()
    const cohort=await readReportingCohort(target[0].cohortSnapshotId)
    const artifact=await readReportingArtifactRecord(input.artifactId)
    const leaf=artifact.analysisKind==='GROUP'&&artifact.artifactPayload.schemaVersion===2?artifact.artifactPayload.source.leaf:undefined
    if(cohort.organizationId!==input.organizationId
      ||cohort.sourceRunId!==target[0].runId ||cohort.sourceTrackId!==target[0].trackId
      ||(!leaf&&(cohort.selector.kind!=='RUN_TRACK_SUBJECTS'||cohort.eligibleN!==size))
      ||cohort.members.length!==cohort.eligibleN
      ||new Set(cohort.members.map(member=>member.userId)).size!==cohort.eligibleN)return hidden()
    if(leaf)await assertCampusLeafGroupDifferencing({organizationId:input.organizationId,cohort,leaf,minimumN:spec.definition.analysisKind==='GROUP'?Math.max(spec.definition.minimumCohortN,spec.definition.minimumContributorN,...spec.definition.metricRules.map(rule=>rule.minimumMetricN)):CAMPUS_GROUP_MIN_N})
    else await assertCampusNoGroupDifferencing({
      organizationId:input.organizationId,runId:target[0].runId,trackId:target[0].trackId,
    })
    const report=await readOrganizationReportingArtifact({
      principal,organizationId:input.organizationId,artifactId:input.artifactId,
    })
    if(!leaf)await assertCampusNoGroupDifferencing({
      organizationId:input.organizationId,runId:target[0].runId,trackId:target[0].trackId,
    })
    await requireCampusGroupManager(input.actor,input.organizationId)
    if(leaf&&artifact.analysisKind==='GROUP'){
      const view=await projectCampusLeafGroupWithPolicy({...report,organizationId:input.organizationId,runId:target[0].runId},leaf)
      const contract=await reportingLeafDisclosureContract(leaf,{organizationId:input.organizationId,runId:target[0].runId,trackId:target[0].trackId})
      await assertCampusMetricDifferencing({organizationId:input.organizationId,cohort,payload:artifact.artifactPayload,metricRules:spec.definition.metricRules,
        visibleMetricIds:view.projection.metrics.filter(metric=>metric.state==='present').map(metric=>metric.key),
        minimumN:Math.max(CAMPUS_GROUP_MIN_N,contract.minimumRespondents??0,spec.definition.minimumCohortN,spec.definition.minimumContributorN)})
      return view
    }
    return projectCampusGroupReport(report)
  })
}
