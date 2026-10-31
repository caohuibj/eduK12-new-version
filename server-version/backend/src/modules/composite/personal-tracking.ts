import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {personalTrackingPlanSchema,type PersonalTrackingPlan} from '../reporting/personal-tracking'
import {trainingContentSnapshotSchema,type TrainingContentSnapshot} from './training-content-binding'
import {compositeBadRequest} from './composite.errors'
import {createFrozenScaleRuntimeSnapshot} from '../assessment-runtime/runtime-snapshot'
import {resolveProjectionPolicyForAssessment} from '../scale/scale-workflow.service'
import {createScaleProjectionContext} from '../scale/projection/context-factory'
import {resolveEffectiveScaleDisclosure} from '../scale/projection/context'
import {readFrozenReport} from '../cognitive/profile-freeze'
import {trainingCognitiveMetricKeys} from './training-metric-disclosure'
import {hashScaleDefinition} from '../scale/scale-definition'
import {getSituationPackage} from '../situational/situation-package.registry'
import {readInstance} from '../bundle-product/instance'
import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
import {typedCompositeFormQuestion} from '../assessment-runtime/typed-form'
import {remapTrainingFormDefinition} from '../assessment-runtime/form-policy'

const key=z.string().min(1).max(240)
export const trainingTrackingSelectionSchema=z.object({mode:z.enum(['SINGLE','LONGITUDINAL']),
 metrics:z.array(z.object({itemId:key,scoreKey:key}).strict()).max(128).default([])}).strict()
const binding=z.object({metricId:key,itemId:key,scoreKey:key,visible:z.boolean()}).strict()
const storedSchema=z.object({schemaVersion:z.literal(1),bindings:z.array(binding).min(1).max(128),
 plan:personalTrackingPlanSchema.optional(),
 // Only T1 owns source definitions. Later waves refer to T1 and map new slots.
 formKeys:z.record(z.string(),z.string()).optional(),
 sources:z.array(z.object({itemId:key,unit:z.unknown().optional(),form:z.record(z.string(),z.unknown()).optional(),scale:z.record(z.string(),z.unknown()).optional(),
  cognitive:z.record(z.string(),z.unknown()).optional()}).strict()).max(128).optional(),
}).strict()
export type TrainingTracking=ReturnType<typeof storedSchema.parse>
export const readTrainingTracking=(raw:unknown)=>raw==null?null:storedSchema.parse(raw)
export function trainingNumericFormIdentity(item:any,keys:Record<string,string>={}){
 if(item.type!=='FORM'||item.formDefinition==null)return null
 const question=typedCompositeFormQuestion(item)
 if(!['NUMBER','SLIDER'].includes(question.type))return null
 const normalizedKeys=new Map(Object.entries(keys))
 if(!normalizedKeys.has(question.itemKey))normalizedKeys.set(question.itemKey,question.itemKey)
 if(question.displayIf&&!normalizedKeys.has(question.displayIf.itemKey))normalizedKeys.set(question.displayIf.itemKey,question.displayIf.itemKey)
 const normalized=remapTrainingFormDefinition(question,normalizedKeys)
 const {itemKey:_key,...definition}=normalized
 return {measurementHash:canonicalHash({kind:'FORM',definition,policy:item.formPolicy??null,unit:'raw'}),label:question.prompt.slice(0,240)||'数值回答',unit:'raw'}
}
export function trainingTrackingPreviewChoices(items:any[]){
 return items.flatMap(item=>{
  const label=item.scale?.name??item.cognitiveAssignment?.title??item.situationalInstrumentKey??''
  const numeric=trainingNumericFormIdentity(item)
  if(numeric)return [{itemId:item.id,scoreKey:'value',label:numeric.label}]
  const scores=item.type==='SCALE'?item.scale?.definition?.scoring?.scores:item.type==='COGNITIVE'
   ?Object.entries(readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)?.metricDefinitions??{})
    .filter(([,definition])=>['number','integer'].includes(definition.valueType)).map(([key,d])=>({key,label:d.label??key}))
   :item.type==='SITUATIONAL'?getSituationPackage(item.situationalInstrumentKey,item.situationalInstrumentVersion)?.definition.scoring.publishedMetrics:[]
  return (scores??[]).map((score:any)=>({itemId:item.id,scoreKey:score.key,label:label+' · '+(score.label??score.key)}))
 })
}
function fail(message:string):never{throw compositeBadRequest(message)}

/** Trusted publication/start adapter, called after the existing ownership and
 * source rights checks. It changes only frozen measurement fields, retaining
 * current catalog owner/license/status and exact leaf IDs for authorization. */
export async function inheritTrainingTrackingSources(db:Prisma.TransactionClient,row:any){
 const tracking=readTrainingTracking(row.personalTracking)
 if(!tracking||!row.personalTrackingBaselineId)return row
 const baseline=row.personalTrackingBaselineId===row.id?row:await db.compositeAssessment.findUnique({where:{id:row.personalTrackingBaselineId}})
 if(!baseline||baseline.createdBy!==row.createdBy||baseline.personalTrackingOrdinal!==1)fail('追踪基线来源无效')
 const original=readTrainingTracking(baseline.personalTracking)
 if(!original?.plan||!original.sources)fail('追踪基线尚未冻结')
 const sources=original.sources
 const items=row.items.map((item:any)=>{
  const bindings=tracking.bindings.filter(b=>b.itemId===item.id)
  if(!bindings.length)return item
  const sourceIds=new Set(bindings.map(b=>original.bindings.find(old=>old.metricId===b.metricId)?.itemId))
  if(sourceIds.size!==1||sourceIds.has(undefined))fail('追踪工具映射无效')
  const source=sources.find(s=>s.itemId===[...sourceIds][0])
  if(!source)fail('追踪测量来源缺失')
  if(item.type==='FORM'){
   if(!source.form)fail('追踪数值表单来源缺失')
   return item // Existing product copy remaps the immutable embedded question.
  }
  const unit=trainingContentSnapshotSchema.shape.units.element.parse(source.unit)
  if(item.type==='SCALE'){
   if(!item.scale||unit.family!=='SCALE'||item.scale.id!==unit.source.id||item.scale.creatorId!==unit.source.ownerId||!source.scale)fail('追踪量表来源已替换')
   return {...item,scale:{...item.scale,...source.scale}}
  }
  if(item.type==='COGNITIVE'){
   if(unit.family!=='COGNITIVE'||item.cognitiveAssignment?.configId!==unit.source.id||!source.cognitive)fail('追踪认知来源已替换')
   return {...item,cognitiveAssignment:{...item.cognitiveAssignment,...source.cognitive}}
  }
  if(item.type==='SITUATIONAL'&&unit.family==='SJT'&&item.situationalInstrumentKey===unit.source.instrumentKey
   &&item.situationalInstrumentVersion===unit.source.instrumentVersion)return item
  fail('追踪工具来源已替换')
 })
 const inherited=tracking.bindings.flatMap(b=>{
  const previous=original.bindings.find(old=>old.metricId===b.metricId)
  const source=sources.find(s=>s.itemId===previous?.itemId)
  if(!source||!items.some((item:any)=>item.id===b.itemId))fail('请保留全部追踪工具')
  if(source.form)return []
  const unit=trainingContentSnapshotSchema.shape.units.element.parse(source.unit)
  // Cognitive delivery wrappers may have a new ID with the same frozen profile.
  const assignment=items.find((item:any)=>item.id===b.itemId)?.cognitiveAssignment
  return [{...unit,itemId:b.itemId,source:{...unit.source,...(assignment?{assignmentId:assignment.id}:{})}}]
 })
 const unique=[...new Map(inherited.map(unit=>[unit.itemId,unit])).values()]
 return {...row,items,personalTrackingInheritedUnits:unique}
}

export function trainingTrackingMeasurementIdentity(unit:TrainingContentSnapshot['units'][number],item:any){
 return unit.family==='COGNITIVE'?canonicalHash({measurementHash:unit.measurement.measurementHash,
  profile:item.cognitiveAssignment?.profile??null}):unit.measurement.measurementHash
}

/** Freeze once in the existing publication transaction. Later publications
 * verify the inherited C and selected outputs; P/R pointers remain in the
 * ordinary content snapshot and do not enter raw-score comparison identity. */
export async function freezeTrainingTracking(db:Prisma.TransactionClient,row:any,snapshotRaw:unknown,selectionRaw?:unknown){
 const existing=readTrainingTracking(row.personalTracking)
 const selection=selectionRaw===undefined?undefined:trainingTrackingSelectionSchema.parse(selectionRaw)
 if(!existing&&(!selection||selection.mode==='SINGLE'))return {}
 if(!(row.productKind==='QUESTIONNAIRE'&&row.questionnaireType==='COURSE'||row.productKind==='ASSESSMENT_BUNDLE'&&row.courseId))fail('请从对应产品的续轮入口配置追踪')
 const courseIds:string[]=row.productKind==='ASSESSMENT_BUNDLE'?[row.courseId]:(row.questionnaireCourses??[]).map((course:any)=>course.courseId)
 const courses=await db.course.findMany({where:{id:{in:courseIds}},select:{id:true,courseType:true,isLibrary:true}})
 if(!courseIds.length||courses.length!==courseIds.length||courses.some(course=>course.isLibrary||course.courseType!=='TRAINING_COURSE'))fail('个人纵向追踪须绑定 Training 课程')
 const snapshot=snapshotRaw==null?{schemaVersion:1 as const,compositeId:row.id,units:[]}:trainingContentSnapshotSchema.parse(snapshotRaw)
 if(existing){
  if(selection&&selection.mode!=='LONGITUDINAL')fail('后续轮次须继承追踪计划')
  const baseline=await db.compositeAssessment.findUnique({where:{id:row.personalTrackingBaselineId}})
  const plan=readTrainingTracking(baseline?.personalTracking)?.plan
  if(!plan||baseline?.createdBy!==row.createdBy||existing.bindings.length!==plan.metrics.length)fail('追踪计划不可用')
  for(const metric of plan.metrics){
   const bound=existing.bindings.find(b=>b.metricId===metric.id),unit=snapshot.units.find(u=>u.itemId===bound?.itemId)
   const item=row.items.find((i:any)=>i.id===bound?.itemId)
   if(item?.type==='FORM'){
    const numeric=trainingNumericFormIdentity(item,existing.formKeys)
    if(!numeric||numeric.measurementHash!==metric.measurementHash||metric.unit!==numeric.unit||bound?.scoreKey!=='value')fail('追踪数值表单定义已变化')
    continue
   }
   if(!unit||!item||trainingTrackingMeasurementIdentity(unit,item)!==metric.measurementHash)fail('追踪测量定义已变化，请保留继承来源')
   const release=await getContentRelease(db,unit.measurement.releaseId,true)
   if(!release||release.layer!=='MEASUREMENT'||!release.content.metrics.some(m=>m.metricKey===bound?.scoreKey&&m.unit===metric.unit))fail('追踪计分或单位已变化')
  }
  return {}
 }
 if(!selection?.metrics.length||new Set(selection.metrics.map(m=>m.itemId+':'+m.scoreKey)).size!==selection.metrics.length)fail('请选择不重复的追踪指标')
 const metrics:PersonalTrackingPlan['metrics']=[],bindings:TrainingTracking['bindings']=[],sources:NonNullable<TrainingTracking['sources']>=[]
 const bundleRow=row.productKind==='ASSESSMENT_BUNDLE'?await db.bundleInstance.findUnique({where:{compositeId:row.id}}):null
 const bundle=bundleRow?readInstance(bundleRow):null
 if(row.productKind==='ASSESSMENT_BUNDLE'&&!bundle)fail('固定包绑定不可用')
 if(bundle){const definition=bundle.frozen.bundleSnapshot.bundleDefinition
  if(definition.respondentTypes.length!==1||definition.respondentTypes[0]!=='SELF'||definition.slots.some(slot=>slot.respondentType!=='SELF'))fail('本轮个人纵向仅支持本人 SELF 固定包')}
 const releases=new Map<string,Awaited<ReturnType<typeof getContentRelease>>>()
 const formKeys=Object.fromEntries(row.items.filter((item:any)=>item.type==='FORM'&&item.formDefinition?.itemKey).map((item:any)=>[item.formDefinition.itemKey,item.formDefinition.itemKey])) as Record<string,string>
 for(const chosen of selection.metrics){
  const unit=snapshot.units.find(u=>u.itemId===chosen.itemId),item=row.items.find((i:any)=>i.id===chosen.itemId)
  if(item?.type==='FORM'){
   const numeric=trainingNumericFormIdentity(item,formKeys)
   if(!numeric||chosen.scoreKey!=='value')fail('仅 NUMBER/SLIDER 数值回答可追踪，不能将类别编码用作连续分数')
   const id=randomUUID()
   metrics.push({id,sourceKey:item.id,scoreKey:'value',label:numeric.label,unit:numeric.unit,kind:'FORM',measurementHash:numeric.measurementHash})
   bindings.push({metricId:id,itemId:item.id,scoreKey:'value',visible:true})
   sources.push({itemId:item.id,form:{definition:item.formDefinition}})
   continue
  }
  if(!unit||!item)fail('追踪指标须属于一个现有数值子工具')
  if(unit.family==='SCALE'&&!['participant_self_report','SELF'].includes(item.scale?.definition?.respondentType))fail('本轮个人纵向仅追踪有明确自评定义的量表')
  let release=releases.get(unit.measurement.releaseId)
  if(!release){release=await getContentRelease(db,unit.measurement.releaseId,true);releases.set(unit.measurement.releaseId,release)}
  if(!release||release.layer!=='MEASUREMENT'||release.contentHash!==unit.measurement.contentHash)fail('追踪测量来源无效')
  const score=release.content.metrics.find(m=>m.metricKey===chosen.scoreKey)
  if(!score)fail('追踪计分不存在')
  const id=randomUUID()
  const label=item.scale?.definition?.scoring?.scores?.find((s:any)=>s.key===chosen.scoreKey)?.label??chosen.scoreKey
  metrics.push({id,sourceKey:item.id,scoreKey:chosen.scoreKey,label:String(label),unit:score.unit,kind:unit.family,
   measurementHash:trainingTrackingMeasurementIdentity(unit,item)})
  let visible=unit.family==='SJT'
  if(unit.family==='COGNITIVE')visible=trainingCognitiveMetricKeys(readFrozenReport(item.cognitiveAssignment.resolvedReportSnapshotEncrypted)).has(chosen.scoreKey)
  if(unit.family==='SCALE'){
   const runtime=createFrozenScaleRuntimeSnapshot({instrumentKey:item.scale.code,instrumentVersion:item.scale.instrumentVersion,definition:item.scale.definition})
   const policy=resolveProjectionPolicyForAssessment({scale:item.scale},null,runtime)
   visible=!policy.snapshotError&&resolveEffectiveScaleDisclosure(createScaleProjectionContext({instrumentKey:item.scale.code,
    instrumentVersion:item.scale.instrumentVersion,audience:'subject',purpose:'report',frozenPolicy:policy.policy})).numericScores
   if(bundle){const ceiling=bundle.bindings.slots.find(s=>s.itemId===item.id)?.scaleDisclosure
    visible=visible&&!!ceiling&&ceiling.disposition!=='UNKNOWN'&&resolveAudienceDisclosure(ceiling.disclosure,'subject').numericScores}
  }
  bindings.push({metricId:id,itemId:item.id,scoreKey:chosen.scoreKey,visible})
  if(!sources.some(s=>s.itemId===item.id))sources.push({itemId:item.id,unit,
   ...(item.type==='SCALE'?{scale:{definition:item.scale.definition,definitionHash:hashScaleDefinition(item.scale.definition),code:item.scale.code,instrumentVersion:item.scale.instrumentVersion,
    instrumentClass:item.scale.instrumentClass,instruction:item.scale.instruction,measurementReleaseId:unit.measurement.releaseId}}:{}),
   ...(item.type==='COGNITIVE'?{cognitive:{config:item.cognitiveAssignment.config,profile:item.cognitiveAssignment.profile,
    profileDefinitionVersion:item.cognitiveAssignment.profileDefinitionVersion,resolvedConfigHash:item.cognitiveAssignment.resolvedConfigHash,
    resolvedConfigSnapshotEncrypted:item.cognitiveAssignment.resolvedConfigSnapshotEncrypted,resolvedReportSnapshotEncrypted:item.cognitiveAssignment.resolvedReportSnapshotEncrypted}}:{})})
 }
 const plan:PersonalTrackingPlan={schemaVersion:1,id:randomUUID(),baselineWaveId:row.id,metrics}
 return {personalTrackingBaselineId:row.id,personalTrackingOrdinal:1,
  personalTracking:storedSchema.parse({schemaVersion:1,plan,bindings,sources,formKeys}) as unknown as Prisma.InputJsonValue}
}

export function copiedTrainingTracking(source:any,copiedIds:Map<string,string>,copiedKeys:Map<string,string>=new Map()):Prisma.InputJsonValue{
 const tracking=readTrainingTracking(source.personalTracking)
 if(!tracking)fail('来源未配置纵向追踪')
 return {schemaVersion:1,formKeys:Object.fromEntries([...copiedKeys].map(([oldKey,nextKey])=>[nextKey,tracking.formKeys?.[oldKey]??oldKey])),bindings:tracking.bindings.map(b=>{
  const itemId=copiedIds.get(b.itemId);if(!itemId)fail('复制缺少追踪工具')
  return {...b,itemId}
 })}
}
