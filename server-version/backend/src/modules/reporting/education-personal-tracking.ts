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
export const educationTrackingSelectionSchema=z.object({mode:z.enum(['SINGLE','LONGITUDINAL']),
 metrics:z.array(z.object({trackId:key,itemId:key,scoreKey:key}).strict()).max(128).default([])}).strict()
const binding=z.object({metricId:key,trackId:key,itemId:key,scoreKey:key}).strict()
export const educationTrackingSchema=z.object({schemaVersion:z.literal(1),entry:z.literal('TEACHER'),
 plan:personalTrackingPlanSchema.optional(),bindings:z.array(binding).min(1).max(128),requestId:z.string().uuid().optional()}).strict()
export type EducationTracking=z.infer<typeof educationTrackingSchema>
export type EducationTrackingTrack={id:string;resourcePolicy:RunResourcePolicy}
function fail(message:string):never{return reportingFail('PERSONAL_TRACKING_INVALID',message,409)}

/** Only existing content-owned longitudinal rights become picker choices.
 * Empty longitudinalMetricKeys is not upgraded from ordinary numeric access. */
export async function educationTrackingChoices(db:Prisma.TransactionClient,tracks:EducationTrackingTrack[]){
 const choices:Array<{trackId:string;itemId:string;scoreKey:string;label:string;unit:string;measurementHash:string}>=[]
 const releases=new Map<string,Awaited<ReturnType<typeof getContentRelease>>>()
 for(const track of tracks){
  const policy=track.resourcePolicy
  if(policy.relationshipKinds.length!==1||policy.relationshipKinds[0]!=='SELF'||policy.subjectRoles.length!==1||policy.subjectRoles[0]!=='TEACHER'
   ||policy.respondentRoles.length!==1||policy.respondentRoles[0]!=='TEACHER'||!policy.resultDisclosure||policy.runtimeLaunchTarget?.kind!=='COMPOSITE')continue
  const allowed=validateResultDisclosureContract(policy.resultDisclosure).audiences.RESPONDENT
  if(allowed.mode!=='INDIVIDUAL_SUMMARY'||!allowed.longitudinalMetricKeys.length)continue
  const source=await db.compositeAssessment.findUnique({where:{id:policy.runtimeLaunchTarget.ref},include:{items:{include:{scale:true}}}})
  const snapshot=trainingContentSnapshotSchema.safeParse(source?.trainingContentSnapshot)
  if(!source||!snapshot.success||snapshot.data.compositeId!==source.id||canonicalHash(snapshot.data)!==source.trainingContentSnapshotHash)continue
  // Legacy registered Teacher SELF Scale is already authorized. Composition
  // adapters currently declare no longitudinal rights; do not flatten their
  // identical score names or infer a grant from a questionnaire-wide label.
  if(snapshot.data.units.length!==1||snapshot.data.units[0].family!=='SCALE')continue
  const unit=snapshot.data.units[0]
  let release=releases.get(unit.measurement.releaseId)
  if(!release){release=await getContentRelease(db,unit.measurement.releaseId,true);releases.set(unit.measurement.releaseId,release)}
  if(!release||release.layer!=='MEASUREMENT'||release.status==='REVOKED'||release.contentHash!==unit.measurement.contentHash)fail('追踪测量来源不可用')
  const definition=source.items.find(item=>item.id===unit.itemId)?.scale?.definition as {scoring?:{scores?:Array<{key:string;label?:string}>}}|undefined
  for(const metric of release.content.metrics){
   if(!allowed.longitudinalMetricKeys.includes(metric.metricKey)||!allowed.metricKeys.includes(metric.metricKey))continue
   choices.push({trackId:track.id,itemId:unit.itemId,scoreKey:metric.metricKey,
    label:definition?.scoring?.scores?.find(score=>score.key===metric.metricKey)?.label||metric.metricKey,
    unit:metric.unit,measurementHash:release.content.measurementHash})
  }
 }
 return choices
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
 const [link]=await db.$queryRaw<Array<{id:string}>>`SELECT event.id FROM huiteacher_evaluation_run_links link
  JOIN huiteacher_evaluation_events event ON event.organization_id=link.organization_id AND event.id=link.event_id
  WHERE link.organization_id=${input.organizationId} AND link.run_id=${input.runId} AND event.status='OPEN'
   AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.run_id=link.run_id)`
 if(!link)fail('当前仅可从具备本人纵向披露许可的教师 SELF 任务发布')
 const choices=await educationTrackingChoices(db,input.tracks)
 if(row.tracking){
  if(selected?.mode==='SINGLE')fail('后续轮次不能降为单次')
  const tracking=educationTrackingSchema.parse(row.tracking)
  const [baseline]=await db.$queryRaw<Array<{tracking:unknown}>>`SELECT personal_tracking AS tracking FROM assessment_runs
   WHERE organization_id=${input.organizationId} AND id=${row.baselineId}`
  const plan=educationTrackingSchema.parse(baseline?.tracking).plan
  if(!plan||tracking.bindings.length!==plan.metrics.length)fail('追踪基线不可用')
  for(const metric of plan.metrics){
   const bound=tracking.bindings.find(b=>b.metricId===metric.id)
   const choice=choices.find(c=>c.trackId===bound?.trackId&&c.itemId===bound.itemId&&c.scoreKey===bound.scoreKey)
   if(!choice||choice.measurementHash!==metric.measurementHash||choice.unit!==metric.unit)fail('请保留继承的追踪任务、计分和单位')
  }
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
  metrics.push({id:metricId,sourceKey:item.trackId+':'+item.itemId,scoreKey:item.scoreKey,label:choice.label,unit:choice.unit,kind:'SCALE',measurementHash:choice.measurementHash})
  bindings.push({...item,metricId})
 }
 const tracking:EducationTracking={schemaVersion:1,entry:'TEACHER',plan:{schemaVersion:1,id:randomUUID(),baselineWaveId:input.runId,metrics},bindings}
 await db.$executeRaw`UPDATE assessment_runs SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,
  personal_tracking=${JSON.stringify(tracking)}::jsonb WHERE organization_id=${input.organizationId} AND id=${input.runId}`
}
