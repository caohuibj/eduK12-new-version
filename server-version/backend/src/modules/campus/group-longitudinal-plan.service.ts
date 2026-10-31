import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {trainingTrackingMeasurementIdentity} from '../composite/personal-tracking'
import {educationTrackingSchema,type EducationTracking} from '../reporting/education-personal-tracking'
import {groupTrackingMetrics,projectGroupLongitudinal,type GroupLongitudinalWave} from '../reporting/group-longitudinal'
import type {TrackedMetric} from '../reporting/personal-tracking'
import {listAuthoritativeRunLeafSources} from '../reporting/resultSource'
import {getPublishedReportingSpec} from '../reporting/spec'
import {readReportingArtifactRecord} from '../reporting/artifact'
import {listTaskGroupLongitudinalArtifactsPage,type TaskArtifactCursor,readTaskGroupLongitudinalArtifact,saveTaskGroupLongitudinalArtifact} from '../reporting/task-artifact'
import type {TaskGroupProjection} from '../reporting/group-summary'
import type {EducationGroupSelection} from '../reporting/education-group-selection'
import {reportingFail,type ReportingLeafSourceV2} from '../reporting/types'
import {generateCampusGroupReport,readCampusGroupReport,requireCampusGroupManager,assertReviewedCampusGroupSpec} from './group-reports'

type Scope={actor:AuthenticatedPrincipal;organizationId:string;runId:string}
type Wave={id:string;ordinal:number;name:string;tracking:unknown}
const unavailable=(message='校园纵向群体来源不可访问',status=409):never=>reportingFail('CAMPUS_PLAN_GROUP_UNAVAILABLE',message,status)
async function resolvePlan(input:Scope){
 await requireCampusGroupManager(input.actor,input.organizationId)
 const [anchor]=await prisma.$queryRaw<Array<{baselineId:string|null;tracking:unknown}>>`SELECT run.personal_tracking_baseline_id AS "baselineId",run.personal_tracking AS tracking FROM assessment_runs run
  WHERE run.id=${input.runId} AND run.organization_id=${input.organizationId} AND run.status IN ('PUBLISHED','CLOSED')
   AND EXISTS(SELECT 1 FROM campus_activity_runs link WHERE link.organization_id=run.organization_id AND link.run_id=run.id)`
 if(!anchor)return unavailable('已发布校园追踪任务不存在',404)
 if(!anchor.baselineId)return null
 if(educationTrackingSchema.parse(anchor.tracking).entry!=='SCHOOL')return unavailable()
 const waves=await prisma.$queryRaw<Wave[]>`SELECT run.id,run.personal_tracking_ordinal AS ordinal,run.name,run.personal_tracking AS tracking
  FROM assessment_runs run WHERE run.organization_id=${input.organizationId} AND run.personal_tracking_baseline_id=${anchor.baselineId}
   AND run.status IN ('PUBLISHED','CLOSED') AND run.personal_tracking->>'entry'='SCHOOL'
   AND EXISTS(SELECT 1 FROM campus_activity_runs link WHERE link.organization_id=run.organization_id AND link.run_id=run.id)
  ORDER BY run.personal_tracking_ordinal,run.id LIMIT 101`
 if(!waves.length||waves.length>100||waves[0].id!==anchor.baselineId||waves[0].ordinal!==1)return unavailable('校园追踪计划波次不完整')
 const plan=educationTrackingSchema.parse(waves[0].tracking).plan
 if(!plan||plan.baselineWaveId!==anchor.baselineId)return unavailable('校园追踪基线不可用')
 return {plan,waves,source:{product:'SCHOOL' as const,containerId:input.organizationId,taskId:anchor.baselineId}}
}
export async function schoolPlanGroupCatalog(input:Scope&{before?:TaskArtifactCursor}){
 const state=await resolvePlan(input)
 if(!state)return {status:'NOT_CONFIGURED' as const,tools:[],waves:[],artifacts:[]}
 const page=await prisma.$transaction(tx=>listTaskGroupLongitudinalArtifactsPage(tx,state.source,state.plan.id,input.before))
 return {status:'CONFIGURED' as const,planId:state.plan.id,tools:[...new Map(state.plan.metrics.map(m=>[m.sourceKey,{key:m.sourceKey,label:m.label,kind:m.kind}])).values()],waves:state.waves.map(({tracking:_tracking,...w})=>({...w,title:w.name})),...page}
}

/** Current wave bindings locate one leaf before any score key is considered.
 * Person visibility is intentionally not a GROUP permission. */
export function schoolPlanLeafBinding(tracking:EducationTracking,metrics:TrackedMetric[]){
 if(tracking.entry!=='SCHOOL')return unavailable('不是校园追踪计划')
 const selected=metrics.map(metric=>({metric,binding:tracking.bindings.find(b=>b.metricId===metric.id)}))
 if(selected.some(s=>!s.binding||s.binding.scoreKey!==s.metric.scoreKey)||new Set(selected.map(s=>s.binding!.trackId+':'+s.binding!.itemId)).size!==1)return unavailable('追踪项没有唯一当轮子工具位置')
 const binding=selected[0].binding!
 const kind=metrics[0].kind
 if(kind==='FORM'||metrics.some(m=>m.kind!==kind))return unavailable('此校园来源没有已批准的数值叶工具适配')
 return {trackId:binding.trackId,itemId:binding.itemId,slotKey:compositeItemSlotKey(binding.itemId,kind==='SJT'?'SITUATIONAL':kind),selected}
}
async function resolveLeaves(input:Scope,metrics:TrackedMetric[],waves:Wave[],headers:Header[]){
 const principal=await requireCampusGroupManager(input.actor,input.organizationId)
 const selected=waves.map(wave=>({wave,...schoolPlanLeafBinding(educationTrackingSchema.parse(wave.tracking),metrics)}))
 const tracks=await prisma.$queryRaw<Array<{id:string;runId:string;policy:unknown;policyHash:string}>>(Prisma.sql`SELECT id,run_id AS "runId",frozen_resource_policy AS policy,resource_policy_hash AS "policyHash"
  FROM assessment_run_tracks WHERE organization_id=${input.organizationId} AND id IN (${Prisma.join(selected.map(s=>s.trackId))})`)
 const policies=selected.map(s=>{
  const track=tracks.find(t=>t.id===s.trackId&&t.runId===s.wave.id),policy=track?.policy as {runtimeLaunchTarget?:{kind:string;ref:string}}|undefined
  if(!track||!policy||canonicalHash(policy)!==track.policyHash||policy.runtimeLaunchTarget?.kind!=='COMPOSITE')return unavailable('校园追踪冻结来源不完整')
  return {selected:s,compositeId:policy.runtimeLaunchTarget.ref}
 })
 const composites=await prisma.compositeAssessment.findMany({where:{id:{in:[...new Set(policies.map(p=>p.compositeId))]}},include:{items:{include:{cognitiveAssignment:true}}}})
 const resolved=[]
 for(const {selected:s,compositeId}of policies){
  const composite=composites.find(c=>c.id===compositeId),snapshot=trainingContentSnapshotSchema.safeParse(composite?.trainingContentSnapshot)
  if(!composite||!snapshot.success||snapshot.data.compositeId!==composite.id||canonicalHash(snapshot.data)!==composite.trainingContentSnapshotHash)return unavailable('校园冻结测量来源不完整')
  const unit=snapshot.data.units.find(u=>u.itemId===s.itemId),item=composite.items.find(i=>i.id===s.itemId)
  if(!unit||unit.family!==metrics[0].kind||!item||s.selected.some(({metric})=>trainingTrackingMeasurementIdentity(unit,item)!==metric.measurementHash))return unavailable('校园追踪测量定义变化')
  const tools=await listAuthoritativeRunLeafSources({organizationId:input.organizationId,runId:s.wave.id,trackId:s.trackId,slotKey:s.slotKey,groupAudience:principal.groupAudience})
  const candidates=tools.filter(t=>t.leaf.slotKey===s.slotKey&&t.leaf.unitType===(metrics[0].kind==='SJT'?'SITUATIONAL':metrics[0].kind)
   &&metrics.some(m=>t.metrics.some(v=>v.key===m.scoreKey&&v.unit===m.unit)))
  // Discovery verifies the frozen source even when there is no accepted result
  // to advertise. Keep that empty round; do not turn a denied populated source
  // into a missing round.
  if(!tools.length&&!headers.some(h=>h.runId===s.wave.id&&h.trackId===s.trackId)){
   resolved.push({...s,allowedMetricIds:[] as string[],leaf:null,protocol:null});continue
  }
  if(candidates.length!==1)return unavailable('追踪叶工具缺少获准群体数值来源，或存在多个实际配置，不能混合')
  const allowedMetricIds=metrics.filter(m=>candidates[0].metrics.some(v=>v.key===m.scoreKey)).map(m=>m.id)
  if(metrics.some(m=>candidates[0].metrics.some(v=>v.key===m.scoreKey&&v.unit!==m.unit)))return unavailable('校园追踪数值单位变化')
  resolved.push({...s,allowedMetricIds,leaf:candidates[0].leaf,protocol:candidates[0].protocolSignature??candidates[0].leaf.compiledRuntimeHash})
 }
 return resolved
}

type Header={executionId:string;runId:string;trackId:string;subjectId:string;attemptId:string;epoch:number;completedAt:Date;latest:boolean}
export async function readSchoolPlanCompletedHeaders(organizationId:string,waves:Array<{wave:Wave;trackId:string}>){
 const headers=await prisma.$queryRaw<Header[]>(Prisma.sql`SELECT e.id AS "executionId",e.run_id AS "runId",e.track_id AS "trackId",subject.user_id AS "subjectId",
  a.id AS "attemptId",a.attempt_epoch AS epoch,a.completed_at AS "completedAt",(latest.id=a.id) AS latest
  FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots subject ON subject.organization_id=e.organization_id AND subject.run_id=e.run_id AND subject.id=e.subject_actor_snapshot_id
  JOIN composite_assessment_attempts a ON a.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND a.assignment_ref=e.relational_assignment_id AND a.user_id=subject.user_id AND a.subject_user_id=subject.user_id AND a.respondent_user_id=subject.user_id AND a.status='COMPLETED' AND a.completed_at IS NOT NULL
  JOIN LATERAL(SELECT chosen.id FROM composite_assessment_attempts chosen WHERE chosen.assignment_ref=e.relational_assignment_id
   AND chosen.user_id=subject.user_id AND chosen.subject_user_id=subject.user_id AND chosen.respondent_user_id=subject.user_id AND chosen.status='COMPLETED' AND chosen.completed_at IS NOT NULL ORDER BY chosen.completed_at DESC,chosen.id DESC LIMIT 1)latest ON TRUE
  WHERE e.organization_id=${organizationId} AND e.status='COMPLETED'
   AND (${Prisma.join(waves.map(w=>Prisma.sql`(e.run_id=${w.wave.id} AND e.track_id=${w.trackId})`),' OR ')})
  ORDER BY e.id LIMIT 6001`)
 if(headers.length>6000||headers.some(h=>!h.latest))return unavailable('校园完成结果范围超限或当前绑定不是最新正式完成结果')
 return headers
}

type WaveRef={runId:string;trackId:string}&({missing:true}|{missing?:false;artifactId:string;snapshotHash:string;projectionHash:string;metricKeys:string[];leaf:ReportingLeafSourceV2})
/** Freeze the numeric disclosure, not the current template's wording. */
export function schoolGroupNumericView(projection:TaskGroupProjection,keys:string[]){
 return {completedN:projection.completedN,countUnit:projection.countUnit,metrics:[...keys].sort().map(key=>{const m=projection.metrics.find(m=>m.key===key);return m?{key,type:m.type,unit:m.unit??null,state:m.state??'present',validN:m.validN??null,missingN:m.missingN??null,mean:m.mean??null,sdSample:m.sdSample??null}:{key,state:'suppressed'}})}
}
type Bindings={waves:WaveRef[];selection:EducationGroupSelection;specId:string}
export async function generateSchoolPlanGroup(input:Scope&{planId:string;sourceKey:string;throughWaveId:string;specId:string;selection?:EducationGroupSelection}){
 const state=await resolvePlan(input)
 if(!state||state.plan.id!==input.planId)return unavailable('只能使用此校园任务的已发布追踪计划')
 const {plan,metrics}=groupTrackingMetrics(state.plan,input.sourceKey),end=state.waves.find(w=>w.id===input.throughWaveId)
 if(!end)return unavailable('选择波次不属于此计划')
 const waves=state.waves.filter(w=>w.ordinal<=end.ordinal)
 if(waves.length<2)return unavailable('至少需要两个已发布波次')
 const spec=await getPublishedReportingSpec(input.specId)
 if(spec.definition.analysisKind!=='GROUP')return unavailable('沿用已有的获准单轮GROUP方案')
 assertReviewedCampusGroupSpec(spec.definition)
 const selectedWaves=waves.map(wave=>({wave,...schoolPlanLeafBinding(educationTrackingSchema.parse(wave.tracking),metrics)}))
 const before=await readSchoolPlanCompletedHeaders(input.organizationId,selectedWaves),leaves=await resolveLeaves(input,metrics,waves,before)
 const groupMetrics=metrics.filter(metric=>leaves.some(source=>source.allowedMetricIds.includes(metric.id)))
 if(!groupMetrics.length)return unavailable('所选追踪工具暂无获准的群体数值')
 const metricKeys=Object.fromEntries(groupMetrics.map(m=>{
  const rules=spec.definition.analysisKind==='GROUP'?spec.definition.metricRules.filter(r=>r.sourceMetricKey===m.scoreKey):[]
  if(rules.length!==1)return unavailable('原群体方案未唯一覆盖此追踪分数')
  return [m.id,rules[0].metricId]
 }))
 const bindings:Bindings={waves:[],selection:input.selection??{kind:'ALL'},specId:input.specId},prepared:GroupLongitudinalWave[]=[]
 for(const source of leaves){
  if(!source.leaf){
   const projection:TaskGroupProjection={schemaVersion:1,descriptionVersion:'group-descriptive-v1',title:'学校群体报告',sourceLabel:source.wave.name,populationLabel:'本波次暂无完成结果',cutoff:new Date().toISOString(),completedN:null,assignedN:null,countUnit:'PERSON',tool:{key:input.sourceKey,title:metrics[0].label,kind:metrics[0].kind},metrics:[],limitations:['本波次尚无完成结果，数值及人数保持空值。']}
   prepared.push({id:source.wave.id,ordinal:source.wave.ordinal,label:source.wave.name,projection,metricKeys,observedFrom:null,observedUntil:null,populationKeys:null})
   bindings.waves.push({runId:source.wave.id,trackId:source.trackId,missing:true})
   continue
  }
  // Existing School code owns release lock, frozen subgroup, 24-hour delay,
  // GROUP source permission and small-difference checks. No nested lock here.
  const safe=await generateCampusGroupReport({...input,runId:source.wave.id,trackId:source.trackId,leaf:source.leaf,selection:bindings.selection})
  const stored=await readReportingArtifactRecord(safe.artifactId)
  if(stored.analysisKind!=='GROUP'||stored.artifactPayload.schemaVersion!==2||stored.artifactPayload.source.runId!==source.wave.id||stored.artifactPayload.source.trackId!==source.trackId||canonicalHash(stored.artifactPayload.source.leaf)!==canonicalHash(source.leaf))return unavailable('校园单轮群报来源不一致')
  const actual=stored.artifactPayload.inputManifest.map(m=>{
   const h=before.find(h=>h.executionId===m.executionId&&h.runId===source.wave.id&&h.trackId===source.trackId&&h.subjectId===m.subjectUserId)
   if(!h)return unavailable('校园群报完成来源在生成时变化')
   return h
  })
  const observed=actual.map(h=>h.completedAt.toISOString()).sort()
  if(!('projection'in safe))return unavailable('此单轮群报没有获准的叶数值投影')
  const base=safe.projection as TaskGroupProjection
  const withheld=(m:TrackedMetric)=>({key:metricKeys[m.id],label:m.label,type:'NUMBER' as const,unit:m.unit,range:null,measurement:null,state:'suppressed' as const,validN:null,missingN:null,mean:null,sdSample:null,observedRange:null,frequencies:[],qualityCounts:{}})
  const projection:TaskGroupProjection={...base,metrics:groupMetrics.map(m=>source.allowedMetricIds.includes(m.id)?base.metrics.find(value=>value.key===metricKeys[m.id])??withheld(m):withheld(m))}
  prepared.push({id:source.wave.id,ordinal:source.wave.ordinal,label:source.wave.name,projection,metricKeys,observedFrom:observed[0]??null,observedUntil:observed.at(-1)??null,
   populationKeys:actual.map(h=>h.subjectId),protocols:Object.fromEntries(groupMetrics.map(m=>[m.id,source.protocol]))})
  bindings.waves.push({runId:source.wave.id,trackId:source.trackId,artifactId:stored.id,snapshotHash:stored.snapshotHash,projectionHash:canonicalHash(schoolGroupNumericView(base,Object.values(metricKeys))),metricKeys:Object.values(metricKeys),leaf:source.leaf})
 }
 const headerHash=(rows:Header[])=>canonicalHash(rows.map(({completedAt,...h})=>({...h,completedAt:completedAt.toISOString()})))
 if(headerHash(before)!==headerHash(await readSchoolPlanCompletedHeaders(input.organizationId,leaves)))return unavailable('校园完成结果在生成期间变化，请刷新后重试')
 const projection={...projectGroupLongitudinal({plan,metrics:groupMetrics,waves:prepared}),wavePopulationLabels:Object.fromEntries(prepared.map(w=>[w.id,w.projection.populationLabel]))}
 await requireCampusGroupManager(input.actor,input.organizationId)
 const saved=await prisma.$transaction(tx=>saveTaskGroupLongitudinalArtifact(tx,{source:state.source,selector:{planId:plan.id,sourceKey:input.sourceKey},sourceBindings:bindings,projection,generatedBy:input.actor.userId}))
 await requireCampusGroupManager(input.actor,input.organizationId)
 return saved
}
export async function readSchoolPlanGroup(input:Scope&{artifactId:string}){
 const state=await resolvePlan(input)
 if(!state)return unavailable('校园追踪计划不存在',404)
 const saved=await prisma.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,state.source,state.plan.id,input.artifactId))
 if(!saved)return unavailable('校园纵向群报不存在',404)
 const bindings=saved.sourceBindings as Bindings
 if(!bindings.waves.length||bindings.waves.some(ref=>!state.waves.some(w=>w.id===ref.runId)))return unavailable('校园群报快照不属于此计划')
 for(const ref of bindings.waves){
  if(ref.missing===true)continue
  const current=await readCampusGroupReport({actor:input.actor,organizationId:input.organizationId,artifactId:ref.artifactId})
  const stored=await readReportingArtifactRecord(ref.artifactId)
  if(!('projection'in current)||stored.organizationId!==input.organizationId||stored.snapshotHash!==ref.snapshotHash||canonicalHash(schoolGroupNumericView(current.projection as TaskGroupProjection,ref.metricKeys))!==ref.projectionHash)return unavailable('原校园群报的披露范围或快照已变化')
 }
 await requireCampusGroupManager(input.actor,input.organizationId)
 return {artifactId:saved.artifactId,generatedAt:saved.generatedAt,projection:saved.projection}
}
