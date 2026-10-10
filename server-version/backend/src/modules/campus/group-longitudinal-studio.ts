import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { listOrganizationReportingSources,listPublishedReportingSpecs } from '../reporting/discovery'
import { getPublishedReportingSpec } from '../reporting/spec'
import { generateAutomaticLongitudinal } from '../reporting/longitudinal-planner'
import { readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail,type ReportingAnalysisSpecDefinitionV1 } from '../reporting/types'
import { requireCampusGroupManager,assertCampusNoGroupDifferencing,CAMPUS_GROUP_MIN_N } from './group-reports'
import { withCampusReportReleaseLock } from './report-release-lock'

type Source={runId:string;trackId:string;runName:string;publishedAt:string|null;
  resource:{family:string;key:string;version:string}}
type Pair={runId:string;trackId:string}
type CohortActor={runId:string;trackId:string;userId:string;approved:boolean;
  runReady:boolean;activityReady:boolean;selfStudent:boolean}
type Specs=Extract<ReportingAnalysisSpecDefinitionV1,
  {analysisKind:'REPEATED_COHORT'|'MATCHED_LONGITUDINAL'}>
const deny=():never=>reportingFail('CAMPUS_LONGITUDINAL_GROUP_WITHHELD',
  'school longitudinal cohort is unavailable or not comparable',409)
const identity=(v:Pair)=>v.runId+':'+v.trackId
export const CAMPUS_GROUP_MAX_WAVES=4

/** Same frozen students on every full source Track, not merely the same N.
 * This is an internal-only eligibility check; no browser receives identifiers.
 */
export async function assertCampusFixedLongitudinalPopulation(input:{
  organizationId:string;sources:Pair[]
}){
  const {sources,organizationId}=input
  if(sources.length<2||sources.length>CAMPUS_GROUP_MAX_WAVES
    ||new Set(sources.map(x=>x.runId)).size!==sources.length)return deny()
  const rows=await prisma.$queryRaw<CohortActor[]>(Prisma.sql`
    SELECT execution.run_id AS "runId",execution.track_id AS "trackId",
      subject.user_id AS "userId",
      (users.account_domain='SCHOOL' AND users.role='STUDENT'
        AND users.is_active=TRUE AND users.is_frozen=FALSE) AS approved,
      (run.status='CLOSED' AND run.closed_at<=statement_timestamp()-interval '24 hours') AS "runReady",
      (activity.status='CLOSED' AND activity.closed_at<=statement_timestamp()-interval '24 hours') AS "activityReady",
      (subject.actor_role='STUDENT' AND respondent.actor_role='STUDENT'
        AND subject.user_id=respondent.user_id
        AND subject.membership_id IS NOT NULL
        AND subject.membership_id=respondent.membership_id
        AND relation.relationship_kind='SELF'
        AND assignment.perspective='SELF_REPORT') AS "selfStudent"
    FROM assessment_run_executions execution
    JOIN assessment_runs run ON run.id=execution.run_id AND run.organization_id=execution.organization_id
    JOIN organizations org ON org.id=run.organization_id
      AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
    JOIN campus_activity_runs ar ON ar.run_id=run.id AND ar.organization_id=run.organization_id
    JOIN campus_activities activity ON activity.organization_id=ar.organization_id
      AND activity.course_id=ar.course_id
    JOIN assessment_run_tracks track ON track.id=execution.track_id
      AND track.run_id=run.id AND track.organization_id=run.organization_id
    JOIN assessment_run_actor_snapshots subject ON subject.id=execution.subject_actor_snapshot_id
      AND subject.organization_id=execution.organization_id AND subject.run_id=execution.run_id
    JOIN assessment_run_actor_snapshots respondent ON respondent.id=execution.respondent_actor_snapshot_id
      AND respondent.organization_id=execution.organization_id AND respondent.run_id=execution.run_id
    JOIN assessment_run_relationship_snapshots relation ON relation.id=execution.relationship_snapshot_id
      AND relation.organization_id=execution.organization_id AND relation.run_id=execution.run_id
    JOIN relational_assessment_assignments assignment ON assignment.id=execution.relational_assignment_id
      AND assignment.policy_domain='ORGANIZATION_RUN'
    JOIN users users ON users.id=subject.user_id
    WHERE execution.organization_id=${organizationId}
      AND (${Prisma.join(sources.map(s=>Prisma.sql`(execution.run_id=${s.runId} AND execution.track_id=${s.trackId})`),' OR ')})
    ORDER BY execution.run_id,execution.track_id,execution.id LIMIT 20001
  `)
  if(rows.length>=20001)return deny()
  const groups=new Map<string,Set<string>>()
  for(const row of rows){
    if(!row.approved||!row.runReady||!row.activityReady||!row.selfStudent)return deny()
    const id=identity(row)
    const users=groups.get(id)??new Set<string>()
    if(users.has(row.userId))return deny()
    users.add(row.userId);groups.set(id,users)
  }
  if(groups.size!==sources.length)return deny()
  const base=groups.get(identity(sources[0]))
  if(!base||base.size<CAMPUS_GROUP_MIN_N)return deny()
  for(const src of sources.slice(1)){
    const population=groups.get(identity(src))
    if(!population||population.size!==base.size
      ||[...population].some(userId=>!base.has(userId)))return deny()
  }
  return base.size
}

export function assertCampusGroupComparability(input:{spec:Specs;sources:Source[]}){
  const {spec,sources}=input
  if(sources.length<2||sources.length>CAMPUS_GROUP_MAX_WAVES
    ||(spec.minimumCohortN??0)<CAMPUS_GROUP_MIN_N
    ||(spec.minimumContributorN??0)<CAMPUS_GROUP_MIN_N
    ||!spec.metricRules.length||!spec.comparabilityRules.length
    ||spec.metricRules.some(x=>x.minimumMetricN<CAMPUS_GROUP_MIN_N)
    ||sources.some(s=>s.resource.family!==sources[0].resource.family
      ||s.resource.key!==sources[0].resource.key
      ||s.resource.family==='COGNITIVE'))return deny()
  for(const metric of spec.metricRules){
    if(metric.sourceFamily!==sources[0].resource.family
      ||metric.sourceResourceKey!==sources[0].resource.key)return deny()
    for(let i=1;i<sources.length;i++){
      const x=sources[i-1].resource,y=sources[i].resource
      const evidence=spec.comparabilityRules.find(r=>r.metricId===metric.metricId
        &&r.resourceFamily===x.family&&r.resourceKey===x.key
        &&r.fromVersion===x.version&&r.toVersion===y.version)
      if(!evidence||!evidence.evidenceRef||!/^[a-f0-9]{64}$/.test(evidence.evidenceHash)
        ||!['EXACT','COMPATIBLE','LINKED','LIMITED'].includes(evidence.level))return deny()
    }
  }
}

export async function listCampusGroupLongitudinalCatalog(actor:AuthenticatedPrincipal,organizationId:string){
  const principal=await requireCampusGroupManager(actor,organizationId)
  const [sources,repeated,matched]=await Promise.all([
    listOrganizationReportingSources({principal,organizationId,page:1,pageSize:100}),
    listPublishedReportingSpecs({principal,organizationId,analysisKind:'REPEATED_COHORT',page:1,pageSize:40}),
    listPublishedReportingSpecs({principal,organizationId,analysisKind:'MATCHED_LONGITUDINAL',page:1,pageSize:40}),
  ])
  return {sources:sources.list.filter(s=>s.resource.family!=='COGNITIVE'),
    specs:[...repeated.list,...matched.list].filter(s=>
      (s.privacy.minimumCohortN??0)>=CAMPUS_GROUP_MIN_N
      &&(s.privacy.minimumContributorN??0)>=CAMPUS_GROUP_MIN_N).map(s=>({
        specId:s.specId,title:s.specKey,version:s.version,analysisKind:s.analysisKind,
      })),
    truncated:sources.truncated||repeated.total>40||matched.total>40}
}

/** Suppress partial waves and distribution/variance; no count or causal delta
 * is returned. The existing engine still applies source disclosure contracts.
 */
export function projectCampusFixedGroupLongitudinal(input:{artifactId:string;projection:unknown},
  cohortSize:number){
  const p=input.projection as any
  const metrics:Record<string,Array<{wave:number;mean:number}>>={}
  if(p?.state!=='present'||cohortSize<CAMPUS_GROUP_MIN_N)
    return {artifactId:input.artifactId,state:'WITHHELD' as const,kind:'SCHOOL_LONGITUDINAL' as const,
      metrics:{},limitations:['此结果未达到当前技术与科学披露要求，禁止据此识别个体。']}
  if(p.kind==='REPEATED_COHORT'&&Array.isArray(p.waves)){
    for(const [index,wave] of p.waves.entries()){
      if(wave.state!=='present'||wave.eligibleN!==cohortSize
        ||wave.resultContributorN!==cohortSize)return {artifactId:input.artifactId,
          state:'WITHHELD' as const,kind:'SCHOOL_LONGITUDINAL' as const,metrics:{},
          limitations:['有波次不满足完整贡献者要求，全部结果已被抑制。']}
      for(const [key,item] of Object.entries(wave.metrics??{}) as Array<[string,any]>){
        if(item?.state!=='present'||item.validN!==cohortSize||item.missingN!==0)continue
        const value=item.aggregations?.mean
        if(typeof value!=='number'||!Number.isFinite(value))continue
        ;(metrics[key]??=[]).push({wave:index+1,mean:Math.round(value*10)/10})
      }
    }
    // One missing metric in any wave must not create a comparable trend.
    for(const [key,points] of Object.entries(metrics))if(points.length!==p.waves.length)delete metrics[key]
  }else if(p.kind==='MATCHED_LONGITUDINAL'&&p.mode==='FULL_CASE'){
    if(p.matchedEligibleN!==cohortSize)return {artifactId:input.artifactId,
      state:'WITHHELD' as const,kind:'SCHOOL_LONGITUDINAL' as const,metrics:{},
      limitations:['参与者集合不完整，全部结果已抑制。']}
    for(const [key,item] of Object.entries(p.metrics??{}) as Array<[string,any]>){
      if(item?.state!=='present'||item.validCaseN!==cohortSize
        ||!Array.isArray(item.waveMeans))continue
      const values=item.waveMeans.map((v:any,i:number)=>({wave:i+1,mean:Math.round(v.mean*10)/10}))
      if(values.length>=2&&values.every((v:{mean:number})=>Number.isFinite(v.mean)))metrics[key]=values
    }
  }else return {artifactId:input.artifactId,state:'WITHHELD' as const,
    kind:'SCHOOL_LONGITUDINAL' as const,metrics:{},
    limitations:['该报告类型不在校园内部纵向披露范围。']}
  if(!Object.keys(metrics).length)return {artifactId:input.artifactId,state:'WITHHELD' as const,
    kind:'SCHOOL_LONGITUDINAL' as const,metrics:{},
    limitations:['没有符合当前完整波次要求的科学指标。']}
  return {artifactId:input.artifactId,state:'READY' as const,kind:'SCHOOL_LONGITUDINAL' as const,
    metrics,limitations:[
      '相同学生群体在不同时间的均值只构成描述性比较，不能单独证明因果效应或个人变化。',
      '不能向被评教师、学生个人或家长自动公开；未获许可的常模和诊断阈值均未启用。',
      '每个波次只展示有限精度均值，不展示人数、方差、作答者、原始分数或个人变化量。',
    ]}
}

export async function generateCampusFixedGroupLongitudinal(input:{
  actor:AuthenticatedPrincipal;organizationId:string
  specId:string;analysisKind:'REPEATED_COHORT'|'MATCHED_LONGITUDINAL'
  sources:Pair[]
}){
  return withCampusReportReleaseLock(input.organizationId, async () => {
    const principal=await requireCampusGroupManager(input.actor,input.organizationId)
    const catalog=await listOrganizationReportingSources({
      principal,organizationId:input.organizationId,page:1,pageSize:100,
    })
    const selected=input.sources.map(id=>catalog.list.find(row=>identity(row)===identity(id)))
    if(selected.some(s=>!s))return deny()
    const sorted=(selected as Source[]).sort((a,b)=>Date.parse(a.publishedAt??'')-Date.parse(b.publishedAt??'')
      ||identity(a).localeCompare(identity(b)))
    if(sorted.some(s=>!s.publishedAt||!Number.isFinite(Date.parse(s.publishedAt))))return deny()
    const spec=await getPublishedReportingSpec(input.specId)
    if(spec.definition.analysisKind!=='REPEATED_COHORT'
      &&spec.definition.analysisKind!=='MATCHED_LONGITUDINAL')return deny()
    if(spec.definition.analysisKind!==input.analysisKind)return deny()
    assertCampusGroupComparability({spec:spec.definition,sources:sorted})
    const exact=sorted.map(s=>({runId:s.runId,trackId:s.trackId}))
    const cohortSize=await assertCampusFixedLongitudinalPopulation({
      organizationId:input.organizationId,sources:exact,
    })
    for(const source of exact)await assertCampusNoGroupDifferencing({
      organizationId:input.organizationId,...source,
    })
    const result=await generateAutomaticLongitudinal({
      principal,organizationId:input.organizationId,specId:input.specId,
      sources:exact,cohortStrategy:'BASELINE_FIXED',
      analysisKind:input.analysisKind,
      ...(input.analysisKind==='MATCHED_LONGITUDINAL'?{mode:'FULL_CASE' as const}:{}),
    })
    const authorized=await readOrganizationReportingArtifact({
      principal,organizationId:input.organizationId,artifactId:result.artifactId,
    })
    await assertCampusFixedLongitudinalPopulation({organizationId:input.organizationId,sources:exact})
    // The second wave-by-wave check must occur AFTER the canonical artifact is
    // persisted, still under the same school-level cross-kind release lock.
    // Otherwise simultaneous GROUP and LONGITUDINAL callers can each observe
    // an empty/compatible history and leak overlapping nonidentical means.
    for(const source of exact)await assertCampusNoGroupDifferencing({
      organizationId:input.organizationId,...source,
    })
    await requireCampusGroupManager(input.actor,input.organizationId)
    return projectCampusFixedGroupLongitudinal(authorized,cohortSize)
  })
}
