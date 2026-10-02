import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
import { reportingSpecHash, validateReportingSpecDefinition } from './spec'

// Same own-user/current-membership/deny/SELF/disclosure boundary as the
// canonical participant reader. This list never reads artifact_payload or
// builds report projections; opening an item still calls the full reader.
const scope=(userId:string)=>Prisma.sql`
 a.analysis_kind='INDIVIDUAL_LONGITUDINAL' AND a.subject_user_id=${userId}
 AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=a.organization_id AND o.status='ACTIVE')
 AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=a.organization_id AND m.user_id=${userId}
   AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=a.organization_id AND d.user_id=${userId}
   AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ','ORG_INDIVIDUAL_REPORT_V1'))`
type Candidate={id:string;generatedAt:Date;definition:unknown;specHash:string}
type Wave={artifactId:string;waveId:string;family:string;key:string;version:string;runStatus:string;policy:any;hash:string;observations:Array<{subjectUserId:string;executionId:string}>;executions:string[]}
export async function listParticipantLongitudinalMetadata(userId:string){
 const candidates=await prisma.$queryRaw<Candidate[]>(Prisma.sql`
  SELECT a.id,a.generated_at AS "generatedAt",s.definition,s.spec_hash AS "specHash"
  FROM reporting_analysis_artifacts a JOIN reporting_analysis_specs s ON s.id=a.spec_id AND s.status='PUBLISHED'
  WHERE ${scope(userId)} ORDER BY a.generated_at DESC,a.id DESC LIMIT 21`)
 const page=candidates.slice(0,20),ids=page.map(row=>row.id)
 if(!ids.length)return {list:[],truncated:false}
 const waves=await prisma.$queryRaw<Wave[]>(Prisma.sql`
  SELECT aw.artifact_id AS "artifactId",w.id AS "waveId",t.resource_family AS family,t.resource_key AS key,t.resource_version AS version,run.status AS "runStatus",
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS hash,
   (SELECT jsonb_agg(jsonb_build_object('subjectUserId',observation->>'subjectUserId','executionId',observation->>'executionId'))
    FROM jsonb_array_elements(COALESCE(w.input_manifest->'resolved','[]'::jsonb)||COALESCE(w.input_manifest->'unresolved','[]'::jsonb)) observation) AS observations,
   ARRAY(SELECT e.id FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
    JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
    WHERE e.organization_id=w.organization_id AND e.run_id=w.source_run_id AND e.track_id=w.source_track_id
     AND s.user_id=${userId} AND r.user_id=${userId} AND e.status NOT IN ('REVOKED','CANCELLED') LIMIT 2) AS executions
  FROM reporting_analysis_artifact_waves aw
  JOIN reporting_series_waves w ON w.organization_id=aw.organization_id AND w.series_id=aw.series_id AND w.id=aw.wave_id
  LEFT JOIN assessment_run_tracks t ON t.organization_id=w.organization_id AND t.run_id=w.source_run_id AND t.id=w.source_track_id
  LEFT JOIN assessment_runs run ON run.organization_id=t.organization_id AND run.id=t.run_id
  WHERE aw.artifact_id IN (${Prisma.join(ids)})`)
 const byArtifact=new Map<string,Wave[]>()
 for(const wave of waves){const rows=byArtifact.get(wave.artifactId)||[];rows.push(wave);byArtifact.set(wave.artifactId,rows)}
 const eligible=page.filter(row=>{
  const definition=validateReportingSpecDefinition(row.definition)
  if(definition.analysisKind!=='INDIVIDUAL_LONGITUDINAL'||reportingSpecHash(definition)!==row.specHash)return false
  const bound=byArtifact.get(row.id)||[]
  if(bound.length<2||new Set(bound.map(w=>w.waveId)).size!==bound.length)return false
  let metrics=definition.metricRules
  for(const wave of bound){
   if(!['PUBLISHED','CLOSED'].includes(wave.runStatus)||wave.observations?.length!==1||wave.observations[0].subjectUserId!==userId||wave.executions.length!==1||wave.executions[0]!==wave.observations[0].executionId||!wave.policy||canonicalHash(wave.policy)!==wave.hash||!wave.policy.resultDisclosure)return false
   const entry=relationalProductRegistry.findExact({resourceKind:wave.family as any,resourceKey:wave.key,resourceVersion:wave.version})
   if(!entry||entry.releaseStatus!=='PUBLISHED'||!entry.resultDisclosure||canonicalHash(entry.resultDisclosure)!==canonicalHash(wave.policy.resultDisclosure))return false
   const rule=validateResultDisclosureContract(wave.policy.resultDisclosure).audiences.RESPONDENT
   if(rule.mode!=='INDIVIDUAL_SUMMARY'||!rule.longitudinalMetricKeys.length)return false
   metrics=metrics.filter(m=>m.sourceFamily===wave.family&&m.sourceResourceKey===wave.key&&rule.longitudinalMetricKeys.includes(m.sourceMetricKey))
  }
  return metrics.length>0
 })
 // Recheck all current memberships and denies in one query after resolving
 // registry contracts, without per-report organization lookups.
 const current=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT a.id FROM reporting_analysis_artifacts a WHERE a.id IN (${Prisma.join(ids)}) AND ${scope(userId)}`)
 const allowed=new Set(current.map(row=>row.id))
 return {list:eligible.filter(row=>allowed.has(row.id)).map(row=>({id:row.id,generatedAt:row.generatedAt.toISOString()})),truncated:candidates.length>20}
}
