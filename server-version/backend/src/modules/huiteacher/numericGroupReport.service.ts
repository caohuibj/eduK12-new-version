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
import {reportingFail,type ReportingCohortSnapshotRecord,type ReportingLeafSourceV2,type ReportingGroupArtifactPayload} from '../reporting/types'
import {assertTeacherGroupAuthority} from './groupReportAuthority'
import {teacherResourceMinimum} from './privacyV2'
import {unsafeTeacherDisclosureOverlap} from './disclosureOverlap.service'
import {lockTeacherDisclosure} from './privacyReleaseV2.service'

export type TeacherNumericScope={organizationId:string;eventId:string;actorUserId:string}
const hidden=():never=>reportingFail('REPORT_NOT_FOUND','Teacher group report unavailable',404)
export function teacherAggregateReady(rule:{mode:string;delaySeconds?:number},closedAt:Date|null,now=Date.now()){
 return rule.mode==='AGGREGATE_ONLY'||rule.mode==='DELAYED_AGGREGATE'&&!!closedAt&&now>=closedAt.getTime()+rule.delaySeconds!*1000
}
async function source(input:TeacherNumericScope,trackId?:string){
 const [run]=await prisma.$queryRaw<Array<{runId:string;name:string;eventStatus:string;runStatus:string;closedAt:Date|null}>>`
  SELECT r.id AS "runId",e.title AS name,e.status AS "eventStatus",r.status AS "runStatus",r.closed_at AS "closedAt"
  FROM huiteacher_evaluation_run_links l JOIN huiteacher_evaluation_events e ON e.id=l.event_id AND e.organization_id=l.organization_id
  JOIN assessment_runs r ON r.id=l.run_id AND r.organization_id=l.organization_id
  WHERE l.organization_id=${input.organizationId} AND l.event_id=${input.eventId}`
 if(!run)hidden()
 await assertTeacherGroupAuthority({...input,runIds:[run.runId]})
 const principal={userId:input.actorUserId,platformRole:'STANDARD' as const,product:'HUITEACHER' as const}
 const canGenerate=['OPEN','CLOSED'].includes(run.eventStatus)&&['PUBLISHED','CLOSED'].includes(run.runStatus)
 if(!trackId)return {...run,principal,minimumN:teacherResourceMinimum(),canGenerate,allowedMetricKeys:[] as string[]}
 const [track]=await prisma.$queryRaw<Array<{family:string;key:string;version:string;policy:any;hash:string}>>`
  SELECT resource_family AS family,resource_key AS key,resource_version AS version,frozen_resource_policy AS policy,resource_policy_hash AS hash
  FROM assessment_run_tracks WHERE organization_id=${input.organizationId} AND run_id=${run.runId} AND id=${trackId}`
 if(!track||canonicalHash(track.policy)!==track.hash)hidden()
 if(track.family!=='SCALE'||!track.key.endsWith(':GROUP')
   ||!['teacher-scale:','library-scale:'].some(prefix=>track.key.startsWith(prefix)))hidden()
 const entry=await resolveHistoricalRelationalEntry({resourceKind:track.family,resourceKey:track.key,resourceVersion:track.version} as any)
 if(!entry||!isSelfGroupV2Entry(entry)||!entry.resultDisclosure?.audiences.ORGANIZATION.mode.includes('AGGREGATE')
  ||!track.policy.subjectRoles?.every((r:string)=>r==='TEACHER')||!track.policy.respondentRoles?.every((r:string)=>r==='TEACHER')
  ||canonicalHash(entry.resultDisclosure)!==canonicalHash(track.policy.resultDisclosure))hidden()
 return {...run,principal,track,allowedMetricKeys:entry!.resultDisclosure!.audiences.ORGANIZATION.metricKeys,canGenerate:canGenerate&&teacherAggregateReady(entry!.resultDisclosure!.audiences.ORGANIZATION,run.closedAt),minimumN:Math.max(teacherResourceMinimum(),track.policy.minimumRespondents??0,entry!.resultDisclosure!.minimumRespondents??0)}
}

/** Content-owned new GROUP only. A result directory is never an authorization
 * set; every generate/read independently resolves its actual event/track. */
export type TeacherNumericVersionCursor={generatedAt:string;artifactId:string}
/** Pointer-only seek; consumers independently authorize the actual event/Run. */
export async function listTeacherNumericVersionPointers(input:{organizationId:string;runId:string;before?:TeacherNumericVersionCursor},db:Prisma.TransactionClient|typeof prisma=prisma){
 const rows=await db.$queryRaw<Array<{artifactId:string;generatedAt:Date;cursorAt:string}>>(Prisma.sql`
  SELECT a.id AS "artifactId",a.generated_at AS "generatedAt",
   to_char(a.generated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
  FROM reporting_analysis_artifacts a
  WHERE a.organization_id=${input.organizationId} AND a.analysis_kind='GROUP' AND a.artifact_payload->>'schemaVersion'='2'
    AND a.artifact_payload->'source'->>'runId'=${input.runId}
    ${input.before?Prisma.sql`AND (a.generated_at,a.id)<(${input.before.generatedAt}::timestamptz,${input.before.artifactId})`:Prisma.empty}
  ORDER BY a.generated_at DESC,a.id DESC LIMIT 26`)
 const page=rows.slice(0,25),last=page[page.length-1]
 return {versions:page.map(v=>({artifactId:v.artifactId,generatedAt:v.generatedAt.toISOString()})),nextCursor:rows.length>25?{generatedAt:last.cursorAt,artifactId:last.artifactId}:null}
}
export async function listTeacherNumericGroups(input:TeacherNumericScope,options:{configure?:boolean;before?:TeacherNumericVersionCursor}={}){
 const run=await source(input)
 const sources:Array<{trackId:string;title:string;tools:Awaited<ReturnType<typeof listAuthoritativeRunLeafSources>>;minimumN:number;canGenerate:boolean;groups:Awaited<ReturnType<typeof listEducationGroupSelections>>}>=[]
 if(options.configure){
 const tracks=await prisma.$queryRaw<Array<{trackId:string;title:string}>>`
  SELECT t.id AS "trackId",r.entry->>'title' AS title FROM assessment_run_tracks t
  JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
  WHERE t.organization_id=${input.organizationId} AND t.run_id=${run.runId} AND t.resource_family='SCALE'
    AND (t.resource_key LIKE 'teacher-scale:%:GROUP' OR t.resource_key LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP')
  ORDER BY t.id`
 for(const track of tracks){
  const valid=await source(input,track.trackId)
  const tools=await listAuthoritativeRunLeafSources({organizationId:input.organizationId,runId:run.runId,trackId:track.trackId,groupAudience:'ORGANIZATION'})
  if(tools.length)sources.push({...track,tools,minimumN:valid.minimumN,canGenerate:valid.canGenerate,groups:await listEducationGroupSelections({organizationId:input.organizationId,runId:run.runId,trackId:track.trackId,product:'TEACHER'})})
 }
 }
 const specs=options.configure?await prisma.$queryRaw<Array<{specId:string;title:string}>>`SELECT id AS "specId",spec_key AS title FROM reporting_analysis_specs
  WHERE status='PUBLISHED' AND definition->>'analysisKind'='GROUP' ORDER BY spec_key,id`:[]
 const page=await listTeacherNumericVersionPointers({organizationId:input.organizationId,runId:run.runId,before:options.before})
 await assertTeacherGroupAuthority({...input,runIds:[run.runId]})
 return {sources,specs,...page,canGenerate:run.canGenerate}
}

/** Reuse the engine's already accepted inputs. A per-metric subset is stored
 * internally only when it differs from inputManifest; no values/raw answers. */
function contributorUsers(payload:ReportingGroupArtifactPayload,metricId?:string):string[]|null{
 const all=payload.inputManifest
 if(!metricId)return all.map(r=>r.subjectUserId)
 const p=payload.projection
 if(p.state!=='present')return null
 const metric=p.metrics![metricId]
 if(metric?.state!=='present')return null
 const ids=payload.schemaVersion===2?payload.metricContributorExecutionIds?.[metricId]:undefined
 if(!ids)return metric.validN===all.length?all.map(r=>r.subjectUserId):null
 const byId=new Map(all.map(r=>[r.executionId,r.subjectUserId]))
 if(ids.length!==metric.validN||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))
  reportingFail('REPORT_ARTIFACT_INTEGRITY','指标贡献者引用与冻结输入不一致',500)
 return ids.map(id=>byId.get(id)!)
}
function disclosedMetrics(payload:ReportingGroupArtifactPayload){
 const p=payload.projection
 if(p.state!=='present')return []
 return Object.entries(p.metrics!).filter(([id,m])=>{
  const floor=payload.schemaVersion===2?payload.metricMetadata[id]?.minimumN??3:3
  return m.state==='present'&&m.validN!>=floor&&(m.missingN===0||m.missingN!>=floor)
 }).map(([id])=>id)
}
const countsVisible=(payload:ReportingGroupArtifactPayload,minimumN:number)=>{
 const p=payload.projection
 return p.state==='present'&&((p.eligibleN! - p.resultContributorN!)===0||(p.eligibleN! - p.resultContributorN!)>=minimumN)
}
/** Existing small-change rule, now over immutable actual contributor sets,
 * including per-metric quality/missingness subsets instead of invitee lists. */
export async function assertTeacherNumericDisclosure(input:{organizationId:string;cohort:ReportingCohortSnapshotRecord;leaf:ReportingLeafSourceV2;minimumN:number;payload:ReportingGroupArtifactPayload;metricRules:Array<{metricId:string;sourceMetricKey:string}>},db:Prisma.TransactionClient|typeof prisma=prisma){
 const metrics=disclosedMetrics(input.payload)
 if(!countsVisible(input.payload,input.minimumN)&&!metrics.length)return {comparedArtifacts:0,measurementHash:null}
 const [measurement]=await db.$queryRaw<Array<{hash:string}>>`SELECT release.content->>'measurementHash' AS hash
  FROM assessment_run_tracks t JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
  JOIN scales s ON s.id=r.scale_id JOIN measurement_content_releases release ON release.id=s.measurement_release_id
  WHERE t.organization_id=${input.organizationId} AND t.run_id=${input.cohort.sourceRunId} AND t.id=${input.cohort.sourceTrackId}`
 if(!measurement?.hash)return hidden()
 const prior=await db.$queryRaw<Array<{payload:ReportingGroupArtifactPayload;minimumN:number;metricRules:Array<{metricId:string;sourceMetricKey:string}>}>>(Prisma.sql`
  SELECT a.artifact_payload AS payload,spec.definition->'metricRules' AS "metricRules",
    GREATEST(${input.minimumN},COALESCE((t.frozen_resource_policy->>'minimumRespondents')::int,0),
      COALESCE((spec.definition->>'minimumCohortN')::int,0),COALESCE((spec.definition->>'minimumContributorN')::int,0),
      COALESCE((SELECT MAX((m->>'minimumMetricN')::int) FROM jsonb_array_elements(spec.definition->'metricRules') m),0))::int AS "minimumN"
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

 const currentContributors=contributorUsers(input.payload)!
 for(const old of prior){
  const previousContributors=contributorUsers(old.payload)!
  const floor=Math.max(input.minimumN,old.minimumN)
  if(countsVisible(input.payload,input.minimumN)&&countsVisible(old.payload,old.minimumN)
   &&unsafeTeacherDisclosureOverlap(currentContributors,previousContributors,floor))
   reportingFail('TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED','与既有群报的实际贡献者差异不足',409)
  const oldMetrics=new Set(disclosedMetrics(old.payload))
  for(const metricId of metrics){
   const sourceKey=input.metricRules.find(rule=>rule.metricId===metricId)!.sourceMetricKey
   for(const priorRule of old.metricRules.filter(rule=>rule.sourceMetricKey===sourceKey&&oldMetrics.has(rule.metricId))){
   const current=contributorUsers(input.payload,metricId),previous=contributorUsers(old.payload,priorRule.metricId)
   if(!current||!previous)reportingFail('TEACHER_REPORT_COMPARABLE_SOURCE_UNKNOWN','历史报告未冻结该指标的实际贡献者，不能新增可比较披露',409)
   const metricFloor=Math.max(floor,input.payload.schemaVersion===2?input.payload.metricMetadata[metricId]?.minimumN??0:0,
    old.payload.schemaVersion===2?old.payload.metricMetadata[priorRule.metricId]?.minimumN??0:0)
   if(unsafeTeacherDisclosureOverlap(current!,previous!,metricFloor))
    reportingFail('TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED','与既有群报的指标贡献者差异不足',409)
   }
  }
 }
 return {comparedArtifacts:prior.length,measurementHash:measurement.hash}
}

function present(stored:Awaited<ReturnType<typeof readReportingArtifactRecord>>,minimumN:number){
 if(stored.analysisKind!=='GROUP'||stored.artifactPayload.schemaVersion!==2)return hidden()
 const a=stored.artifactPayload,p=a.projection as any
 const floor=(id:string)=>a.metricMetadata[id]?.minimumN??3
 return {artifactId:stored.id,generatedAt:stored.generatedAt.toISOString(),projection:{title:'教师群体报告',sourceLabel:a.presentation?.sourceLabel??a.source.leaf.instrumentKey,
  cutoff:stored.generatedAt.toISOString(),populationLabel:a.presentation?.populationLabel??'全部合格参与教师',completedN:countsVisible(a,minimumN)?p.resultContributorN:null,
  assignedN:countsVisible(a,minimumN)?p.eligibleN:null,countUnit:'PERSON' as const,tool:{key:a.source.leaf.instrumentKey,title:a.source.leaf.instrumentKey,kind:a.source.leaf.unitType},
  metrics:Object.entries(p.metrics??{}).map(([key,raw])=>{const m=raw as any,ok=p.state==='present'&&m.state==='present'&&m.validN>=floor(key)&&(m.missingN===0||m.missingN>=floor(key));return {
   key,label:key,type:'NUMBER' as const,unit:a.metricMetadata[key]?.unit??null,state:ok?'present' as const:'suppressed' as const,validN:ok?m.validN:null,missingN:ok?m.missingN:null,
   mean:ok?m.aggregations?.mean??null:null,sdSample:ok?m.aggregations?.sdSample??null:null,range:null,observedRange:ok?m.aggregations?.minMax??null:null,qualityCounts:{},measurement:a.source.leaf,frequencies:[]}}),
  limitations:['沿用已发布 GROUP 合同与方案；每项有效人数独立计算，小缺失补集保持抑制。','本轮只消费固定 Scale 叶数值；原生 Cognitive/SJT 和 Bundle Profile 未包含。','未完成成员不计为零分；有效 N、缺失补集和真实贡献者差分均满足时可展示部分样本。','旧版本读取保存快照；主动更新才重新处理正式结果。']}}
}

export async function readTeacherNumericGroup(input:TeacherNumericScope&{artifactId:string}){
 const artifact=await readReportingArtifactRecord(input.artifactId)
 if(artifact.organizationId!==input.organizationId||artifact.analysisKind!=='GROUP'||artifact.artifactPayload.schemaVersion!==2)return hidden()
 const run=await source(input,artifact.artifactPayload.source.trackId)
 if(run.runId!==artifact.artifactPayload.source.runId)hidden()
 const result=await readOrganizationGroupArtifact({principal:run.principal,organizationId:input.organizationId,artifactId:artifact.id})
 // The public authorized projection can be narrower than the frozen bytes.
 const spec=await getPublishedReportingSpec(artifact.specId)
 const minimumN=spec.definition.analysisKind==='GROUP'?Math.max(run.minimumN,spec.definition.minimumCohortN,spec.definition.minimumContributorN):run.minimumN
 return present({...artifact,artifactPayload:{...artifact.artifactPayload,projection:result.projection}} as typeof artifact,minimumN)
}
export async function generateTeacherNumericGroup(input:TeacherNumericScope&{trackId:string;leaf:ReportingLeafSourceV2;specId:string;selection:EducationGroupSelection}){
 const run=await source(input,input.trackId)
 if(!run.canGenerate)reportingFail('HUITEACHER_GROUP_NOT_AVAILABLE','任务状态或该工具合同的披露时机尚未满足',409)
 const spec=await getPublishedReportingSpec(input.specId)
 if(spec.definition.analysisKind!=='GROUP')return reportingFail('REPORT_SPEC_INVALID','方案须为已发布的单次群体方案',409)
 if(spec.definition.minimumCohortN<run.minimumN!||spec.definition.minimumContributorN<run.minimumN!
   ||spec.definition.metricRules.some(m=>m.minimumMetricN<run.minimumN!))reportingFail('REPORT_SPEC_INVALID','方案低于本任务披露人数要求',409)
 if(spec.definition.metricRules.some(m=>!run.allowedMetricKeys.includes(m.sourceMetricKey)))reportingFail('REPORT_SPEC_SCOPE','方案指标超出该来源的组织群体上限',409)
 const minimumN=Math.max(run.minimumN,spec.definition.minimumCohortN,spec.definition.minimumContributorN)
 const metricRules=spec.definition.metricRules
 const cohortSelector=await educationGroupSelector(input.organizationId,'TEACHER',input.selection)
 const generated=await prisma.$transaction(async tx=>{
  await lockTeacherDisclosure(tx,input.organizationId)
  return generateOrganizationGroupAnalysis({principal:run.principal,organizationId:input.organizationId,runId:run.runId,trackId:input.trackId,specId:input.specId,tx,
   leaf:input.leaf,cohortSelector,presentation:await educationGroupPresentation({organizationId:input.organizationId,runId:run.runId,selection:input.selection}),
   beforePersist:async({cohort,payload})=>{await assertTeacherNumericDisclosure({organizationId:input.organizationId,cohort,leaf:input.leaf,minimumN,payload,metricRules},tx)}})
 },{timeout:60000})
 return readTeacherNumericGroup({...input,artifactId:generated.artifactId})
}
