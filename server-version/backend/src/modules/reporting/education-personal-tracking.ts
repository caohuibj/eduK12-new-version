import {readInstance} from '../bundle-product/instance'
import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
import {trainingTrackingMeasurementIdentity} from '../composite/personal-tracking'
import {readPrivateCompositionRunSources} from '../education-tools/private-tool.composition-source'
import {readPrivateScaleRuntimeResource} from '../education-tools/private-tool.runtime-resources'
import {relationalEntryToRunPolicy} from '../assessment-run/resourceAuthority'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {personalTrackingPlanSchema,type PersonalTrackingPlan} from './personal-tracking'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {reportingFail} from './types'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'

const key=z.string().min(1).max(240)
const selectedMetric=z.object({trackId:key,itemId:key,scoreKey:key}).strict()
export const educationTrackingSelectionSchema=z.object({mode:z.enum(['SINGLE','LONGITUDINAL']),
 metrics:z.array(selectedMetric).max(128).default([]),visibleMetrics:z.array(selectedMetric).max(128).optional()}).strict()
const binding=z.object({metricId:key,trackId:key,itemId:key,scoreKey:key,blockId:key.optional(),visible:z.boolean().optional()}).strict()
export const educationTrackingSchema=z.object({schemaVersion:z.literal(1),entry:z.enum(['SCHOOL','TEACHER']),
 plan:personalTrackingPlanSchema.optional(),bindings:z.array(binding).min(1).max(128),requestId:z.string().uuid().optional()}).strict()
export type EducationTracking=z.infer<typeof educationTrackingSchema>
export type EducationTrackingTrack={id:string;resourcePolicy:RunResourcePolicy}
function fail(message:string):never{return reportingFail('PERSONAL_TRACKING_INVALID',message,409)}

/** Options use the same private source lane as original publication. */
export async function educationTrackingPolicy(db:Prisma.TransactionClient,track:{resourceFamily:string;resourceKey:string;resourceVersion:string;frozenResourcePolicy:unknown},context:{entry:'SCHOOL'|'TEACHER';organizationId:string;actorUserId:string}){
 if(track.frozenResourcePolicy)return track.frozenResourcePolicy as RunResourcePolicy
 if(track.resourceKey.startsWith('education-composition:')){
  const sources=await readPrivateCompositionRunSources(db,{entry:context.entry,organizationId:context.organizationId,principal:{userId:context.actorUserId,accountDomain:'SCHOOL'}},[{family:track.resourceFamily,key:track.resourceKey,version:track.resourceVersion}])
  return sources.get(track.resourceKey)!.policy
 }
 if(track.resourceKey.startsWith('private-scale:')){
  if(track.resourceVersion!=='1.0.0'&&track.resourceVersion!=='2.0.0')fail('私有追踪来源版本不受支持')
  const source=await readPrivateScaleRuntimeResource(db,{key:track.resourceKey,version:track.resourceVersion,purpose:'NEW_USE',context:{entry:context.entry,organizationId:context.organizationId,principal:{userId:context.actorUserId,accountDomain:'SCHOOL'}}})
  return relationalEntryToRunPolicy(source.resourceEntry)
 }
 const {productionRunResourceAuthorityRegistry}=await import('../assessment-run/resourceAuthority')
 return productionRunResourceAuthorityRegistry.resolveExact({family:track.resourceFamily as RunResourcePolicy['family'],key:track.resourceKey,version:track.resourceVersion})
}

/** Measurement planning is independent of disclosure. Each choice carries its
 * current source-owned SELF ceiling; no hidden numeric result becomes visible. */
export async function educationTrackingChoices(db:Prisma.TransactionClient,tracks:EducationTrackingTrack[],entry:'SCHOOL'|'TEACHER'='TEACHER'){
 const role=entry==='SCHOOL'?'STUDENT':'TEACHER'
 const choices:Array<{trackId:string;itemId:string;scoreKey:string;label:string;unit:string;measurementHash:string;visible:boolean;blockId?:string;kind:'SCALE'|'COGNITIVE'|'SJT'}>=[]
 const releases=new Map<string,Awaited<ReturnType<typeof getContentRelease>>>()
 for(const track of tracks){
  const policy=track.resourcePolicy
  if(policy.relationshipKinds.length!==1||policy.relationshipKinds[0]!=='SELF'||policy.subjectRoles.length!==1||policy.subjectRoles[0]!==role
   ||policy.respondentRoles.length!==1||policy.respondentRoles[0]!==role||!policy.resultDisclosure||policy.runtimeLaunchTarget?.kind!=='COMPOSITE')continue
  const allowed=validateResultDisclosureContract(policy.resultDisclosure).audiences.RESPONDENT
  const source=await db.compositeAssessment.findUnique({where:{id:policy.runtimeLaunchTarget.ref},include:{bundleInstance:true,items:{include:{scale:true,cognitiveAssignment:true}}}})
  const snapshot=trainingContentSnapshotSchema.safeParse(source?.trainingContentSnapshot)
  if(!source||!snapshot.success||snapshot.data.compositeId!==source.id||canonicalHash(snapshot.data)!==source.trainingContentSnapshotHash)continue
  const bundle=source.bundleInstance?readInstance(source.bundleInstance):null
  for(const unit of snapshot.data.units){
   const ceiling=bundle&&unit.family==='SCALE'?bundle.bindings.slots.find(slot=>slot.itemId===unit.itemId)?.scaleDisclosure:null
   const bundleVisible=!bundle||unit.family!=='SCALE'||!!ceiling&&ceiling.disposition!=='UNKNOWN'&&resolveAudienceDisclosure(ceiling.disclosure,'subject').numericScores
   const block=snapshot.data.educationBinding?.manifest.find(block=>block.itemIds.includes(unit.itemId))
   const rule=policy.educationComposition?policy.educationComposition.unitReports.find(report=>report.blockId===block?.blockId)?.respondent:allowed
   let release=releases.get(unit.measurement.releaseId)
   if(!release){release=await getContentRelease(db,unit.measurement.releaseId,true);releases.set(unit.measurement.releaseId,release)}
   if(!release||release.layer!=='MEASUREMENT'||release.status==='REVOKED'||release.contentHash!==unit.measurement.contentHash)fail('追踪测量来源不可用')
   const item=source.items.find(item=>item.id===unit.itemId)
   if(!item)fail('追踪子工具位置不可用')
   const definition=item?.scale?.definition as {scoring?:{scores?:Array<{key:string;label?:string}>}}|undefined
   for(const metric of release.content.metrics){
    const label=definition?.scoring?.scores?.find(score=>score.key===metric.metricKey)?.label||metric.metricKey
    const title=item?.scale?.name??item?.cognitiveAssignment?.title??item?.situationalInstrumentKey??unit.family
    choices.push({trackId:track.id,itemId:unit.itemId,scoreKey:metric.metricKey,label:snapshot.data.units.length>1?title+' · '+label:label,
     kind:unit.family,visible:bundleVisible&&rule?.mode==='INDIVIDUAL_SUMMARY'&&rule.metricKeys.includes(metric.metricKey)&&rule.longitudinalMetricKeys.includes(metric.metricKey),...(block?{blockId:block.blockId}:{}),unit:metric.unit,measurementHash:trainingTrackingMeasurementIdentity(unit,item)})
   }
  }
 }
 return choices
}

type Choice=Awaited<ReturnType<typeof educationTrackingChoices>>[number]
const selectedKey=(value:{trackId:string;itemId:string;scoreKey:string})=>JSON.stringify([value.trackId,value.itemId,value.scoreKey])
/** Frozen C is checked after locating the inherited block. An explicitly removed
 * standalone track may be replaced only by one unambiguous exact measurement. */
export function inheritEducationTrackingBindings(tracking:EducationTracking,plan:PersonalTrackingPlan,choices:Choice[]){
 if(tracking.bindings.length!==plan.metrics.length)fail('追踪基线不完整')
 const bindings=plan.metrics.map(metric=>{
  const old=tracking.bindings.find(b=>b.metricId===metric.id)
  if(!old)fail('追踪指标绑定缺失')
  const direct=choices.find(c=>selectedKey(c)===selectedKey(old!))
  const candidates=direct?[direct]:choices.filter(c=>c.scoreKey===metric.scoreKey&&c.kind===metric.kind&&c.measurementHash===metric.measurementHash&&c.unit===metric.unit&&(!old!.blockId||c.blockId===old!.blockId))
  if(candidates.length!==1)fail('请保留唯一的继承子工具位置及测量定义')
  const choice=candidates[0]
  if(choice.measurementHash!==metric.measurementHash||choice.unit!==metric.unit||choice.kind!==metric.kind)fail('请保留继承的计分、协议和单位')
  return {...old!,trackId:choice.trackId,itemId:choice.itemId,...(choice.blockId?{blockId:choice.blockId}:{}),visible:old!.visible??choice.visible}
 })
 if(new Set(bindings.map(b=>b.trackId)).size!==1)fail('请在同一投放中保留全部追踪子工具')
 return bindings
}
function freezeVisibleMetrics(bindings:EducationTracking['bindings'],choices:Choice[],selection:z.infer<typeof educationTrackingSelectionSchema>|undefined){
 const requested=selection?.visibleMetrics
 if(requested){
  const keys=requested.map(selectedKey)
  if(new Set(keys).size!==keys.length||keys.some(key=>!bindings.some(b=>selectedKey(b)===key)))fail('本人可见指标必须是计划追踪指标子集')
  for(const item of requested)if(!choices.find(c=>selectedKey(c)===selectedKey(item))?.visible)fail('不能扩大原来源的本人数字披露')
 }
 return bindings.map(bound=>({...bound,visible:requested?requested.some(item=>selectedKey(item)===selectedKey(bound)):bound.visible===true}))
}
export async function educationTrackingOptions(db:Prisma.TransactionClient,run:{baselineId:string|null;ordinal:number|null;tracking:unknown},tracks:EducationTrackingTrack[],entry:'SCHOOL'|'TEACHER',organizationId:string){
 const choices=await educationTrackingChoices(db,tracks,entry)
 if(!run.baselineId)return {...run,tracking:undefined,choices}
 const tracking=educationTrackingSchema.parse(run.tracking)
 const [baseline]=await db.$queryRaw<Array<{tracking:unknown}>>`SELECT personal_tracking AS tracking FROM assessment_runs WHERE id=${run.baselineId} AND organization_id=${organizationId}`
 const plan=educationTrackingSchema.parse(baseline?.tracking).plan
 if(!plan)fail('追踪基线不可用')
 const bindings=inheritEducationTrackingBindings(tracking,plan!,choices)
 return {baselineId:run.baselineId,ordinal:run.ordinal,choices:bindings.map(b=>({...choices.find(c=>selectedKey(c)===selectedKey(b))!,selectedVisible:b.visible===true}))}
}

/** Inside the original Run publication transaction, after current product,
 * source, actor/consent and relationship gates, before PUBLISHED is written. */
export async function freezeEducationTracking(db:Prisma.TransactionClient,input:{organizationId:string;runId:string;tracks:EducationTrackingTrack[];selection?:unknown}){
 const [row]=await db.$queryRaw<Array<{baselineId:string|null;ordinal:number|null;tracking:unknown}>>`
  SELECT personal_tracking_baseline_id AS "baselineId",personal_tracking_ordinal AS ordinal,personal_tracking AS tracking
  FROM assessment_runs WHERE organization_id=${input.organizationId} AND id=${input.runId}`
 if(!row)fail('任务不存在')
 const selected=input.selection===undefined?undefined:educationTrackingSelectionSchema.parse(input.selection)
 if(!row.tracking&&selected?.mode!=='LONGITUDINAL')return
 const links=await db.$queryRaw<Array<{entry:'SCHOOL'|'TEACHER'}>>`SELECT 'TEACHER'::text AS entry FROM huiteacher_evaluation_run_links link
  JOIN huiteacher_evaluation_events event ON event.organization_id=link.organization_id AND event.id=link.event_id
  WHERE link.organization_id=${input.organizationId} AND link.run_id=${input.runId} AND event.status='OPEN'
  UNION ALL SELECT 'SCHOOL'::text AS entry FROM campus_activity_runs link
  JOIN campus_activities activity ON activity.organization_id=link.organization_id AND activity.course_id=link.course_id
  WHERE link.organization_id=${input.organizationId} AND link.run_id=${input.runId} AND activity.status='OPEN'`
 if(links.length!==1)fail('请从已获授权且开放的本人 SELF 活动发布')
 const entry=links[0].entry
 const choices=await educationTrackingChoices(db,input.tracks,entry)
 if(row.tracking){
  if(selected?.mode==='SINGLE')fail('后续轮次不能降为单次')
  const tracking=educationTrackingSchema.parse(row.tracking)
  if(tracking.entry!==entry)fail('追踪计划所属入口不一致')
  const [baseline]=await db.$queryRaw<Array<{tracking:unknown}>>`SELECT personal_tracking AS tracking FROM assessment_runs
   WHERE organization_id=${input.organizationId} AND id=${row.baselineId}`
  const plan=educationTrackingSchema.parse(baseline?.tracking).plan
  if(!plan||tracking.bindings.length!==plan.metrics.length)fail('追踪基线不可用')
  const bindings=freezeVisibleMetrics(inheritEducationTrackingBindings(tracking,plan,choices),choices,selected)
  const updated={...tracking,bindings}
  if(JSON.stringify(updated)!==JSON.stringify(tracking))await db.$executeRaw`UPDATE assessment_runs SET personal_tracking=${JSON.stringify(updated)}::jsonb WHERE organization_id=${input.organizationId} AND id=${input.runId}`

  return
 }
 const requested=selected!.metrics
 if(!requested.length||new Set(requested.map(r=>r.trackId)).size!==1||new Set(requested.map(r=>r.trackId+':'+r.itemId+':'+r.scoreKey)).size!==requested.length)
  fail('请选择同一任务中不重复的子工具指标')
 const metrics:PersonalTrackingPlan['metrics']=[],bindings:EducationTracking['bindings']=[]
 for(const item of requested){
  const choice=choices.find(c=>c.trackId===item.trackId&&c.itemId===item.itemId&&c.scoreKey===item.scoreKey)
  if(!choice)fail('该指标没有本人纵向披露许可')
  const metricId=randomUUID()
  metrics.push({id:metricId,sourceKey:item.trackId+':'+item.itemId,scoreKey:item.scoreKey,label:choice.label,unit:choice.unit,kind:choice.kind,measurementHash:choice.measurementHash})
  bindings.push({...item,metricId,...(choice.blockId?{blockId:choice.blockId}:{}),visible:choice.visible})
 }
 const tracking:EducationTracking={schemaVersion:1,entry,plan:{schemaVersion:1,id:randomUUID(),baselineWaveId:input.runId,metrics},bindings:freezeVisibleMetrics(bindings,choices,selected)}
 await db.$executeRaw`UPDATE assessment_runs SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,
  personal_tracking=${JSON.stringify(tracking)}::jsonb WHERE organization_id=${input.organizationId} AND id=${input.runId}`
}
