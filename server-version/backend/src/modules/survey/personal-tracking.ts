import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {personalTrackingPlanSchema,type PersonalTrackingPlan,type PersonalLeafResult} from '../reporting/personal-tracking'
import type {ResearchFrozenUnit,ResearchFrozenPublication} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'
import {rawParticipantFeedback} from './participant-feedback'
import {cognitiveParticipantFeedback} from './measurement.result'
import {SurveyWaveError} from './waves.service'
import type {FormDraft} from './builder.definition'

export const surveyTrackingSelectionSchema=z.object({
  mode:z.enum(['SINGLE','LONGITUDINAL']),
  metrics:z.array(z.object({instrumentId:z.string().uuid(),scoreKey:z.string().min(1).max(240),metricId:z.string().uuid().optional()}).strict()).max(128).default([]),
}).strict()
export type SurveyTrackingSelection=z.infer<typeof surveyTrackingSelectionSchema>
export type SurveyTrackingBinding={planId:string;metrics:Array<{metricId:string;draftId:string;instrumentKey:string;scoreKey:string;measurementHash:string;unit:string}>}
const fail=(message:string):never=>{throw new SurveyWaveError(409,message)}

/** FORM exposes actual numeric responses internally; category codes are never
 * promoted to a continuous score. Survey's current General-only Form disclosure
 * still withholds these from personal reports. */
export function surveyFormTrackingIdentity(unit:ResearchFrozenUnit){
  const form=unit.compiledDefinition as FormDraft
  const questions=form.pages.flatMap(p=>p.questions).filter(q=>q.type==='NUMBER'||q.type==='SLIDER')
  return {measurementHash:canonicalHash({kind:'FORM',definition:form}),metrics:questions.map(q=>({key:q.itemKey,label:q.prompt.slice(0,240)||q.itemKey,unit:'raw'}))}
}
export function freezeSurveyTracking(input:{projectId:string;waveId:string;ordinal:number;collectionMode:string;
  existing:unknown;firstPublishedAt:Date|null;selection?:SurveyTrackingSelection;units:ResearchFrozenUnit[]}):{plan:PersonalTrackingPlan;binding:SurveyTrackingBinding}|null{
  const existing=input.existing===null||input.existing===undefined?null:personalTrackingPlanSchema.parse(input.existing)
  if(!existing&&input.selection?.mode!=='LONGITUDINAL')return null
  if(input.collectionMode!=='LINKED_WAVES')fail('个人纵向需要稳定的多波次研究身份，不能将单次匿名自动关联')
  if(!existing&&(input.firstPublishedAt||input.ordinal!==1))fail('个人纵向必须在首次发布 T1 时选择，不自动拼接历史波次')
  if(existing&&input.selection?.mode==='SINGLE')fail('此研究已冻结纵向计划，后续波次不能降为单次')
  const requested=input.selection?.metrics??[]
  if(!existing&&(!requested.length||requested.some(r=>r.metricId)))fail('首次纵向发布须选择追踪指标')
  if(existing&&requested.length&&(requested.length!==existing.metrics.length||requested.some(r=>!existing.metrics.some(m=>m.id===r.metricId))||new Set(requested.map(r=>r.metricId)).size!==existing.metrics.length))fail('后续波次必须继承全部冻结追踪指标')
  const plan:PersonalTrackingPlan=existing??{schemaVersion:1,id:randomUUID(),baselineWaveId:input.waveId,metrics:[]}
  const targets=existing?existing.metrics.map(m=>{
    const explicit=requested.find(r=>r.metricId===m.id)
    const unit=explicit?input.units.find(u=>u.draftId===explicit.instrumentId):input.units.find(u=>u.instrumentKey===m.sourceKey)
    return {unit,scoreKey:explicit?.scoreKey??m.scoreKey,metric:m}
  }):requested.map(r=>({unit:input.units.find(u=>u.draftId===r.instrumentId),scoreKey:r.scoreKey,metric:null}))
  const bindings:SurveyTrackingBinding['metrics']=[]
  for(const target of targets){
    const unit=target.unit
    if(!unit?.trackingIdentity)fail('缺少追踪工具或测量身份，请保留草稿并恢复追踪工具')
    const identity=unit!.trackingIdentity!,descriptor=identity.metrics.find(m=>m.key===target.scoreKey)
    if(!descriptor)fail('追踪指标不存在；选择分量表不能删除评分必需题目')
    const metric=target.metric??{id:randomUUID(),sourceKey:unit!.instrumentKey,scoreKey:target.scoreKey,
      label:(unit!.title+' · '+descriptor!.label).slice(0,240),unit:descriptor!.unit,kind:unit!.kind,measurementHash:identity.measurementHash}
    if(metric.measurementHash!==identity.measurementHash||metric.unit!==descriptor!.unit||metric.kind!==unit!.kind||metric.scoreKey!==target.scoreKey)
      fail('追踪题目、计分、协议或单位已变化，不能发布此续轮')
    if(!existing)plan.metrics.push(metric)
    if(bindings.some(b=>b.instrumentKey===unit!.instrumentKey&&b.scoreKey===target.scoreKey))fail('同一工具指标不可重复追踪')
    bindings.push({metricId:metric.id,draftId:unit!.draftId,instrumentKey:unit!.instrumentKey,scoreKey:target.scoreKey,measurementHash:identity.measurementHash,unit:descriptor!.unit})
  }
  // Plan selection cannot expand the frozen ordinary numeric disclosure.
  for(const unit of input.units){
    const allowed=unit.kind==='COGNITIVE'?(unit.compiledDefinition as {feedback?:{mode:string;metricKeys:string[]}}).feedback:unit.participantFeedback
    unit.longitudinalMetricKeys=allowed?.mode==='DESCRIPTIVE'?bindings.filter(b=>b.draftId===unit.draftId&&allowed.metricKeys.includes(b.scoreKey)).map(b=>b.scoreKey):[]
  }
  return {plan:personalTrackingPlanSchema.parse(plan),binding:{planId:plan.id,metrics:bindings}}
}

/** Caller supplies one verified, complete parent FINAL and its publication.
 * This adapter first locates the bound leaf, then reads that leaf's score key. */
export function surveyPersonalLeaf(input:{scopedSubjectId:string;waveId:string;ordinal:number;attemptId:string;resultId:string;
  completedAt:string;sourceHash:string;snapshot:ResearchFrozenPublication;result:SurveyComputedFinal;collectionClosed:boolean}):PersonalLeafResult{
  const metrics:PersonalLeafResult['metrics']={}
  const publicByUnit=new Map<string,Map<string,number|null>>()
  for(const binding of input.snapshot.longitudinal?.metrics??[]){
    const unit=input.snapshot.units.find(u=>u.draftId===binding.draftId&&u.instrumentKey===binding.instrumentKey)
    const matches=input.result.units.filter(r=>r.instrumentKey===binding.instrumentKey)
    if(!unit||matches.length!==1)fail('纵向叶工具来源缺失或不唯一')
    const result=matches[0]
    if(result.kind!==unit!.kind||result.sourceDigest!==unit!.sourceDigest||result.scoringDigest!==unit!.scoringDigest)fail('纵向结果与冻结工具身份不一致')
    if(!publicByUnit.has(unit!.instrumentKey)){
      const feedback=unit!.kind==='COGNITIVE'?cognitiveParticipantFeedback(unit!,result,input.collectionClosed):rawParticipantFeedback(unit!,result,input.collectionClosed)
      publicByUnit.set(unit!.instrumentKey,new Map(feedback&&!feedback.pending?feedback.metrics.map(m=>[m.key,feedback.quality==='interpretable'?m.value:null]):[]))
    }
    const disclosed=publicByUnit.get(unit!.instrumentKey)!
    const visible=unit!.longitudinalMetricKeys?.includes(binding.scoreKey)===true&&disclosed.has(binding.scoreKey)
    const privateResult=result.privateScoring as {scores?:Array<{key:string;value:number|null;status:string}>;metrics?:Array<{key:string;value:number|null;status:string}>;quality?:{status:string}}|null
    const internal=result.notExecuted?null:unit!.kind==='FORM'?result.rawAnswers[binding.scoreKey]:unit!.kind==='COGNITIVE'?
      result.measurement?.quality.status==='interpretable'?result.measurement.metrics.find(m=>m.key===binding.scoreKey&&m.status==='OK')?.value:null:
      privateResult?.quality?.status==='interpretable'?(privateResult.scores??privateResult.metrics??[]).find(m=>m.key===binding.scoreKey&&m.status==='calculated')?.value:null
    metrics[binding.metricId]={visible,value:visible?disclosed.get(binding.scoreKey)??null:typeof internal==='number'&&Number.isFinite(internal)?internal:null,
      measurementHash:binding.measurementHash,unit:binding.unit}
  }
  return {scopedSubjectId:input.scopedSubjectId,waveId:input.waveId,ordinal:input.ordinal,attemptId:input.attemptId,
    resultId:input.resultId,completedAt:input.completedAt,sourceHash:input.sourceHash,metrics}
}
