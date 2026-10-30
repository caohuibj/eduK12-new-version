import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import type {PersonalLeafResult,PersonalTrackingPlan} from '../reporting/personal-tracking'
import {getContentRelease} from '../measurement-content/repository'
import {trainingContentAttemptBindingSchema} from './training-content-binding'
import {decodeTrainingFinalReceipt} from './training-content-final'
import {loadTrainingMetricDisclosure} from './training-metric-disclosure'
import {evaluateTrainingFeedbackForAttempt} from './training-feedback-binding'
import {readTrainingTracking,trainingNumericFormIdentity,trainingTrackingMeasurementIdentity} from './personal-tracking'
import {compositeForbidden} from './composite.errors'
import {readInstance} from '../bundle-product/instance'
import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
function fail():never{throw compositeForbidden('本人变化来源不可访问')}

/** Internal adapter for already authorized SELF parents. Numeric facts are
 * projected by exact leaf location; no flat total-name scan, rescoring, latest
 * norm lookup, or one query per selected metric. Group consumers may reuse the
 * typed results without acquiring participant disclosure from them. */
export async function readTrainingPersonalLeafs(db:Prisma.TransactionClient,input:{
 scopedSubjectId:string;plan:PersonalTrackingPlan;parents:any[]
}):Promise<PersonalLeafResult[]>{
 const selected=input.parents.map(parent=>{
  const tracking=readTrainingTracking(parent.compositeAssessment.personalTracking)
  const binding=parent.trainingContentBinding==null?null:trainingContentAttemptBindingSchema.parse(parent.trainingContentBinding)
  const receipt=decodeTrainingFinalReceipt(parent)
  if(!tracking||binding&&(!receipt||binding.attemptId!==parent.id||binding.epoch!==parent.attemptEpoch
   ||canonicalHash(binding)!==parent.trainingContentBindingHash||receipt.aggregateInputHash!==parent.aggregateInputHash))fail()
  const numeric=tracking.bindings.filter(b=>input.plan.metrics.some(m=>m.id===b.metricId&&m.kind==='FORM'))
  const items=[...new Set(tracking.bindings.filter(b=>!numeric.includes(b)).map(b=>b.itemId))].map(itemId=>{
   const unit=binding?.units.find(u=>u.itemId===itemId)
   if(!unit)fail()
   return {unit:unit!,slotKey:compositeItemSlotKey(itemId,unit!.family==='SJT'?'SITUATIONAL':unit!.family)}
  })
  return {parent,tracking,receipt,items,numeric}
 })
 const rows=selected.length?await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:{in:selected.map(s=>s.parent.id)},
  slotKey:{in:[...new Set(selected.flatMap(s=>s.items.map(i=>i.slotKey)))]}},
  select:{compositeAttemptId:true,attemptEpoch:true,slotKey:true,unitType:true,terminalState:true,payloadKind:true,
   canonicalResultEncrypted:true,sourceType:true,sourceAttemptId:true,sourceSubmissionId:true}}):[]
 const complete=rows.filter(row=>row.terminalState==='COMPLETED'&&row.payloadKind==='UNIT_RESULT'&&row.canonicalResultEncrypted)
 const envelopes=await loadStoredCanonicalUnitResults(complete.map(r=>r.canonicalResultEncrypted!),db)
 const facts=new Map(complete.map((row,i)=>[row.compositeAttemptId+':'+row.attemptEpoch+':'+row.slotKey,{row,envelope:envelopes[i]}]))
 const formIds=selected.flatMap(s=>s.numeric.map(b=>b.itemId))
 const formAnswers=formIds.length?await db.compositeFormAnswer.findMany({where:{attemptId:{in:input.parents.map(p=>p.id)},itemId:{in:formIds}},include:{item:true,formSectionAttempt:true}}):[]
 const result:PersonalLeafResult[]=[],releases=new Map<string,Awaited<ReturnType<typeof getContentRelease>>>()
 const bundleIds=input.parents.filter(p=>['ASSESSMENT_BUNDLE','ORGANIZATION_RESOURCE'].includes(p.compositeAssessment.productKind)).map(p=>p.compositeAssessmentId)
 const bundleRows=bundleIds.length?await db.bundleInstance.findMany({where:{compositeId:{in:bundleIds}}}):[]
 const bundles=new Map(bundleRows.map(row=>[row.compositeId,readInstance(row)]))
 for(const {parent,tracking,receipt,items,numeric} of selected){
  const metrics:PersonalLeafResult['metrics']={}
  const pending=!evaluateTrainingFeedbackForAttempt(parent,{reportReady:true}).allowed
  const ownForms=formAnswers.filter(answer=>answer.attemptId===parent.id)
  for(const chosen of numeric){
   const metric=input.plan.metrics.find(m=>m.id===chosen.metricId)!,answer=ownForms.find(a=>a.itemId===chosen.itemId)
   const definition=answer?trainingNumericFormIdentity(answer.item,tracking.formKeys):null
   const valid=answer?.completed&&answer.formSectionAttempt?.status==='COMPLETED'&&answer.formSectionAttempt.attemptEpoch===parent.attemptEpoch
     &&answer.formSectionAttempt.submissionPayloadHash&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(answer.value)
   const value=valid?Number(answer!.value):null
   metrics[chosen.metricId]={value:value!==null&&Number.isFinite(value)?value:null,unit:'raw',
    measurementHash:definition?.measurementHash??metric.measurementHash,visible:chosen.visible,pending,
    ...(!answer?{missingReason:'NOT_EXECUTED' as const}:{})}
  }
  for(const {unit,slotKey} of items){
   let release=releases.get(unit.measurement.releaseId)
   if(!release){release=await getContentRelease(db,unit.measurement.releaseId,true);releases.set(unit.measurement.releaseId,release)}
   if(!release||release.layer!=='MEASUREMENT'||release.status==='REVOKED'||release.contentHash!==unit.measurement.contentHash
    ||release.content.measurementHash!==unit.measurement.measurementHash)fail()
   const saved=facts.get(parent.id+':'+parent.attemptEpoch+':'+slotKey)
   const chosen=tracking.bindings.filter(b=>b.itemId===unit.itemId)
   if(!saved){
    if(receipt!.sources.some(s=>s.itemId===unit.itemId))fail()
    // A conditional/weighted branch is a missing observation, not a zero.
    for(const choice of chosen){const metric=input.plan.metrics.find(m=>m.id===choice.metricId);if(!metric)fail()
     metrics[choice.metricId]={value:null,measurementHash:metric!.measurementHash,unit:metric!.unit,visible:choice.visible,pending,missingReason:'NOT_EXECUTED'}}
    continue
   }
   const {row,envelope}=saved,core=envelope.core
   if(envelope.resultHash!==receipt!.sources.find(s=>s.itemId===unit.itemId)?.resultHash||row.unitType!==core.unitType
    ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
    ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))fail()
   const disclosure=await loadTrainingMetricDisclosure(db,{parent,unit,source:row,audience:'participant',core})
   let bundleVisible=true
   if((parent.compositeAssessment.productKind==='ASSESSMENT_BUNDLE'||bundles.has(parent.compositeAssessmentId))&&unit.family==='SCALE'){
    const ceiling=bundles.get(parent.compositeAssessmentId)?.bindings.slots.find(slot=>slot.itemId===unit.itemId)?.scaleDisclosure
    bundleVisible=!!ceiling&&ceiling.disposition!=='UNKNOWN'&&resolveAudienceDisclosure(ceiling.disclosure,'subject').numericScores
   }
   for(const choice of chosen){
    const metric=input.plan.metrics.find(m=>m.id===choice.metricId)
    const definition=release.content.metrics.find(m=>m.metricKey===choice.scoreKey)
    if(!metric||!definition)fail()
    const fact=core.metrics.find(m=>m.key===choice.scoreKey)
    const valid=core.quality.status==='interpretable'&&(!fact?.quality||['calculated','OK','interpretable'].includes(fact.quality))
    const identity=trainingTrackingMeasurementIdentity(unit,{cognitiveAssignment:{profile:core.scientificProvenance.profileKey??null}})
    metrics[choice.metricId]={value:valid&&typeof fact?.value==='number'&&Number.isFinite(fact.value)?fact.value:null,
     measurementHash:identity,unit:definition!.unit,visible:choice.visible&&bundleVisible&&disclosure.metricKeys.has(choice.scoreKey),pending}
   }
  }
  result.push({scopedSubjectId:input.scopedSubjectId,waveId:parent.compositeAssessmentId,ordinal:parent.compositeAssessment.personalTrackingOrdinal,
   attemptId:parent.id,resultId:parent.id+':'+parent.attemptEpoch,completedAt:parent.completedAt.toISOString(),
   sourceHash:canonicalHash({aggregate:parent.aggregateInputHash,forms:ownForms.map(a=>({id:a.id,value:a.value,epoch:a.formSectionAttempt?.attemptEpoch??null,payload:a.formSectionAttempt?.submissionPayloadHash??null}))}),metrics})
 }
 return result
}
