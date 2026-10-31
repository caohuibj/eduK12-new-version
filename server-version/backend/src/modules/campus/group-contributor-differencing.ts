import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {policyFingerprint} from '../report-privacy/schema'
import {ReportPrivacyError} from '../report-privacy/preferences.service'
import {ENHANCED} from '../report-privacy/registry'
import {reportingFail,type ReportingGroupArtifactPayload,type ReportingCohortSnapshotRecord} from '../reporting/types'
import {parseFrozenSchoolOptions} from './privacyV2'
import {projectCampusGeneralGroupV2} from './generalGroupV2.projection'

type MetricRule={metricId:string;sourceMetricKey:string;minimumMetricN?:number}
type Prior={payload:ReportingGroupArtifactPayload;metricRules:MetricRule[];resourceMinimumN:number;
 members:Array<{executionId:string;userId:string}>;
 privacy:{id:string;product:string;scenario:string;policyVersion:number;effective:unknown;effectiveHash:string}|null;
 releases:Array<{projection:{artifactId?:string;state?:string;metrics?:Record<string,{mean?:number}>};digest:string;scopeKey:string;policySnapshotId:string}>;
 sourceRunId:string;sourceTrackId:string;cursorAt:string;cursorId:string;
 legacyKind?:string;waveId:string;waveProjection?:any}
type Contributors={possible:string[];n:number}
const invalid=():never=>reportingFail('REPORT_ARTIFACT_INTEGRITY','school metric contributor references are inconsistent',500)

/** An absent old subset is not an exact roster. Retain its candidate universe
 * and count; no answers are re-read and no immutable artifact is rewritten. */
function contributorReader(payload:ReportingGroupArtifactPayload,members:Prior['members']){
 const p=payload.projection
 const manifest=payload.inputManifest,memberIds=new Map(members.map(member=>[member.executionId,member.userId]))
 if(!Array.isArray(manifest)||new Set(manifest.map(r=>r.executionId)).size!==manifest.length
  ||manifest.length!==p.resultContributorN
  ||new Set(manifest.map(r=>r.subjectUserId)).size!==manifest.length
  ||manifest.some(r=>!r.executionId||!r.subjectUserId||memberIds.get(r.executionId)!==r.subjectUserId))return invalid()
 const possible=manifest.map(r=>r.subjectUserId),byId=new Map(manifest.map(r=>[r.executionId,r.subjectUserId]))
 return (metricId:string):Contributors=>{
 const metric=p.state==='present'?p.metrics?.[metricId]:undefined
 if(metric?.state!=='present'||!Number.isInteger(metric.validN)||metric.validN!<0||metric.validN!>manifest.length)return invalid()
 const subset=payload.schemaVersion===2?payload.metricContributorExecutionIds?.[metricId]:undefined
 if(subset===undefined)return {possible,n:metric.validN!}
 if(!Array.isArray(subset)||subset.length!==metric.validN||new Set(subset).size!==subset.length
  ||subset.some(id=>!byId.has(id)))return invalid()
 return {possible:subset.map(id=>byId.get(id)!),n:subset.length}
 }
}

/** For exact sets this reduces to the existing School small-difference rule.
 * For legacy unknown subsets, reject only if a small difference is possible;
 * disjoint or provably sufficiently separated old evidence stays readable. */
function unsafe(current:Contributors,prior:Contributors,floor:number){
 const old=new Set(prior.possible),shared=current.possible.filter(id=>old.has(id)).length
 const union=current.possible.length+prior.possible.length-shared
 const lower=Math.max(0,current.n+prior.n-union),upper=Math.min(current.n,prior.n,shared)
 return [current.n,prior.n].some(n=>Math.max(lower,1,n-floor+1)<=Math.min(upper,n-1))
}
function priorMetrics(old:Prior){
 let options=ENHANCED
 if(old.privacy){
  const row=old.privacy
  if(row.product!=='HUISCHOOL'||!['SCHOOL_GENERAL_EDUCATION_GROUP','SCHOOL_SENSITIVE_WELLBEING_GROUP'].includes(row.scenario)
   ||row.policyVersion!==1||row.effectiveHash!==policyFingerprint(row.effective))throw new ReportPrivacyError('PRIVACY_SNAPSHOT_INTEGRITY',409)
  options=parseFrozenSchoolOptions(row.effective,row.scenario as 'SCHOOL_GENERAL_EDUCATION_GROUP'|'SCHOOL_SENSITIVE_WELLBEING_GROUP')
 }
 const p=old.payload.projection
 if(old.payload.schemaVersion===1){
  // The original GROUP endpoint is strict even on a STANDARD Run. A separate
  // general-V2 publication is evidence of its actual, independently governed
  // numeric view; its five-person floor must not be upgraded retroactively.
  const visible=new Set<string>()
  if(p.state==='present'&&p.resultContributorN===p.eligibleN&&(p.eligibleN??0)>=10)
   for(const [id,metric]of Object.entries(p.metrics??{}))if(metric.state==='present'&&metric.validN===p.eligibleN
    &&metric.missingN===0&&Number.isFinite(metric.aggregations?.mean))visible.add(id)
  for(const release of old.releases??[]){
   if(!old.privacy||old.privacy.scenario!=='SCHOOL_GENERAL_EDUCATION_GROUP'||release.policySnapshotId!==old.privacy.id||release.scopeKey!==canonicalHash({kind:'CAMPUS_GENERAL_GROUP_V2',
    organizationId:old.payload.organizationId,runId:old.sourceRunId,trackId:old.sourceTrackId,specId:old.payload.specId})
    ||release.projection.artifactId!==old.payload.artifactId||canonicalHash(release.projection)!==release.digest)
    reportingFail('CAMPUS_GENERAL_RELEASE_INTEGRITY','school general publication integrity is invalid',409)
   if(release.projection.state==='READY')for(const[id,metric]of Object.entries(release.projection.metrics??{}))
    if(Number.isFinite(metric.mean))visible.add(id)
  }
  return visible
 }
 const minimums=Object.fromEntries(old.metricRules.map(rule=>[rule.metricId,Math.max(10,old.resourceMinimumN,rule.minimumMetricN??0,
  old.payload.schemaVersion===2?old.payload.metricMetadata[rule.metricId]?.minimumN??0:0)]))
 const projection=projectCampusGeneralGroupV2({artifactId:old.payload.artifactId,projection:p,options,minimumN:10,metricMinimums:minimums})
 return new Set(Object.keys(projection.metrics).filter(id=>{
  const metric=p.state==='present'?p.metrics?.[id]:undefined
  return metric?.state==='present'&&(metric.missingN===0||metric.missingN!>=minimums[id])
 }))
}

/** School-only supplement to the unchanged roster/source guard. The caller
 * holds the existing school release lock and supplies the actually governed,
 * frozen-policy-visible metric IDs, never raw unapproved engine metrics. */
export async function assertCampusMetricDifferencing(input:{organizationId:string;cohort:ReportingCohortSnapshotRecord;
 payload:ReportingGroupArtifactPayload;metricRules:MetricRule[];visibleMetricIds:string[];minimumN:number}){
 if(!input.visibleMetricIds.length)return
 if(input.payload.schemaVersion!==2)return invalid()
 const leaf=input.payload.source.leaf
 const readCurrent=contributorReader(input.payload,input.cohort.members)
 const currentContributors=new Map(input.visibleMetricIds.map(id=>[id,readCurrent(id)]))
 // Request-local keyset batches bound materialization without dropping old
 // disclosures or imposing a new historical-report cutoff. Keep PostgreSQL's
 // full microsecond timestamp precision in the continuation key.
 let after:{at:string;id:string;waveId:string}|undefined
 while(true){
 const prior=await prisma.$queryRaw<Prior[]>(Prisma.sql`
  WITH historical AS (
   SELECT a.id,a.generated_at,a.analysis_kind,a.artifact_payload AS payload,a.spec_id,
     a.cohort_snapshot_id AS cohort_id,NULL::jsonb AS wave_projection,NULL::text AS wave_id
   FROM reporting_analysis_artifacts a
   WHERE a.organization_id=${input.organizationId} AND a.analysis_kind='GROUP'
    AND a.id<>${input.payload.artifactId}
    AND a.analysis_identity_hash IS DISTINCT FROM ${input.payload.analysisIdentityHash}
    AND (a.artifact_payload->'source'->'leaf' IS NULL
     OR (a.artifact_payload->'source'->'leaf'->>'unitType'=${leaf.unitType}
      AND a.artifact_payload->'source'->'leaf'->>'instrumentKey'=${leaf.instrumentKey}))
   UNION ALL
   SELECT a.id,a.generated_at,a.analysis_kind,a.artifact_payload,a.spec_id,w.cohort_snapshot_id,
    CASE WHEN a.analysis_kind='REPEATED_COHORT' THEN
     (SELECT value FROM jsonb_array_elements(a.artifact_payload->'projection'->'waves')
       WHERE value->>'waveId'=w.id LIMIT 1)
    ELSE a.artifact_payload->'projection' END,w.id
   FROM reporting_analysis_artifacts a
   JOIN reporting_analysis_artifact_waves aw ON aw.artifact_id=a.id AND aw.organization_id=a.organization_id
   JOIN reporting_series_waves w ON w.id=aw.wave_id AND w.organization_id=aw.organization_id AND w.series_id=aw.series_id
   WHERE a.organization_id=${input.organizationId} AND a.analysis_kind IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
  )
  SELECT historical.payload AS payload,historical.analysis_kind AS "legacyKind",historical.wave_projection AS "waveProjection",COALESCE(historical.wave_id,'') AS "waveId",
   to_char(historical.generated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt",historical.id AS "cursorId",
   cohort.source_run_id AS "sourceRunId",cohort.source_track_id AS "sourceTrackId",
   spec.definition->'metricRules' AS "metricRules",cohort.members,
   GREATEST(5,COALESCE((track.frozen_resource_policy->>'minimumRespondents')::int,0),
    COALESCE((track.requested_policy->>'minimumRespondents')::int,0))::int AS "resourceMinimumN",
   COALESCE((SELECT jsonb_agg(jsonb_build_object('projection',r.report_projection,'digest',r.report_digest,
    'scopeKey',r.report_scope_key,'policySnapshotId',r.policy_snapshot_id)) FROM education_report_release_records r
    WHERE historical.analysis_kind='GROUP' AND r.organization_id=cohort.organization_id
     AND r.source_run_id=cohort.source_run_id AND r.source_spec_id=historical.spec_id
     AND r.report_kind='SCHOOL_GENERAL_EDUCATION_GROUP' AND r.audience='AUTHORIZED_HUISCHOOL_GENERAL_AGGREGATE'
     AND r.report_projection->>'artifactId'=historical.id),'[]'::jsonb) AS releases,
   CASE WHEN privacy.id IS NULL THEN NULL ELSE jsonb_build_object('id',privacy.id,'product',privacy.product,'scenario',privacy.scenario,
    'policyVersion',privacy.policy_version,'effective',privacy.effective_json,'effectiveHash',privacy.effective_hash) END AS privacy
  FROM historical JOIN reporting_cohort_snapshots cohort ON cohort.id=historical.cohort_id AND cohort.organization_id=${input.organizationId}
  JOIN reporting_analysis_specs spec ON spec.id=historical.spec_id
  LEFT JOIN assessment_run_tracks track ON track.organization_id=cohort.organization_id
   AND track.run_id=cohort.source_run_id AND track.id=cohort.source_track_id
  LEFT JOIN education_report_policy_snapshots privacy ON privacy.organization_id=cohort.organization_id AND privacy.run_id=cohort.source_run_id
  WHERE ${after?.at??null}::timestamptz IS NULL OR (historical.generated_at,historical.id,COALESCE(historical.wave_id,''))>
   (${after?.at??null}::timestamptz,${after?.id??null},${after?.waveId??null})
  ORDER BY historical.generated_at,historical.id,COALESCE(historical.wave_id,'')
  LIMIT 20
 `)
 for(const old of prior){
  if(old.payload.artifactId===input.payload.artifactId||old.payload.analysisIdentityHash===input.payload.analysisIdentityHash)continue
  // Legacy School longitudinal responses only disclosed whole, complete waves.
  // Reconstruct those contributor references from frozen cohorts, not today's
  // membership or answers. Partial legacy waves have no School numeric view.
  if(old.legacyKind&&old.legacyKind!=='GROUP'){
   const wave=old.waveProjection,n=old.members.length,projection=old.payload.projection as any
   const metrics:Record<string,any>={}
   if(wave?.state==='present')for(const rule of old.metricRules){
    const metric=wave.metrics?.[rule.metricId]
    if(old.legacyKind==='REPEATED_COHORT'&&Array.isArray(projection.waves)&&projection.waves.length>=2
     &&projection.waves.every((w:any)=>w.state==='present'&&w.eligibleN===n&&w.resultContributorN===n
      &&w.metrics?.[rule.metricId]?.state==='present'&&w.metrics[rule.metricId].validN===n
      &&w.metrics[rule.metricId].missingN===0&&Number.isFinite(w.metrics[rule.metricId].aggregations?.mean)))metrics[rule.metricId]=metric
    if(old.legacyKind==='MATCHED_LONGITUDINAL'&&wave.mode==='FULL_CASE'&&wave.matchedEligibleN===n
     &&metric?.state==='present'&&metric.validCaseN===n&&Array.isArray(metric.waveMeans)&&metric.waveMeans.length>=2
     &&metric.waveMeans.every((point:any)=>Number.isFinite(point.mean))){
     const mean=metric.waveMeans.find((point:any)=>point.waveId===old.waveId)?.mean
     metrics[rule.metricId]={state:'present',validN:n,missingN:0,aggregations:{mean}}
    }
   }
   old.payload={...old.payload,schemaVersion:1,inputManifest:old.members.map(member=>({executionId:member.executionId,
    subjectUserId:member.userId,membershipId:'',canonicalResultHash:'',scientificMaturity:null,provenanceState:'LEGACY_UNFROZEN',scientificProvenanceHash:null})),
    projection:{schemaVersion:1,kind:'GROUP',state:'present',eligibleN:n,resultContributorN:n,metrics,evidence:{level:'PILOT',limitations:[]}}}
   old.privacy=null
   old.releases=[]
  }
  const visible=priorMetrics(old)
  let readPrevious:ReturnType<typeof contributorReader>|undefined
  for(const id of input.visibleMetricIds){
   const rule=input.metricRules.find(rule=>rule.metricId===id)
   if(!rule)return invalid()
   for(const priorRule of old.metricRules.filter(candidate=>candidate.sourceMetricKey===rule.sourceMetricKey&&visible.has(candidate.metricId))){
    const current=currentContributors.get(id)!,previous=(readPrevious??=contributorReader(old.payload,old.members))(priorRule.metricId)
    const floor=Math.max(input.minimumN,old.resourceMinimumN,rule.minimumMetricN??0,priorRule.minimumMetricN??0,input.payload.metricMetadata[id]?.minimumN??0,
     old.payload.schemaVersion===2?old.payload.metricMetadata[priorRule.metricId]?.minimumN??0:0)
    if(unsafe(current,previous,floor))reportingFail('CAMPUS_GROUP_DIFFERENCING_WITHHELD',
     'overlapping populations have a smaller-than-permitted disclosure difference',409)
   }
  }
 }
 if(prior.length<20)return
 const last=prior[prior.length-1]
 if(!last.cursorAt||!last.cursorId||after?.at===last.cursorAt&&after.id===last.cursorId&&after.waveId===last.waveId)return invalid()
 after={at:last.cursorAt,id:last.cursorId,waveId:last.waveId}
 }
}
