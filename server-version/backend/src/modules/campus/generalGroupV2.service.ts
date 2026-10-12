import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {AuthenticatedPrincipal} from '../../types'
import type {PrivacyOptions} from '../report-privacy/schema'
import {readFrozenPrivacyForRun} from '../report-privacy/snapshot.service'
import {requireCampusGroupManager} from './group-reports'
import {withCampusReportReleaseLock} from './report-release-lock'
import {schoolPrivacyV2Enabled,reviewedGeneralResources,
  generalRunApproved,parseFrozenSchoolOptions,reviewedMinimumFloor,
  type SchoolActivityPurpose} from './privacyV2'
import {projectCampusGeneralGroupV2} from './generalGroupV2.projection'
import {generateOrganizationGroupAnalysis} from '../reporting/service'
import {readOrganizationReportingArtifact} from '../reporting/pr4Service'
import {getPublishedReportingSpec} from '../reporting/spec'
import {readReportingArtifactRecord} from '../reporting/artifact'
import {exactGeneralContributors,unsafeComparableGeneralOverlap}
  from './generalGroupV2.differencing'
import {listOrganizationReportingSources,listPublishedReportingSpecs} from '../reporting/discovery'
import {reportingFail} from '../reporting/types'

type Scope={actor:AuthenticatedPrincipal;organizationId:string;
  runId:string;trackId:string;specId:string}
type DB=Prisma.TransactionClient
type Frozen={
  snapshotId:string;options:PrivacyOptions;resourceMinimumN:number;
  resourceFamily:string;resourceKey:string;resourceVersion:string;
  runClosedAt:Date;activityClosedAt:Date
}
type TrackRow={
  id:string;family:string;key:string;version:string;
  requestedPolicy:unknown;frozenPolicy:unknown;policyHash:string|null;
  activityPurpose:SchoolActivityPurpose;runClosedAt:Date;activityClosedAt:Date
}
type TotalRow={total:number;respondents:number;selfStudent:boolean}

const hidden=(code='CAMPUS_GENERAL_REPORT_UNAVAILABLE',status=409):never=>
  reportingFail(code,'当前校园一般教育群体报告不满足受控披露条件',status)

export const generalScopeKey=(input:Pick<Scope,'organizationId'|'runId'|'trackId'|'specId'>)=>
  canonicalHash({kind:'CAMPUS_GENERAL_GROUP_V2',...input})

/** Every read/release checks the immutable source, exact operator-reviewed
 * tool versions, frozen Run policy and actual Student->Student SELF provenance.
 * Changing a creator-controlled purpose cannot turn psychology into a
 * general report; none of the ordinary Parent/Teacher endpoints use this.
 */
async function frozenGeneralSource(db:DB,input:Scope):Promise<Frozen>{
  if(!schoolPrivacyV2Enabled())hidden('CAMPUS_GENERAL_REPORT_DISABLED',404)
  const frozen=await readFrozenPrivacyForRun(db,{
    organizationId:input.organizationId,runId:input.runId,
    product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',
  })
  if(frozen.mode!=='FROZEN_V1')return hidden('CAMPUS_GENERAL_RUN_NOT_APPROVED',404)
  let options:PrivacyOptions
  try{options=parseFrozenSchoolOptions(frozen.effective)}
  catch{return hidden('CAMPUS_GENERAL_POLICY_INVALID')}
  const tracks=await db.$queryRaw<TrackRow[]>(Prisma.sql`
    SELECT track.id,track.resource_family AS "family",
      track.resource_key AS "key",track.resource_version AS "version",
      track.requested_policy AS "requestedPolicy",
      track.frozen_resource_policy AS "frozenPolicy",
      track.resource_policy_hash AS "policyHash",
      activity.purpose AS "activityPurpose",
      run.closed_at AS "runClosedAt",activity.closed_at AS "activityClosedAt"
    FROM assessment_runs run
    JOIN campus_activity_runs bind
      ON bind.organization_id=run.organization_id AND bind.run_id=run.id
    JOIN campus_activities activity
      ON activity.organization_id=bind.organization_id
      AND activity.course_id=bind.course_id AND activity.status='CLOSED'
    JOIN education_product_entitlements grant_row
      ON grant_row.organization_id=run.organization_id
      AND grant_row.product='HUISCHOOL' AND grant_row.status='ACTIVE'
    JOIN assessment_run_tracks track
      ON track.organization_id=run.organization_id AND track.run_id=run.id
    WHERE run.organization_id=${input.organizationId}
      AND run.id=${input.runId} AND run.status='CLOSED'
    ORDER BY track.id
  `)
  if(!tracks.length||!tracks.every(x=>x.runClosedAt&&x.activityClosedAt))
    hidden('CAMPUS_GENERAL_SOURCE_NOT_CLOSED')
  let approved
  try{approved=reviewedGeneralResources()}
  catch{return hidden('CAMPUS_GENERAL_RESOURCE_AUTHORITY_INVALID',503)}
  const shapes=tracks.map(row=>{
    const x=row.requestedPolicy as Record<string,unknown>
    return {
      family:row.family,key:row.key,version:row.version,
      subjectRoles:Array.isArray(x?.subjectRoles)?x.subjectRoles as string[]:[],
      respondentRoles:Array.isArray(x?.respondentRoles)?x.respondentRoles as string[]:[],
      relationshipKinds:Array.isArray(x?.relationshipKinds)?x.relationshipKinds as string[]:[],
      perspectives:Array.isArray(x?.perspectives)?x.perspectives as string[]:[],
      analysisMode:typeof x?.analysisMode==='string'?x.analysisMode:'',
    }
  })
  if(!generalRunApproved({purpose:tracks[0].activityPurpose,
    tracks:shapes,approved})||tracks.some(row=>row.activityPurpose!==tracks[0].activityPurpose))
    hidden('CAMPUS_GENERAL_RESOURCE_NOT_REVIEWED')
  const track=tracks.find(x=>x.id===input.trackId)
  if(!track)return hidden('CAMPUS_GENERAL_TRACK_NOT_FOUND',404)
  const resource=track.frozenPolicy as Record<string,unknown>|null
  if(!resource||!track.policyHash||canonicalHash(resource)!==track.policyHash)
    return hidden('CAMPUS_GENERAL_TRACK_POLICY_INTEGRITY')
  let resourceFloor:number
  try{resourceFloor=Math.max(reviewedMinimumFloor(resource.minimumRespondents),
      reviewedMinimumFloor((track.requestedPolicy as Record<string,unknown>).minimumRespondents),5)}
  catch{return hidden('CAMPUS_GENERAL_RESOURCE_FLOOR_INVALID')}
  const totals=await db.$queryRaw<TotalRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total,
      COUNT(DISTINCT subject.user_id)::int AS respondents,
      COALESCE(BOOL_AND(subject.actor_role='STUDENT'
        AND respondent.actor_role='STUDENT'
        AND subject.user_id=respondent.user_id
        AND subject.membership_id IS NOT NULL
        AND subject.membership_id=respondent.membership_id
        AND assignment.relationship_kind='SELF'
        AND assignment.perspective='SELF_REPORT'),FALSE) AS "selfStudent"
    FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots subject
      ON subject.organization_id=e.organization_id
      AND subject.run_id=e.run_id AND subject.id=e.subject_actor_snapshot_id
    JOIN assessment_run_actor_snapshots respondent
      ON respondent.organization_id=e.organization_id
      AND respondent.run_id=e.run_id AND respondent.id=e.respondent_actor_snapshot_id
    JOIN relational_assessment_assignments assignment
      ON assignment.id=e.relational_assignment_id
    WHERE e.organization_id=${input.organizationId}
      AND e.run_id=${input.runId} AND e.track_id=${input.trackId}
  `)
  if(!totals[0]||totals[0].total<5
    ||totals[0].respondents!==totals[0].total||!totals[0].selfStudent)
    hidden('CAMPUS_GENERAL_FROZEN_POPULATION_INVALID')
  return {snapshotId:frozen.policySnapshotId,options,resourceMinimumN:resourceFloor,
    resourceFamily:track.family,resourceKey:track.key,resourceVersion:track.version,
    runClosedAt:tracks[0].runClosedAt,activityClosedAt:tracks[0].activityClosedAt}
}

async function publishedScience(specId:string){
  const spec=await getPublishedReportingSpec(specId)
  const def=spec.definition
  if(def.analysisKind!=='GROUP')return hidden('CAMPUS_GENERAL_SCIENCE_REVIEW_REQUIRED')
  if(def.minimumCohortN<5||def.minimumContributorN<5||!def.metricRules.length
    ||def.metricRules.some(r=>r.minimumMetricN<5))
    return hidden('CAMPUS_GENERAL_SCIENCE_REVIEW_REQUIRED')
  return def
}
async function readRelease(db:DB,input:Scope,snapshotId:string){
  const row=await db.educationReportReleaseRecord.findUnique({
    where:{organizationId_reportScopeKey:{
      organizationId:input.organizationId,reportScopeKey:generalScopeKey(input)}},
  })
  if(!row)return null
  if(row.reportKind!=='SCHOOL_GENERAL_EDUCATION_GROUP'
    ||row.policySnapshotId!==snapshotId||row.sourceRunId!==input.runId
    ||row.sourceSpecId!==input.specId
    ||row.audience!=='AUTHORIZED_HUISCHOOL_GENERAL_AGGREGATE'
    ||!row.reportProjection||canonicalHash(row.reportProjection)!==row.reportDigest)
    hidden('CAMPUS_GENERAL_RELEASE_INTEGRITY')
  return row.reportProjection
}
type ComparableHistory={id:string;manifest:unknown;resolvedN:number|null}

/** Only comparable exact resource versions are checked. Old School GROUP and
 * published longitudinal artifacts are included so V2 cannot subtract an
 * earlier legacy aggregate. No user IDs are retained in the release ledger.
 * The same School disclosure lock covers these reads and the release write.
 */
async function assertGeneralContributorOverlap(db:DB,input:{
  organizationId:string;artifactId:string;source:Frozen;contributors:readonly string[]
}):Promise<void>{
  const history=await db.$queryRaw<ComparableHistory[]>(Prisma.sql`
    SELECT history.id,history.manifest,history."resolvedN"
    FROM (
      SELECT a.id,a.artifact_payload->'inputManifest' AS manifest,
        CASE WHEN jsonb_typeof(a.artifact_payload->'inputManifest')='array'
          THEN jsonb_array_length(a.artifact_payload->'inputManifest')
          ELSE NULL END AS "resolvedN",
        a.generated_at AS "generatedAt"
      FROM reporting_analysis_artifacts a
      JOIN assessment_run_tracks track
        ON track.organization_id=a.organization_id
        AND track.run_id=(a.artifact_payload->'source'->>'runId')
        AND track.id=(a.artifact_payload->'source'->>'trackId')
      WHERE a.organization_id=${input.organizationId}
        AND a.analysis_kind='GROUP'
        AND a.id<>${input.artifactId}
        AND a.artifact_payload->'projection'->>'state'='present'
        AND track.resource_family=${input.source.resourceFamily}
        AND track.resource_key=${input.source.resourceKey}
        AND track.resource_version=${input.source.resourceVersion}
      UNION ALL
      SELECT wave.id AS id,wave.input_manifest->'resolved' AS manifest,
        CASE WHEN jsonb_typeof(wave.input_manifest->'resolved')='array'
          THEN jsonb_array_length(wave.input_manifest->'resolved')
          ELSE NULL END AS "resolvedN",
        artifact.generated_at AS "generatedAt"
      FROM reporting_analysis_artifacts artifact
      JOIN reporting_analysis_artifact_waves binding
        ON binding.organization_id=artifact.organization_id
        AND binding.artifact_id=artifact.id
      JOIN reporting_series_waves wave
        ON wave.organization_id=binding.organization_id
        AND wave.series_id=binding.series_id AND wave.id=binding.wave_id
      WHERE artifact.organization_id=${input.organizationId}
        AND artifact.analysis_kind IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
        AND wave.input_manifest->'resource'->>'family'=${input.source.resourceFamily}
        AND wave.input_manifest->'resource'->>'key'=${input.source.resourceKey}
        AND wave.input_manifest->'resource'->>'version'=${input.source.resourceVersion}
    ) history
    ORDER BY history."generatedAt" DESC,history.id DESC
    LIMIT 101
  `)
  if(history.length>100)hidden('CAMPUS_GENERAL_COMPARABLE_HISTORY_LIMIT')
  for(const previous of history){
    let ids:string[]
    try{ids=exactGeneralContributors(previous.manifest,previous.resolvedN)}
    catch{return hidden('CAMPUS_GENERAL_COMPARABLE_SOURCE_INVALID')}
    if(unsafeComparableGeneralOverlap(input.contributors,ids))
      hidden('CAMPUS_GENERAL_EFFECTIVE_DIFFERENCING_BLOCKED')
  }
}

export async function readCampusGeneralGroupV2(input:Scope){
  await requireCampusGroupManager(input.actor,input.organizationId)
  const projection=await prisma.$transaction(async tx=>{
    const source=await frozenGeneralSource(tx,input)
    await publishedScience(input.specId)
    const released=await readRelease(tx,input,source.snapshotId)
    if(!released)hidden('CAMPUS_GENERAL_REPORT_NOT_PUBLISHED',409)
    return released
  })
  await requireCampusGroupManager(input.actor,input.organizationId)
  return projection
}
export async function publishCampusGeneralGroupV2(input:Scope){
  await requireCampusGroupManager(input.actor,input.organizationId)
  return withCampusReportReleaseLock(input.organizationId,async()=>{
    const principal=await requireCampusGroupManager(input.actor,input.organizationId)
    const source=await prisma.$transaction(tx=>frozenGeneralSource(tx,input))
    const spec=await publishedScience(input.specId)
    const previous=await prisma.$transaction(tx=>readRelease(tx,input,source.snapshotId))
    if(previous)return previous
    const min=Math.max(5,source.resourceMinimumN,
      source.options.minRespondentsProfile==='N10'?10:5,
      spec.minimumCohortN,spec.minimumContributorN)
    if(source.options.releaseDelayHours===24
      &&(Date.now()-source.runClosedAt.getTime()<86_400_000
        ||Date.now()-source.activityClosedAt.getTime()<86_400_000))
      hidden('CAMPUS_GENERAL_RELEASE_DELAY')
    const analysis=await generateOrganizationGroupAnalysis({
      principal,organizationId:input.organizationId,
      runId:input.runId,trackId:input.trackId,specId:input.specId,
    })
    const approved=await readOrganizationReportingArtifact({
      principal,organizationId:input.organizationId,artifactId:analysis.artifactId,
    })
    const metricMinimums=Object.fromEntries(spec.metricRules.map(x=>[x.metricId,x.minimumMetricN]))
    const projected=projectCampusGeneralGroupV2({
      artifactId:analysis.artifactId,projection:approved.projection,
      options:source.options,minimumN:min,metricMinimums,
    })
    if(projected.state!=='READY')hidden('CAMPUS_GENERAL_GROUP_WITHHELD')
    // The trusted, immutable analysis manifest identifies only actual FINAL
    // contributors. No second scoring pass or full-Run roster approximation.
    const artifact=await readReportingArtifactRecord(analysis.artifactId)
    if(artifact.analysisKind!=='GROUP'
      ||artifact.organizationId!==input.organizationId
      ||artifact.specId!==input.specId)
      return hidden('CAMPUS_GENERAL_ARTIFACT_SOURCE_INVALID')
    // The stored artifact API exposes a union of GROUP, longitudinal and
    // protected payloads. Validate each structural field independently so
    // TypeScript and the release gate use the same source checks.
    const payload=artifact.artifactPayload
    if(!('inputManifest' in payload))
      return hidden('CAMPUS_GENERAL_ARTIFACT_SOURCE_INVALID')
    const sourceRef=payload.source
    if(!('runId' in sourceRef)||!('trackId' in sourceRef))
      return hidden('CAMPUS_GENERAL_ARTIFACT_SOURCE_INVALID')
    if(sourceRef.runId!==input.runId||sourceRef.trackId!==input.trackId)
      return hidden('CAMPUS_GENERAL_ARTIFACT_SOURCE_INVALID')
    const manifest:unknown=payload.inputManifest
    let contributors:string[]
    try{
      const published=approved.projection as {resultContributorN?:unknown}
      contributors=exactGeneralContributors(
        manifest,published.resultContributorN)
    }catch{return hidden('CAMPUS_GENERAL_ARTIFACT_CONTRIBUTORS_INVALID')}
    const contributorDigest=canonicalHash({
      kind:'SCHOOL_GENERAL_EFFECTIVE_FINAL_V2',organizationId:input.organizationId,
      resource:[source.resourceFamily,source.resourceKey,source.resourceVersion],
      contributors,
    })
    // The group lock covers canonical artifact generation, source revalidation,
    // final write and response. The repository never stores user IDs here.
    await prisma.$transaction(async tx=>{
      const again=await frozenGeneralSource(tx,input)
      if(again.snapshotId!==source.snapshotId)
        hidden('CAMPUS_GENERAL_POLICY_CHANGED')
      if(await readRelease(tx,input,source.snapshotId))return
      if(source.options.crossReleaseOverlapGuard)
        await assertGeneralContributorOverlap(tx,{
          organizationId:input.organizationId,artifactId:analysis.artifactId,
          source,contributors,
        })
      await requireCampusGroupManager(input.actor,input.organizationId)
      await tx.educationReportReleaseRecord.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        reportScopeKey:generalScopeKey(input),policySnapshotId:source.snapshotId,
        sourceRunId:input.runId,sourceSpecId:input.specId,
        reportKind:'SCHOOL_GENERAL_EDUCATION_GROUP',
        audience:'AUTHORIZED_HUISCHOOL_GENERAL_AGGREGATE',
        reportDigest:canonicalHash(projected),
        // Actual resolved FINAL contributors, never the invited population.
        // The ledger persists only their digest, not user IDs.
        effectivePopulationDigest:contributorDigest,
        reportProjection:projected as Prisma.InputJsonValue,
        releasedByUserId:input.actor.userId,
      }})
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
    await requireCampusGroupManager(input.actor,input.organizationId)
    return projected
  })
}

/** Controlled catalog: one read for metadata, one for frozen-snapshot state.
 * It does not reveal a student's participation, answer, score or respondent ID.
 * An operator-absent allowlist yields NO V2 sources rather than an unsafe
 * fallback to sensitive psychology records.
 */
export async function listCampusGeneralGroupV2Catalog(input:{
  actor:AuthenticatedPrincipal;organizationId:string
}){
  if(!schoolPrivacyV2Enabled())hidden('CAMPUS_GENERAL_REPORT_DISABLED',404)
  const principal=await requireCampusGroupManager(input.actor,input.organizationId)
  let approved
  try{approved=reviewedGeneralResources()}
  catch{return hidden('CAMPUS_GENERAL_RESOURCE_AUTHORITY_INVALID',503)}
  if(!approved.length)return {specs:[],sources:[],truncated:false,
    note:'尚未配置平台独立审核的非敏感一般教育测评资源；不会自动放宽任何心理测评。'}
  const [specs,sources]=await Promise.all([
    listPublishedReportingSpecs({
      principal,organizationId:input.organizationId,analysisKind:'GROUP',
      page:1,pageSize:50,
    }),
    listOrganizationReportingSources({
      principal,organizationId:input.organizationId,page:1,pageSize:100,
    }),
  ])
  const candidates=sources.list.filter(source=>approved.some(x=>
    x.family===source.resource.family&&x.key===source.resource.key
    &&x.version===source.resource.version))
  const snapshots=await prisma.educationReportPolicySnapshot.findMany({
    where:{organizationId:input.organizationId,product:'HUISCHOOL',
      scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',
      runId:{in:[...new Set(candidates.map(x=>x.runId))]}},
    select:{runId:true},
  })
  const allowedRuns=new Set(snapshots.map(x=>x.runId))
  return {
    sources:candidates.filter(x=>allowedRuns.has(x.runId)).map(source=>({
      runId:source.runId,trackId:source.trackId,name:source.runName,
      resource:source.resource,
    })),
    specs:specs.list.filter(x=>x.analysisKind==='GROUP'
      &&(x.privacy.minimumCohortN??0)>=5
      &&(x.privacy.minimumContributorN??0)>=5)
      .map(x=>({specId:x.specId,title:x.specKey,version:x.version,
        privacy:x.privacy,metricIds:x.metricIds})),
    truncated:!!sources.truncated||specs.total>50,
    note:'仅显示已审核资源及具有正式 V2 冻结快照的 School Run；正式报告还需审核科学指标与样本完整性。',
  }
}
