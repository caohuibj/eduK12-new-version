import type {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizedProject} from './builder.service'
import {SurveyAnalyticsError} from './analytics.errors'
import {personalTrackingPlanSchema} from '../reporting/personal-tracking'
import {groupTrackingMetrics,projectGroupLongitudinal,type GroupLongitudinalWave} from '../reporting/group-longitudinal'
import {prepareSurveyGroupReport,assertSurveyGroupBindingsCurrent,type SurveyGroupBindings} from './group-report.service'
import {listTaskGroupLongitudinalArtifacts,saveTaskGroupLongitudinalArtifact,readTaskGroupLongitudinalArtifact} from '../reporting/task-artifact'

type Scope={actorUserId:string;projectId:string;waveId:string}
const fail=(message:string,status=409):never=>{throw new SurveyAnalyticsError(status,message)}
async function resolvePlan(db:Prisma.TransactionClient,input:Scope){
 await authorizedProject(db,input.actorUserId,input.projectId,false)
 const project=await db.surveyProject.findUnique({where:{id:input.projectId},select:{longitudinalPlan:true,collectionMode:true}})
 const anchor=await db.surveyWave.findFirst({where:{id:input.waveId,projectId:input.projectId,publicationId:{not:null},status:{not:'DRAFT'}},select:{id:true}})
 if(!anchor||!project)fail('已发布的研究波次不存在',404)
 if(!project!.longitudinalPlan)return null
 if(project!.collectionMode!=='LINKED_WAVES')fail('此来源不是已配置的纵向研究')
 const plan=personalTrackingPlanSchema.parse(project!.longitudinalPlan)
 const waves=await db.surveyWave.findMany({where:{projectId:input.projectId,publicationId:{not:null},status:{not:'DRAFT'}},orderBy:{ordinal:'asc'},take:101,select:{id:true,ordinal:true,title:true}})
 if(waves.length>100||waves[0]?.id!==plan.baselineWaveId)fail('纵向计划波次无效或超过当前范围')
 return {plan,waves,source:{product:'SURVEY' as const,containerId:input.projectId,taskId:plan.baselineWaveId}}
}
export async function surveyGroupLongitudinalCatalog(input:Scope){
 return prisma.$transaction(async db=>{
  const state=await resolvePlan(db,input)
  if(!state)return {status:'NOT_CONFIGURED' as const,tools:[],waves:[],artifacts:[]}
  const tools=[...new Map(state.plan.metrics.map(m=>[m.sourceKey,{key:m.sourceKey,label:m.label,kind:m.kind}])).values()]
  return {status:'CONFIGURED' as const,planId:state.plan.id,tools,waves:state.waves,
   artifacts:await listTaskGroupLongitudinalArtifacts(db,state.source,state.plan.id)}
 })
}
type Bindings={waves:Array<{waveId:string;bindings:SurveyGroupBindings}>}
export async function generateSurveyGroupLongitudinal(input:Scope&{planId:string;sourceKey:string;throughWaveId:string}){
 const state=await prisma.$transaction(db=>resolvePlan(db,input))
 if(!state||state.plan.id!==input.planId)fail('只能生成已正式发布的纵向计划报告')
 const {plan,metrics}=groupTrackingMetrics(state!.plan,input.sourceKey),end=state!.waves.find(w=>w.id===input.throughWaveId)
 if(!end)fail('选择的波次不在当前计划中')
 const waves=state!.waves.filter(w=>w.ordinal<=end!.ordinal)
 if(waves.length<2)fail('至少需要两个已发布波次')
 // Latest whole completed parent is chosen before sample-quality filtering.
 // The source reader keeps its existing current inclusion/withdrawal rules.
 const sourceCutoff=new Date()
 const headers=await prisma.surveyWaveFinal.findMany({where:{projectId:input.projectId,waveId:{in:waves.map(w=>w.id)},completedAt:{lte:sourceCutoff},attempt:{status:'COMPLETED'}},
  orderBy:[{completedAt:'desc'},{id:'desc'}],take:6001,select:{id:true,waveId:true,completedAt:true,attemptId:true,attempt:{select:{participantId:true}}}})
 if(headers.length>6000)fail('报告来源超过现有6000份分析范围，请缩小波次范围',413)
 const latest=new Map<string,typeof headers[number]>()
 for(const h of headers){const key=h.waveId+':'+(h.attempt.participantId??'response:'+h.attemptId);if(!latest.has(key))latest.set(key,h)}
 const retained=new Set([...latest.values()].map(h=>h.attemptId)),prepared:GroupLongitudinalWave[]=[],bindings:Bindings={waves:[]}
 for(const wave of waves){
  const group=await prepareSurveyGroupReport({...input,waveId:wave.id,instrumentKey:input.sourceKey,retainedParentIds:retained,trackedMetricIds:metrics.map(m=>m.id),sourceCutoff})
  if(group.tracking?.planId!==plan.id)fail('波次没有继承此冻结计划')
  const keys:Record<string,string>={},protocols:Record<string,string|null>={}
  for(const metric of metrics){
   const bound=group.tracking!.metrics.find(b=>b.metricId===metric.id)
   if(!bound||bound.instrumentKey!==group.selector.instrumentKey||bound.measurementHash!==metric.measurementHash||bound.unit!==metric.unit||bound.scoreKey!==metric.scoreKey)fail('波次测量定义与冻结追踪项不一致')
   keys[metric.id]=bound!.scoreKey
   const measurement=group.definitions.find(d=>d.key===bound!.scoreKey)?.measurement as {provenance?:{protocolSignature?:string;configHash?:string}}|undefined
   protocols[metric.id]=measurement?.provenance?.protocolSignature??measurement?.provenance?.configHash??null
  }
  const included=new Set(group.sourceBindings.parents.map(p=>p.finalId)),population=headers.filter(h=>included.has(h.id))
  const times=population.map(h=>h.completedAt.toISOString()).sort()
  prepared.push({id:wave.id,ordinal:wave.ordinal,label:wave.title,projection:group.projection,metricKeys:keys,protocols,
   populationKeys:population.every(h=>h.attempt.participantId!==null)?population.map(h=>h.attempt.participantId!):null,
   observedFrom:times[0]??null,observedUntil:times.at(-1)??null})
  bindings.waves.push({waveId:wave.id,bindings:group.sourceBindings})
 }
 const projection=projectGroupLongitudinal({plan,metrics,waves:prepared})
 return prisma.$transaction(async db=>{
  const current=await resolvePlan(db,input)
  if(current?.plan.id!==plan.id)fail('追踪计划不可访问',404)
  await assertSurveyGroupBindingsCurrent(db,input.projectId,bindings.waves)
  return saveTaskGroupLongitudinalArtifact(db,{source:state!.source,selector:{planId:plan.id,sourceKey:input.sourceKey},sourceBindings:bindings,projection,generatedBy:input.actorUserId})
 })
}
export async function readSurveyGroupLongitudinal(input:Scope&{artifactId:string}){
 return prisma.$transaction(async db=>{
  const state=await resolvePlan(db,input)
  if(!state)fail('纵向计划不存在',404)
  const artifact=await readTaskGroupLongitudinalArtifact(db,state!.source,state!.plan.id,input.artifactId)
  if(!artifact)fail('纵向群体报告不存在',404)
  const bindings=artifact!.sourceBindings as Bindings
  if(!bindings.waves.length||bindings.waves.some(w=>!state!.waves.some(p=>p.id===w.waveId)))fail('快照波次不在此计划中',404)
  await assertSurveyGroupBindingsCurrent(db,input.projectId,bindings.waves)
  return {artifactId:artifact!.artifactId,generatedAt:artifact!.generatedAt,projection:artifact!.projection}
 })
}
