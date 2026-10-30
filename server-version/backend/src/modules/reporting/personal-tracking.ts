import {z} from 'zod'
import {finiteReportingNumber} from './statistics'
import {resolveReportingComparability} from './comparability'

const key=z.string().min(1).max(240)
export const trackedMetricSchema=z.object({
  id:key,sourceKey:key,scoreKey:key,label:key,unit:key,
  kind:z.enum(['SCALE','COGNITIVE','SJT','FORM']),measurementHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const personalTrackingPlanSchema=z.object({
  schemaVersion:z.literal(1),id:z.string().uuid(),baselineWaveId:key,
  metrics:z.array(trackedMetricSchema).min(1).max(128),
}).strict().refine(p=>new Set(p.metrics.map(m=>m.id)).size===p.metrics.length)
export type PersonalTrackingPlan=z.infer<typeof personalTrackingPlanSchema>
export type TrackedMetric=z.infer<typeof trackedMetricSchema>

/** Internal typed leaf result. Entry adapters authorize and locate a tool before
 * projecting its metrics. scopedSubjectId never belongs in a participant DTO. */
export interface PersonalLeafResult {
  scopedSubjectId:string;waveId:string;ordinal:number;attemptId:string;resultId:string;
  completedAt:string;sourceHash:string;
  metrics:Record<string,{value:number|null;measurementHash:string;unit:string;visible:boolean;pending?:boolean;missingReason?:'NOT_EXECUTED'}>
}

/** Select a whole completed parent first, including stable tie-breaking. A newer
 * parent's missing value cannot be replaced by an older metric's value. */
export function latestCompletedParents<T extends {waveId:string;completedAt:string|null;resultId:string}>(rows:readonly T[]):Map<string,T>{
  const result=new Map<string,T>()
  for(const row of rows){
    if(!row.completedAt||!Number.isFinite(Date.parse(row.completedAt)))continue
    const old=result.get(row.waveId)
    if(!old||Date.parse(row.completedAt)>Date.parse(old.completedAt!)||
      Date.parse(row.completedAt)===Date.parse(old.completedAt!)&&row.resultId>old.resultId)result.set(row.waveId,row)
  }
  return result
}

export function projectPersonalChanges(plan:PersonalTrackingPlan,waves:readonly {id:string;ordinal:number}[],rows:readonly PersonalLeafResult[]){
  if(new Set(rows.map(row=>row.scopedSubjectId)).size>1)throw new Error('Personal projection requires one scoped subject')
  const parents=latestCompletedParents(rows)
  // IDs/measurement provenance stay internal. Public response uses ordinals.
  const ordered=[...waves].sort((a,b)=>a.ordinal-b.ordinal)
  let available=false
  const metrics=plan.metrics.flatMap(metric=>{
    const points=ordered.map(wave=>{
      const parent=parents.get(wave.id),value=parent?.metrics[metric.id]
      const visible=value?.visible===true
      const exact=visible&&value.measurementHash===metric.measurementHash&&value.unit===metric.unit
      const numeric=exact&&!value.pending?finiteReportingNumber(value.value):null
      return {ordinal:wave.ordinal,observedAt:parent?.completedAt??null,value:numeric,
        missingReason:numeric!==null?null:!parent?'NOT_COMPLETED':!visible?'NOT_DISCLOSED':value?.missingReason??(value?.pending?'PENDING_RELEASE':!exact?'NOT_COMPARABLE':'INVALID_OR_MISSING')}
    })
    const present=points.filter(p=>p.value!==null).length
    if(!ordered.some(wave=>parents.get(wave.id)?.metrics[metric.id]?.visible))return []
    if(present>=2)available=true
    const decision=resolveReportingComparability({metricId:metric.id,
      left:{family:metric.kind==='SJT'?'SITUATIONAL':metric.kind==='FORM'?'SCALE':metric.kind,key:metric.id,version:metric.measurementHash},
      right:{family:metric.kind==='SJT'?'SITUATIONAL':metric.kind==='FORM'?'SCALE':metric.kind,key:metric.id,version:metric.measurementHash},
      rule:{schemaVersion:1,metricId:metric.id,resourceFamily:metric.kind==='SJT'?'SITUATIONAL':metric.kind==='FORM'?'SCALE':metric.kind,
        resourceKey:metric.id,fromVersion:metric.measurementHash,toVersion:metric.measurementHash,level:'EXACT',
        evidenceRef:'FROZEN_PERSONAL_PLAN',evidenceHash:metric.measurementHash}})
    const delta=(a:typeof points[number],b:typeof points[number])=>{
      const value=a.value!==null&&b.value!==null?b.value-a.value:null
      return value!==null&&Number.isFinite(value)?value:null
    }
    return [{id:metric.id,label:metric.label,unit:metric.unit,points,
      adjacent:points.slice(1).map((point,i)=>({fromOrdinal:points[i].ordinal,toOrdinal:point.ordinal,
        delta:delta(points[i],point),comparability:decision})),
      baseline:points.slice(1).map(point=>({fromOrdinal:points[0].ordinal,toOrdinal:point.ordinal,
        delta:delta(points[0],point),intermediateMissing:points.some(p=>p.ordinal>points[0].ordinal&&p.ordinal<point.ordinal&&p.value===null)}))}]
  })
  return {schemaVersion:1 as const,kind:'MY_CHANGES' as const,status:available?'AVAILABLE' as const:'WAITING' as const,metrics:available?metrics:[],
    note:'仅描述相同测量定义下的数值变化；缺失轮次不连线，不作诊断、显著性或因果判断。'}
}
export type PersonalChanges=ReturnType<typeof projectPersonalChanges>
