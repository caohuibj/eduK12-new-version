import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {personalTrackingPlanSchema,type PersonalTrackingPlan,type TrackedMetric} from './personal-tracking'
import type {TaskGroupProjection} from './group-summary'

export const groupLongitudinalRequestSchema=z.object({planId:z.string().uuid(),sourceKey:z.string().min(1).max(240),throughWaveId:z.string().min(1).max(240)}).strict()

export class GroupLongitudinalError extends Error {constructor(message:string,readonly statusCode=409){super(message)}}

export interface GroupLongitudinalWave {
 id:string;ordinal:number;label:string;projection:TaskGroupProjection
 observedFrom:string|null;observedUntil:string|null
 /** Private scoped identities. Never part of a public projection. */
 populationKeys:string[]|null
 metricKeys:Record<string,string>
 protocols?:Record<string,string|null>
}
export interface GroupLongitudinalProjection {
 schemaVersion:1;kind:'GROUP_LONGITUDINAL';planId:string;sourceKey:string;title:string;generatedCutoff:string
 populationMode:'INDEPENDENT_WAVES'
 metrics:Array<{id:string;label:string;unit:string;points:Array<{
  waveId:string;ordinal:number;label:string;observedFrom:string|null;observedUntil:string|null
  completedN:number|null;countUnit:'PERSON'|'RESPONSE';validN:number|null;missingN:number|null
  state:'present'|'missing'|'suppressed';mean:number|null;sdSample:number|null
  adjacentDelta:number|null;baselineDelta:number|null;intermediateMissing:boolean
  populationChanged:boolean|null
 }> }>
 limitations:string[]
}
export function groupTrackingMetrics(raw:unknown,sourceKey:string):{plan:PersonalTrackingPlan;metrics:TrackedMetric[]}{
 const plan=personalTrackingPlanSchema.parse(raw),metrics=plan.metrics.filter(m=>m.sourceKey===sourceKey)
 if(!metrics.length)throw new GroupLongitudinalError('请选择已冻结计划中的子工具')
 return {plan,metrics}
}
const finite=(n:unknown):number|null=>typeof n==='number'&&Number.isFinite(n)?n:null
/** Statistics and product disclosure have already been applied by the existing
 * single-wave group services. This only assembles their safe numeric summaries. */
export function projectGroupLongitudinal(input:{plan:PersonalTrackingPlan;metrics:TrackedMetric[];waves:GroupLongitudinalWave[]}):GroupLongitudinalProjection{
 const waves=[...input.waves].sort((a,b)=>a.ordinal-b.ordinal)
 if(waves.length<2||new Set(waves.map(w=>w.id)).size!==waves.length||new Set(waves.map(w=>w.ordinal)).size!==waves.length)
  throw new GroupLongitudinalError('群体纵向需要至少两个不同的已发布波次')
 if(waves[0].id!==input.plan.baselineWaveId)throw new GroupLongitudinalError('纵向报告必须保留计划基线')
 const metrics=input.metrics.map(metric=>{
  const protocols=new Set<string>()
  const points:GroupLongitudinalProjection['metrics'][number]['points']=[]
  for(const [index,wave]of waves.entries()){
   const summary=wave.projection.metrics.find(m=>m.key===wave.metricKeys[metric.id])
   if(summary&&summary.type!=='NUMBER')throw new GroupLongitudinalError('类别编码不能作为连续分数比较')
   if(summary?.unit&&summary.unit!==metric.unit)throw new GroupLongitudinalError('追踪指标单位不一致')
   const suppressed=summary?.state==='suppressed'||wave.projection.completedN===null
   const mean=suppressed?null:finite(summary?.mean),previous=points[index-1],baseline=points[0]
   if(metric.kind==='COGNITIVE'&&mean!==null){const protocol=wave.protocols?.[metric.id];if(!protocol)throw new GroupLongitudinalError('缺少认知实际协议依据');protocols.add(protocol);if(protocols.size>1)throw new GroupLongitudinalError('认知实际协议不一致，不能比较原始分数')}
   const population=wave.populationKeys,previousPopulation=waves[index-1]?.populationKeys
   const populationChanged=wave.projection.completedN!==null&&waves[index-1]?.projection.completedN!==null&&population&&previousPopulation
    ?canonicalHash([...new Set(population)].sort())!==canonicalHash([...new Set(previousPopulation)].sort()):null
   const missingBetween=points.some((p,i)=>i>0&&(p.mean===null||p.ordinal!==waves[i-1].ordinal+1))
    ||(index>0&&wave.ordinal!==waves[index-1].ordinal+1)
   points.push({waveId:wave.id,ordinal:wave.ordinal,label:wave.label,observedFrom:wave.observedFrom,observedUntil:wave.observedUntil,
    completedN:wave.projection.completedN,countUnit:wave.projection.countUnit,
    validN:suppressed?null:summary?summary.validN:0,missingN:suppressed?null:summary?summary.missingN:wave.projection.completedN,
    state:suppressed?'suppressed':mean===null?'missing':'present',mean,sdSample:mean===null?null:finite(summary?.sdSample),
    adjacentDelta:mean!==null&&previous?.mean!==null&&previous?.mean!==undefined&&previous.ordinal+1===wave.ordinal?finite(mean-previous.mean):null,
    baselineDelta:index>0&&mean!==null&&baseline?.mean!==null&&baseline?.mean!==undefined?finite(mean-baseline.mean):null,
    intermediateMissing:missingBetween,populationChanged})
  }
  return {id:metric.id,label:metric.label,unit:metric.unit,points}
 })
 return {schemaVersion:1,kind:'GROUP_LONGITUDINAL',planId:input.plan.id,sourceKey:input.metrics[0].sourceKey,title:'群体纵向报告',
  generatedCutoff:waves.map(w=>w.projection.cutoff).sort().at(-1)!,populationMode:'INDEPENDENT_WAVES',metrics,
  limitations:[...new Set(['各轮分别使用当时合格人群与各指标有效样本；均值之差不是同一人的平均改变。',
   '缺失和隐私抑制保持空值，不补零，不跨缺失波次连线。仅描述原始分数，不推断显著性、改善或干预效果。',
   ...waves.flatMap(w=>w.projection.limitations)])]}
}
