import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {trainingTrackingMeasurementIdentity} from '../composite/personal-tracking'
import {educationTrackingSchema,type EducationTracking} from '../reporting/education-personal-tracking'
import {groupTrackingMetrics,projectGroupLongitudinal,type GroupLongitudinalWave} from '../reporting/group-longitudinal'
import type {TrackedMetric} from '../reporting/personal-tracking'
import {listAuthoritativeRunLeafSources} from '../reporting/resultSource'
import {readReportingArtifactRecord} from '../reporting/artifact'
import {getPublishedReportingSpec} from '../reporting/spec'
import {listTaskGroupLongitudinalArtifactsPage,readTaskGroupLongitudinalArtifact,saveTaskGroupLongitudinalArtifact,type TaskArtifactCursor} from '../reporting/task-artifact'
import {reportingFail,type ReportingLeafSourceV2} from '../reporting/types'
import type {TaskGroupProjection} from '../reporting/group-summary'
import type {EducationGroupSelection} from '../reporting/education-group-selection'
import {assertTeacherGroupAuthority} from './groupReportAuthority'
import {generateTeacherNumericGroup,readTeacherNumericGroup,type TeacherNumericScope} from './numericGroupReport.service'

type Wave={id:string;eventId:string;ordinal:number;name:string;tracking:unknown}
const unavailable=(message='教师纵向群体来源不可访问',status=409):never=>reportingFail('TEACHER_PLAN_GROUP_UNAVAILABLE',message,status)

/** The published event/Run links, never matching event names, define a series. */
async function resolvePlan(input:TeacherNumericScope){
 await assertTeacherGroupAuthority(input)
 const [anchor]=await prisma.$queryRaw<Array<{runId:string;baselineId:string|null;tracking:unknown}>>`
  SELECT r.id AS "runId",r.personal_tracking_baseline_id AS "baselineId",r.personal_tracking AS tracking
  FROM huiteacher_evaluation_run_links l JOIN assessment_runs r ON r.id=l.run_id AND r.organization_id=l.organization_id
  WHERE l.organization_id=${input.organizationId} AND l.event_id=${input.eventId} AND r.status IN ('PUBLISHED','CLOSED')`
 if(!anchor)return unavailable('已发布教师任务不存在',404)
 if(!anchor.baselineId)return null
 if(educationTrackingSchema.parse(anchor.tracking).entry!=='TEACHER')return unavailable()
 const waves=await prisma.$queryRaw<Wave[]>`SELECT r.id,l.event_id AS "eventId",r.personal_tracking_ordinal AS ordinal,r.name,r.personal_tracking AS tracking
  FROM assessment_runs r JOIN huiteacher_evaluation_run_links l ON l.run_id=r.id AND l.organization_id=r.organization_id
  WHERE r.organization_id=${input.organizationId} AND r.personal_tracking_baseline_id=${anchor.baselineId}
   AND r.status IN ('PUBLISHED','CLOSED') AND r.personal_tracking->>'entry'='TEACHER'
  ORDER BY r.personal_tracking_ordinal,r.id LIMIT 101`
 if(!waves.length||waves.length>100||waves[0].id!==anchor.baselineId||waves[0].ordinal!==1)return unavailable('教师追踪计划波次不完整')
 const plan=educationTrackingSchema.parse(waves[0].tracking).plan
 if(!plan||plan.baselineWaveId!==anchor.baselineId||waves.some(w=>educationTrackingSchema.parse(w.tracking).plan?.id!==plan.id))return unavailable('教师追踪计划不一致')
 return {plan,waves,source:{product:'TEACHER' as const,containerId:input.organizationId,taskId:anchor.baselineId}}
}

export async function teacherGroupLongitudinalCatalog(input:TeacherNumericScope&{before?:TaskArtifactCursor}){
 const state=await resolvePlan(input)
 if(!state)return {status:'NOT_CONFIGURED' as const,tools:[],waves:[],artifacts:[]}
 const page=await prisma.$transaction(tx=>listTaskGroupLongitudinalArtifactsPage(tx,state.source,state.plan.id,input.before))
 return {status:'CONFIGURED' as const,planId:state.plan.id,
  tools:[...new Map(state.plan.metrics.map(m=>[m.sourceKey,{key:m.sourceKey,label:m.label,kind:m.kind}])).values()],
  waves:state.waves.map(({tracking:_tracking,...w})=>({...w,title:w.name})),...page}
}

/** Binding is a concrete current leaf, not a parent-wide union of score names. */
export function teacherPlanLeafBinding(tracking:EducationTracking,metrics:TrackedMetric[]){
 const selected=metrics.map(metric=>({metric,binding:tracking.bindings.find(b=>b.metricId===metric.id)}))
 if(!selected.length||selected.some(s=>!s.binding||s.binding.scoreKey!==s.metric.scoreKey)
  ||new Set(selected.map(s=>s.binding!.trackId+':'+s.binding!.itemId)).size!==1)return unavailable('追踪项没有唯一当轮子工具位置')
 const kind=metrics[0].kind,binding=selected[0].binding!
 if(kind==='FORM'||metrics.some(m=>m.kind!==kind))return unavailable('此教师来源没有已接入的数值叶工具')
 return {trackId:binding.trackId,itemId:binding.itemId,slotKey:compositeItemSlotKey(binding.itemId,kind==='SJT'?'SITUATIONAL':kind)}
}

async function resolveLeaves(input:TeacherNumericScope,metrics:TrackedMetric[],waves:Wave[]){
 const selected=waves.map(wave=>({wave,...teacherPlanLeafBinding(educationTrackingSchema.parse(wave.tracking),metrics)}))
 const tracks=await prisma.$queryRaw<Array<{id:string;runId:string;policy:any;hash:string}>>(Prisma.sql`SELECT id,run_id AS "runId",frozen_resource_policy AS policy,resource_policy_hash AS hash
  FROM assessment_run_tracks WHERE organization_id=${input.organizationId} AND id IN (${Prisma.join(selected.map(s=>s.trackId))})`)
 const refs=selected.map(s=>{
  const track=tracks.find(t=>t.id===s.trackId&&t.runId===s.wave.id)
  if(!track||canonicalHash(track.policy)!==track.hash||track.policy.runtimeLaunchTarget?.kind!=='COMPOSITE')return unavailable('教师追踪冻结来源不完整')
  return {selected:s,compositeId:track.policy.runtimeLaunchTarget.ref as string}
 })
 const composites=await prisma.compositeAssessment.findMany({where:{id:{in:[...new Set(refs.map(r=>r.compositeId))]}},include:{items:{include:{cognitiveAssignment:true}}}})
 const result=[]
 for(const {selected:s,compositeId} of refs){
  const composite=composites.find(c=>c.id===compositeId),snapshot=trainingContentSnapshotSchema.safeParse(composite?.trainingContentSnapshot)
  if(!composite||!snapshot.success||snapshot.data.compositeId!==composite.id||canonicalHash(snapshot.data)!==composite.trainingContentSnapshotHash)return unavailable('教师冻结测量来源不完整')
  const unit=snapshot.data.units.find(u=>u.itemId===s.itemId),item=composite.items.find(i=>i.id===s.itemId)
  if(!unit||unit.family!==metrics[0].kind||!item||metrics.some(m=>trainingTrackingMeasurementIdentity(unit,item)!==m.measurementHash))return unavailable('教师追踪测量定义变化')
  // aggregate metricKeys are the existing GROUP ceiling. longitudinalMetricKeys
  // is participant-summary-only in the shared disclosure schema.
  const tools=await listAuthoritativeRunLeafSources({organizationId:input.organizationId,runId:s.wave.id,trackId:s.trackId,slotKey:s.slotKey,groupAudience:'ORGANIZATION'})
  const candidates=tools.filter(t=>t.leaf.slotKey===s.slotKey&&t.leaf.unitType===(metrics[0].kind==='SJT'?'SITUATIONAL':metrics[0].kind)
   &&metrics.some(m=>t.metrics.some(v=>v.key===m.scoreKey&&v.unit===m.unit)))
  if(candidates.length!==1)return unavailable('追踪叶缺少获准的教师群体数值来源，或存在多个实际配置')
  const tool=candidates[0]
  if(metrics.some(m=>tool.metrics.some(v=>v.key===m.scoreKey&&v.unit!==m.unit)))return unavailable('教师追踪指标单位变化')
  result.push({...s,leaf:tool.leaf,allowedMetricIds:metrics.filter(m=>tool.metrics.some(v=>v.key===m.scoreKey)).map(m=>m.id),protocol:tool.protocolSignature??tool.leaf.compiledRuntimeHash})
 }
 return result
}

type Header={executionId:string;runId:string;trackId:string;subjectId:string;attemptId:string;epoch:number;completedAt:Date;latest:boolean}
/** Source headers carry actual observation time. The existing group manifest
 * omits parent/time, so changing bindings cannot silently relabel an old mean. */
async function completedHeaders(organizationId:string,waves:Array<{wave:Wave;trackId:string}>){
 const rows=await prisma.$queryRaw<Header[]>(Prisma.sql`SELECT e.id AS "executionId",e.run_id AS "runId",e.track_id AS "trackId",subject.user_id AS "subjectId",
  p.id AS "attemptId",p.attempt_epoch AS epoch,p.completed_at AS "completedAt",(latest.id=p.id) AS latest
  FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots subject ON subject.organization_id=e.organization_id AND subject.run_id=e.run_id AND subject.id=e.subject_actor_snapshot_id
  JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND p.assignment_ref=e.relational_assignment_id AND p.user_id=subject.user_id AND p.subject_user_id=subject.user_id AND p.respondent_user_id=subject.user_id AND p.status='COMPLETED' AND p.completed_at IS NOT NULL
  JOIN LATERAL(SELECT chosen.id FROM composite_assessment_attempts chosen WHERE chosen.assignment_ref=e.relational_assignment_id
   AND chosen.user_id=subject.user_id AND chosen.subject_user_id=subject.user_id AND chosen.respondent_user_id=subject.user_id AND chosen.status='COMPLETED' AND chosen.completed_at IS NOT NULL ORDER BY chosen.completed_at DESC,chosen.id DESC LIMIT 1)latest ON TRUE
  WHERE e.organization_id=${organizationId} AND e.status='COMPLETED'
   AND (${Prisma.join(waves.map(w=>Prisma.sql`(e.run_id=${w.wave.id} AND e.track_id=${w.trackId})`),' OR ')}) ORDER BY e.id`)
 if(rows.some(r=>!r.latest))return unavailable('教师当前绑定不是最新正式完成结果')
 return rows
}

type NumericReport=Awaited<ReturnType<typeof readTeacherNumericGroup>>
export function teacherNumericWaveProjection(report:NumericReport):TaskGroupProjection{
 const p=report.projection
 return {schemaVersion:1,descriptionVersion:'group-descriptive-v1',title:p.title,sourceLabel:p.sourceLabel,cutoff:p.cutoff,populationLabel:p.populationLabel,
  completedN:p.completedN,assignedN:p.assignedN,countUnit:p.countUnit,tool:{...p.tool,kind:p.tool.kind==='SITUATIONAL'?'SJT':p.tool.kind},
  metrics:p.metrics.map(m=>({...m,measurement:null})),limitations:p.limitations}
}
export function teacherGroupNumericView(projection:TaskGroupProjection,keys:string[]){
 return {completedN:projection.completedN,countUnit:projection.countUnit,metrics:[...keys].sort().map(key=>{
  const m=projection.metrics.find(m=>m.key===key)
  return m?{key,type:m.type,unit:m.unit??null,state:m.state??'present',validN:m.validN??null,missingN:m.missingN??null,mean:m.mean??null,sdSample:m.sdSample??null}:{key,state:'suppressed'}
 })}
}
type Ref={runId:string;eventId:string;trackId:string;artifactId:string;snapshotHash:string;projectionHash:string;metricKeys:string[];leaf:ReportingLeafSourceV2}
type Bindings={waves:Ref[];selection:EducationGroupSelection;specId:string}

export async function generateTeacherGroupLongitudinal(input:TeacherNumericScope&{planId:string;sourceKey:string;throughWaveId:string;specId:string;selection?:EducationGroupSelection}){
 const state=await resolvePlan(input)
 if(!state||state.plan.id!==input.planId)return unavailable('只能使用此教师任务正式冻结的追踪计划')
 const {plan,metrics}=groupTrackingMetrics(state.plan,input.sourceKey),end=state.waves.find(w=>w.id===input.throughWaveId)
 if(!end)return unavailable('波次不属于此追踪计划')
 const waves=state.waves.filter(w=>w.ordinal<=end.ordinal)
 if(waves.length<2)return unavailable('至少需要两个已发布波次')
 const spec=await getPublishedReportingSpec(input.specId)
 if(spec.definition.analysisKind!=='GROUP')return unavailable('沿用已有的已发布单次GROUP方案')
 const metricKeys=Object.fromEntries(metrics.map(m=>{
  const rules=spec.definition.analysisKind==='GROUP'?spec.definition.metricRules.filter(r=>r.sourceMetricKey===m.scoreKey):[]
  if(rules.length!==1)return unavailable('原群报方案没有唯一覆盖此追踪指标')
  return [m.id,rules[0].metricId]
 }))
 const leaves=await resolveLeaves(input,metrics,waves),before=await completedHeaders(input.organizationId,leaves)
 const bindings:Bindings={waves:[],selection:input.selection??{kind:'ALL'},specId:input.specId},prepared:GroupLongitudinalWave[]=[]
 for(const source of leaves){
  // The single-wave service owns source authority, delay, effective N,
  // differential disclosure and the transaction/lock. No second group engine.
  const safe=await generateTeacherNumericGroup({...input,eventId:source.wave.eventId,trackId:source.trackId,leaf:source.leaf,selection:bindings.selection})
  const stored=await readReportingArtifactRecord(safe.artifactId)
  if(stored.organizationId!==input.organizationId||stored.analysisKind!=='GROUP'||stored.artifactPayload.schemaVersion!==2
   ||stored.artifactPayload.source.runId!==source.wave.id||stored.artifactPayload.source.trackId!==source.trackId
   ||canonicalHash(stored.artifactPayload.source.leaf)!==canonicalHash(source.leaf))return unavailable('教师单轮群报来源不一致')
  const actual=stored.artifactPayload.inputManifest.map(m=>{
   const h=before.find(h=>h.executionId===m.executionId&&h.subjectId===m.subjectUserId&&h.runId===source.wave.id&&h.trackId===source.trackId)
   if(!h)return unavailable('教师群报完成来源在生成时变化')
   return h
  })
  const observed=actual.map(h=>h.completedAt.toISOString()).sort(),base=teacherNumericWaveProjection(safe)
  const withheld=(m:TrackedMetric)=>({key:metricKeys[m.id],label:m.label,type:'NUMBER' as const,unit:m.unit,range:null,measurement:null,state:'suppressed' as const,validN:null,missingN:null,mean:null,sdSample:null,observedRange:null,frequencies:[],qualityCounts:{}})
  const projection={...base,metrics:metrics.map(m=>source.allowedMetricIds.includes(m.id)?base.metrics.find(v=>v.key===metricKeys[m.id])??withheld(m):withheld(m))}
  prepared.push({id:source.wave.id,ordinal:source.wave.ordinal,label:source.wave.name,projection,metricKeys,
   observedFrom:observed[0]??null,observedUntil:observed.at(-1)??null,populationKeys:actual.map(h=>h.subjectId),protocols:Object.fromEntries(metrics.map(m=>[m.id,source.protocol]))})
  bindings.waves.push({runId:source.wave.id,eventId:source.wave.eventId,trackId:source.trackId,artifactId:stored.id,snapshotHash:stored.snapshotHash,
   projectionHash:canonicalHash(teacherGroupNumericView(base,Object.values(metricKeys))),metricKeys:Object.values(metricKeys),leaf:source.leaf})
 }
 const headerHash=(rows:Header[])=>canonicalHash(rows.map(({completedAt,...h})=>({...h,completedAt:completedAt.toISOString()})))
 if(headerHash(before)!==headerHash(await completedHeaders(input.organizationId,leaves)))return unavailable('教师完成结果在生成期间变化，请刷新后重试')
 const projection={...projectGroupLongitudinal({plan,metrics,waves:prepared}),title:'教师群体纵向报告',wavePopulationLabels:Object.fromEntries(prepared.map(w=>[w.id,w.projection.populationLabel]))}
 await assertTeacherGroupAuthority({...input,runIds:waves.map(w=>w.id)})
 return prisma.$transaction(tx=>saveTaskGroupLongitudinalArtifact(tx,{source:state.source,selector:{planId:plan.id,sourceKey:input.sourceKey},sourceBindings:bindings,projection,generatedBy:input.actorUserId}))
}

export async function readTeacherGroupLongitudinal(input:TeacherNumericScope&{artifactId:string}){
 const state=await resolvePlan(input)
 if(!state)return unavailable('教师追踪计划不存在',404)
 const saved=await prisma.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,state.source,state.plan.id,input.artifactId))
 if(!saved)return unavailable('教师纵向群报不存在',404)
 const bindings=saved.sourceBindings as Bindings
 if(!bindings.waves.length||bindings.waves.some(ref=>!state.waves.some(w=>w.id===ref.runId&&w.eventId===ref.eventId)))return unavailable('教师纵向快照不属于此计划')
 for(const ref of bindings.waves){
  const safe=await readTeacherNumericGroup({...input,eventId:ref.eventId,artifactId:ref.artifactId}),stored=await readReportingArtifactRecord(ref.artifactId)
  if(stored.organizationId!==input.organizationId||stored.snapshotHash!==ref.snapshotHash
   ||canonicalHash(teacherGroupNumericView(teacherNumericWaveProjection(safe),ref.metricKeys))!==ref.projectionHash)return unavailable('原教师群报的披露范围或快照已变化')
 }
 return {artifactId:saved.artifactId,generatedAt:saved.generatedAt,projection:saved.projection}
}
