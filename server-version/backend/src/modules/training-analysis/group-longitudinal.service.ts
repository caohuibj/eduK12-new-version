import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {compositeBadRequest,compositeNotFound} from '../composite/composite.errors'
import {readTrainingTracking} from '../composite/personal-tracking'
import {groupTrackingMetrics,projectGroupLongitudinal,type GroupLongitudinalWave} from '../reporting/group-longitudinal'
import {listTaskGroupLongitudinalArtifactsPage,type TaskArtifactCursor,saveTaskGroupLongitudinalArtifact,readTaskGroupLongitudinalArtifact} from '../reporting/task-artifact'
import {assertTrainingGroupAccess,assertTrainingGroupTaskHistoryAccess,listTrainingGroupPlanTasks,listTrainingAnalysisSources,type TrainingAnalysisActor} from './source'
import {trainingCognitiveGroupAssignmentId,trainingScaleGroupId} from './group-source'
import {prepareTrainingGroupReport,assertTrainingGroupBindingsCurrent,type TrainingGroupBindings} from './group-report.service'

type Scope={actor:TrainingAnalysisActor;courseId:string;taskId:string}
const missing=():never=>{throw compositeNotFound('纵向群体来源不可访问')}
async function resolvePlan(tx:Prisma.TransactionClient,input:Scope){
 await assertTrainingGroupTaskHistoryAccess(tx,input.actor,input.courseId,input.taskId)
 if(trainingCognitiveGroupAssignmentId(input.taskId)!==null||trainingScaleGroupId(input.taskId)!==null)return null
 const task=await tx.compositeAssessment.findUnique({where:{id:input.taskId},select:{personalTrackingBaselineId:true}})
 if(!task?.personalTrackingBaselineId)return null
 await assertTrainingGroupAccess(tx,input.actor,input.courseId,task.personalTrackingBaselineId)
 const baseline=await tx.compositeAssessment.findUnique({where:{id:task.personalTrackingBaselineId},select:{personalTracking:true,createdBy:true}})
 const plan=readTrainingTracking(baseline?.personalTracking)?.plan
 if(!plan||plan.baselineWaveId!==task.personalTrackingBaselineId)missing()
 const rows=await listTrainingGroupPlanTasks(tx,input.actor,input.courseId,task.personalTrackingBaselineId)
 if(rows.length>100||rows[0]?.id!==plan!.baselineWaveId)missing()
 return {plan:plan!,waves:rows.map(r=>({id:r.id,ordinal:r.personalTrackingOrdinal!,title:r.name,tracking:readTrainingTracking(r.personalTracking)})),
  source:{product:'TRAINING' as const,containerId:input.courseId,taskId:plan!.baselineWaveId}}
}
export async function trainingGroupLongitudinalCatalog(input:Scope&{before?:TaskArtifactCursor}){
 return prisma.$transaction(async tx=>{
  const state=await resolvePlan(tx,input)
  if(!state)return {status:'NOT_CONFIGURED' as const,tools:[],waves:[],artifacts:[]}
  return {status:'CONFIGURED' as const,planId:state.plan.id,
   tools:[...new Map(state.plan.metrics.map(m=>[m.sourceKey,{key:m.sourceKey,label:m.label,kind:m.kind}])).values()],
   waves:state.waves.map(({tracking:_tracking,...wave})=>wave),
   ...await listTaskGroupLongitudinalArtifactsPage(tx,state.source,state.plan.id,input.before)}
 })
}
type Bindings={waves:Array<{taskId:string;bindings:TrainingGroupBindings}>}
export async function generateTrainingGroupLongitudinal(input:Scope&{planId:string;sourceKey:string;throughWaveId:string}){
 const state=await prisma.$transaction(tx=>resolvePlan(tx,input))
 if(!state||state.plan.id!==input.planId)throw compositeBadRequest('只能生成已正式发布的纵向计划报告')
 const {plan,metrics}=groupTrackingMetrics(state.plan,input.sourceKey),end=state.waves.find(w=>w.id===input.throughWaveId)
 if(!end)throw compositeBadRequest('波次不在此课程纵向计划中')
 const waves=state.waves.filter(w=>w.ordinal<=end.ordinal)
 if(waves.length<2)throw compositeBadRequest('至少需要两个已发布波次')
 const prepared:GroupLongitudinalWave[]=[],bindings:Bindings={waves:[]}
 for(const wave of waves){
  const selected=metrics.map(metric=>({metric,binding:wave.tracking?.bindings.find(b=>b.metricId===metric.id)}))
  if(selected.some(s=>!s.binding))throw compositeBadRequest('波次缺少继承的冻结指标')
  const catalog=await prisma.$transaction(tx=>listTrainingAnalysisSources(tx,input.actor,input.courseId,{authorityLock:'SHARE',taskId:wave.id,group:true}))
  const candidates=catalog.tools.filter(tool=>selected.every(({metric,binding})=>tool.source.metrics.some(m=>m.itemId===binding!.itemId&&(metric.kind==='FORM'||m.metricKey===binding!.scoreKey))))
  if(candidates.length!==1)throw compositeBadRequest(candidates.length?'此来源含多个冻结分卷或材料组，需沿原群体来源分层，不能合并':'所选叶工具没有当前课程的群体数值披露权限或可用冻结来源')
  const tool=candidates[0],{taskId,publication,configDigest,variantKey,materialGroupKey}=tool.source
  const group=await prepareTrainingGroupReport({actor:input.actor,courseId:input.courseId,selection:{taskId,toolKey:tool.key,publication,configDigest,variantKey,...(materialGroupKey===undefined?{}:{materialGroupKey})}})
  const keys:Record<string,string>={},protocols:Record<string,string|null>={}
  for(const {metric,binding}of selected){
   const matches=tool.source.metrics.filter(m=>m.itemId===binding!.itemId&&(metric.kind==='FORM'||m.metricKey===binding!.scoreKey))
   if(matches.length!==1)throw compositeBadRequest('追踪指标没有唯一叶位置')
   keys[metric.id]=matches[0].metricKey
   const measurement=group.definitions.find(d=>d.key===matches[0].metricKey)?.measurement as {responseSignature?:string}|null
   protocols[metric.id]=measurement?.responseSignature??null
  }
  prepared.push({id:wave.id,ordinal:wave.ordinal,label:wave.title,projection:group.projection,metricKeys:keys,protocols,populationKeys:group.populationKeys,observedFrom:null,observedUntil:null})
  bindings.waves.push({taskId:wave.id,bindings:group.sourceBindings})
  if(bindings.waves.reduce((n,w)=>n+w.bindings.parents.length,0)>6000)throw compositeBadRequest('纵向来源超过现有6000条分析范围，请缩小波次范围')
 }
 // Completion metadata for the already selected parents only. No second result
 // reader, rescoring or identity matching; source selection stays in source.ts.
 const dates=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:bindings.waves.flatMap(w=>w.bindings.parents.map(p=>p.attemptId))}},select:{id:true,completedAt:true}})
 const times=new Map(dates.map(d=>[d.id,d.completedAt?.toISOString()]))
 for(const [i,wave]of prepared.entries()){
  const observed=bindings.waves[i].bindings.parents.flatMap(p=>times.get(p.attemptId)?[times.get(p.attemptId)!]:[]).sort()
  wave.observedFrom=observed[0]??null;wave.observedUntil=observed.at(-1)??null
 }
 const projection=projectGroupLongitudinal({plan,metrics,waves:prepared})
 return prisma.$transaction(async tx=>{
  const current=await resolvePlan(tx,input)
  if(current?.plan.id!==plan.id)missing()
  for(const wave of bindings.waves)await assertTrainingGroupBindingsCurrent(tx,{...input,taskId:wave.taskId},wave.bindings)
  return saveTaskGroupLongitudinalArtifact(tx,{source:state.source,selector:{planId:plan.id,sourceKey:input.sourceKey},sourceBindings:bindings,projection,generatedBy:input.actor.userId})
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000})
}
export async function readTrainingGroupLongitudinal(input:Scope&{artifactId:string}){
 return prisma.$transaction(async tx=>{
  const state=await resolvePlan(tx,input)
  if(!state)missing()
  const artifact=await readTaskGroupLongitudinalArtifact(tx,state!.source,state!.plan.id,input.artifactId)
  if(!artifact)missing()
  const bindings=artifact!.sourceBindings as Bindings
  if(!bindings.waves.length||bindings.waves.some(w=>!state!.waves.some(p=>p.id===w.taskId)))missing()
  for(const wave of bindings.waves)await assertTrainingGroupBindingsCurrent(tx,{...input,taskId:wave.taskId},wave.bindings)
  return {artifactId:artifact!.artifactId,generatedAt:artifact!.generatedAt,projection:artifact!.projection}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
