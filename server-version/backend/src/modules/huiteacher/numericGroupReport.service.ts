import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {resolveHistoricalRelationalEntry} from '../assessment-run/registeredResources'
import {readReportingArtifactRecord} from '../reporting/artifact'
import {listAuthoritativeRunLeafSources} from '../reporting/resultSource'
import {generateOrganizationGroupAnalysis,readOrganizationGroupArtifact} from '../reporting/service'
import {getPublishedReportingSpec} from '../reporting/spec'
import {educationGroupSelector,educationGroupPresentation,listEducationGroupSelections,type EducationGroupSelection} from '../reporting/education-group-selection'
import {reportingFail,type ReportingCohortSnapshotRecord,type ReportingLeafSourceV2} from '../reporting/types'
import {assertTeacherGroupAuthority} from './groupReportAuthority'
import {teacherResourceMinimum} from './privacyV2'
import {unsafeTeacherDisclosureOverlapCounts} from './disclosureOverlap.service'
import {lockTeacherDisclosure} from './privacyReleaseV2.service'

export type TeacherNumericScope={organizationId:string;eventId:string;actorUserId:string}
const hidden=():never=>reportingFail('REPORT_NOT_FOUND','Teacher group report unavailable',404)
async function source(input:TeacherNumericScope,trackId?:string){
 const [run]=await prisma.$queryRaw<Array<{runId:string;name:string;eventClosed:boolean;runClosed:boolean}>>`
  SELECT r.id AS "runId",e.title AS name,e.status='CLOSED' AS "eventClosed",r.status='CLOSED' AS "runClosed"
  FROM huiteacher_evaluation_run_links l JOIN huiteacher_evaluation_events e ON e.id=l.event_id AND e.organization_id=l.organization_id
  JOIN assessment_runs r ON r.id=l.run_id AND r.organization_id=l.organization_id
  WHERE l.organization_id=${input.organizationId} AND l.event_id=${input.eventId}`
 if(!run)hidden()
 await assertTeacherGroupAuthority({...input,runIds:[run.runId]})
 const principal={userId:input.actorUserId,platformRole:'STANDARD' as const,product:'HUITEACHER' as const}
 if(!trackId)return {...run,principal,minimumN:teacherResourceMinimum()}
 const [track]=await prisma.$queryRaw<Array<{family:string;key:string;version:string;policy:any;hash:string}>>`
  SELECT resource_family AS family,resource_key AS key,resource_version AS version,frozen_resource_policy AS policy,resource_policy_hash AS hash
  FROM assessment_run_tracks WHERE organization_id=${input.organizationId} AND run_id=${run.runId} AND id=${trackId}`
 if(!track||canonicalHash(track.policy)!==track.hash)hidden()
 const entry=await resolveHistoricalRelationalEntry({resourceKind:track.family,resourceKey:track.key,resourceVersion:track.version} as any)
 if(!entry||!isSelfGroupV2Entry(entry)||entry.resultDisclosure?.audiences.ORGANIZATION.mode!=='AGGREGATE_ONLY'
  ||!track.policy.subjectRoles?.every((r:string)=>r==='TEACHER')||!track.policy.respondentRoles?.every((r:string)=>r==='TEACHER')
  ||canonicalHash(entry.resultDisclosure)!==canonicalHash(track.policy.resultDisclosure))hidden()
 return {...run,principal,track,minimumN:Math.max(teacherResourceMinimum(),track.policy.minimumRespondents??0,entry!.resultDisclosure!.minimumRespondents??0)}
}

/** Content-owned new GROUP only. A result directory is never an authorization
 * set; every generate/read independently resolves its actual event/track. */
export async function listTeacherNumericGroups(input:TeacherNumericScope){
 const run=await source(input)
 const tracks=await prisma.$queryRaw<Array<{trackId:string;title:string}>>`
  SELECT t.id AS "trackId",r.entry->>'title' AS title FROM assessment_run_tracks t
  JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
  WHERE t.organization_id=${input.organizationId} AND t.run_id=${run.runId} AND t.resource_family='SCALE'
    AND (t.resource_key LIKE 'teacher-scale:%:GROUP' OR t.resource_key LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP')
  ORDER BY t.id`
 const sources=[]
 for(const track of tracks){
  const valid=await source(input,track.trackId)
  const tools=await listAuthoritativeRunLeafSources({organizationId:input.organizationId,runId:run.runId,trackId:track.trackId,groupAudience:'ORGANIZATION'})
  if(tools.length)sources.push({...track,tools,minimumN:valid.minimumN,groups:await listEducationGroupSelections({organizationId:input.organizationId,runId:run.runId,trackId:track.trackId,product:'TEACHER'})})
 }
 const specs=await prisma.$queryRaw<Array<{specId:string;title:string}>>`SELECT id AS "specId",spec_key AS title FROM reporting_analysis_specs
  WHERE status='PUBLISHED' AND definition->>'analysisKind'='GROUP' ORDER BY spec_key,id`
 const versions=await prisma.$queryRaw<Array<{artifactId:string;generatedAt:Date}>>`SELECT id AS "artifactId",generated_at AS "generatedAt" FROM reporting_analysis_artifacts
  WHERE organization_id=${input.organizationId} AND analysis_kind='GROUP' AND artifact_payload->>'schemaVersion'='2'
    AND artifact_payload->'source'->>'runId'=${run.runId} ORDER BY generated_at DESC,id DESC LIMIT 100`
 await assertTeacherGroupAuthority({...input,runIds:[run.runId]})
 return {sources,specs,versions:versions.map(v=>({...v,generatedAt:v.generatedAt.toISOString()})),canGenerate:run.eventClosed&&run.runClosed}
}

/** Same existing small-change overlap rule, on frozen actual contributors.
 * This first numeric consumer preserves the strict completed-cohort boundary;
 * no early partial-population report is created while responses arrive. */
export async function assertTeacherNumericDisclosure(input:{organizationId:string;cohort:ReportingCohortSnapshotRecord;leaf:ReportingLeafSourceV2;minimumN:number}){
 const ids=input.cohort.members.map(m=>m.executionId)
 const [complete]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM assessment_run_executions
  WHERE organization_id=${input.organizationId} AND run_id=${input.cohort.sourceRunId} AND track_id=${input.cohort.sourceTrackId} AND id=ANY(${ids}::text[]) AND status='COMPLETED'`
 if(input.cohort.eligibleN<input.minimumN||complete?.n!==ids.length)reportingFail('HUITEACHER_GROUP_PENDING_FINALS','所选群体须达到既有人数要求并全部正式完成',409)
 const users=input.cohort.members.map(m=>m.userId)
 const [measurement]=await prisma.$queryRaw<Array<{hash:string}>>`SELECT release.content->>'measurementHash' AS hash
  FROM assessment_run_tracks t JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
  JOIN scales s ON s.id=r.scale_id JOIN measurement_content_releases release ON release.id=s.measurement_release_id
  WHERE t.organization_id=${input.organizationId} AND t.run_id=${input.cohort.sourceRunId} AND t.id=${input.cohort.sourceTrackId}`
 if(!measurement?.hash)return hidden()
 const prior=await prisma.$queryRaw<Array<{priorN:number;shared:number;minimumN:number}>>(Prisma.sql`
  SELECT jsonb_array_length(c.members)::int AS "priorN",
    (SELECT COUNT(*)::int FROM jsonb_array_elements(c.members) m WHERE m->>'userId'=ANY(${users}::text[])) AS shared,
    GREATEST(${input.minimumN},COALESCE((t.frozen_resource_policy->>'minimumRespondents')::int,0),
      COALESCE((spec.definition->>'minimumCohortN')::int,0),COALESCE((spec.definition->>'minimumContributorN')::int,0),
      COALESCE((SELECT MAX((m->>'minimumMetricN')::int) FROM jsonb_array_elements(spec.definition->'metricRules') m),0)) AS "minimumN"
  FROM reporting_analysis_artifacts a JOIN reporting_cohort_snapshots c ON c.id=a.cohort_snapshot_id AND c.organization_id=a.organization_id
  JOIN huiteacher_evaluation_run_links l ON l.run_id=c.source_run_id AND l.organization_id=c.organization_id
  JOIN reporting_analysis_specs spec ON spec.id=a.spec_id
  LEFT JOIN assessment_run_tracks t ON t.organization_id=c.organization_id AND t.run_id=c.source_run_id AND t.id=c.source_track_id
  LEFT JOIN registered_assessment_resources resource ON resource.resource_key=t.resource_key AND resource.resource_version=t.resource_version
  LEFT JOIN scales prior_scale ON prior_scale.id=resource.scale_id
  LEFT JOIN measurement_content_releases release ON release.id=prior_scale.measurement_release_id
  WHERE a.organization_id=${input.organizationId} AND a.analysis_kind='GROUP'
    AND (a.artifact_payload->'source'->'leaf' IS NULL OR release.content->>'measurementHash' IS NULL
      OR (a.artifact_payload->'source'->'leaf'->>'unitType'=${input.leaf.unitType}
        AND (release.content->>'measurementHash'=${measurement.hash} OR a.artifact_payload->'source'->'leaf'->>'instrumentKey'=${input.leaf.instrumentKey})))`)
 if(prior.some(p=>unsafeTeacherDisclosureOverlapCounts(users.length,p.priorN,p.shared,p.minimumN)))reportingFail('TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED','与既有群报的人群差异不足',409)
 return {comparedArtifacts:prior.length,measurementHash:measurement.hash}
}

function present(stored:Awaited<ReturnType<typeof readReportingArtifactRecord>>){
 if(stored.analysisKind!=='GROUP'||stored.artifactPayload.schemaVersion!==2)return hidden()
 const a=stored.artifactPayload,p=a.projection as any
 const floor=(id:string)=>a.metricMetadata[id]?.minimumN??3
 return {artifactId:stored.id,generatedAt:stored.generatedAt.toISOString(),projection:{title:'教师群体报告',sourceLabel:a.presentation?.sourceLabel??a.source.leaf.instrumentKey,
  cutoff:stored.generatedAt.toISOString(),populationLabel:a.presentation?.populationLabel??'全部合格参与教师',completedN:p.state==='present'?p.resultContributorN:null,
  assignedN:p.state==='present'?p.eligibleN:null,countUnit:'PERSON' as const,tool:{key:a.source.leaf.instrumentKey,title:a.source.leaf.instrumentKey,kind:a.source.leaf.unitType},
  metrics:Object.entries(p.metrics??{}).map(([key,raw])=>{const m=raw as any,ok=p.state==='present'&&m.state==='present'&&m.validN>=floor(key)&&(m.missingN===0||m.missingN>=floor(key));return {
   key,label:key,type:'NUMBER' as const,unit:a.metricMetadata[key]?.unit??null,state:ok?'present' as const:'suppressed' as const,validN:ok?m.validN:null,missingN:ok?m.missingN:null,
   mean:ok?m.aggregations?.mean??null:null,sdSample:ok?m.aggregations?.sdSample??null:null,range:null,observedRange:ok?m.aggregations?.minMax??null:null,qualityCounts:{},measurement:a.source.leaf,frequencies:[]}}),
  limitations:['沿用已发布 GROUP 合同与方案；每项有效人数独立计算，小缺失补集保持抑制。','本轮只消费固定 Scale 叶数值；原生 Cognitive/SJT 和 Bundle Profile 未包含。','旧版本读取保存快照；主动更新才重新处理正式结果。']}}
}

export async function readTeacherNumericGroup(input:TeacherNumericScope&{artifactId:string}){
 const artifact=await readReportingArtifactRecord(input.artifactId)
 if(artifact.organizationId!==input.organizationId||artifact.analysisKind!=='GROUP'||artifact.artifactPayload.schemaVersion!==2)return hidden()
 const run=await source(input,artifact.artifactPayload.source.trackId)
 if(run.runId!==artifact.artifactPayload.source.runId)hidden()
 const result=await readOrganizationGroupArtifact({principal:run.principal,organizationId:input.organizationId,artifactId:artifact.id})
 // The public authorized projection can be narrower than the frozen bytes.
 return present({...artifact,artifactPayload:{...artifact.artifactPayload,projection:result.projection}} as typeof artifact)
}
export async function generateTeacherNumericGroup(input:TeacherNumericScope&{trackId:string;leaf:ReportingLeafSourceV2;specId:string;selection:EducationGroupSelection}){
 const run=await source(input,input.trackId)
 if(!run.eventClosed||!run.runClosed)reportingFail('HUITEACHER_GROUP_NOT_FROZEN','请先关闭评价活动和任务',409)
 const spec=await getPublishedReportingSpec(input.specId)
 if(spec.definition.analysisKind!=='GROUP'||spec.definition.minimumCohortN<run.minimumN!||spec.definition.minimumContributorN<run.minimumN!
   ||spec.definition.metricRules.some(m=>m.minimumMetricN<run.minimumN!))reportingFail('REPORT_SPEC_INVALID','方案低于本任务披露人数要求',409)
 const cohortSelector=await educationGroupSelector(input.organizationId,'TEACHER',input.selection)
 return prisma.$transaction(async tx=>{
  await lockTeacherDisclosure(tx,input.organizationId)
  const generated=await generateOrganizationGroupAnalysis({principal:run.principal,organizationId:input.organizationId,runId:run.runId,trackId:input.trackId,specId:input.specId,
   leaf:input.leaf,cohortSelector,presentation:await educationGroupPresentation({organizationId:input.organizationId,runId:run.runId,selection:input.selection}),
   beforeCompute:async cohort=>{await assertTeacherNumericDisclosure({organizationId:input.organizationId,cohort,leaf:input.leaf,minimumN:run.minimumN!})}})
  return readTeacherNumericGroup({...input,artifactId:generated.artifactId})
 },{timeout:60000})
}
