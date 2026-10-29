import type {PrivacyOptions} from '../report-privacy/schema'
import type {MetricFactV1} from '../assessment-runtime/unit-result'
import {privateToolFail} from '../education-tools/private-tool.contracts'

export type StudentScaleMetric={key:string;label:string;displayPrecision:number;values:number[];seen:number}
export const createStudentScaleMetrics=(metrics:Array<{key:string;label:string;displayPrecision?:number}>):StudentScaleMetric[]=>metrics.map(metric=>({...metric,displayPrecision:metric.displayPrecision??1,values:[],seen:0}))
/** Descriptive aggregation of already-scored canonical facts only. Every
 * block keeps its own keys; null is missing and numeric zero stays zero. */
export function recordStudentScaleMetrics(accumulators:StudentScaleMetric[],metrics:MetricFactV1[],quality:string){
 if(new Set(metrics.map(metric=>metric.key)).size!==metrics.length)privateToolFail('STUDENT_COMPOSITION_FINAL_INTEGRITY',409)
 for(const accumulator of accumulators){
  const metric=metrics.find(value=>value.key===accumulator.key)
  if(!metric||metric.value!==null&&(typeof metric.value!=='number'||!Number.isFinite(metric.value)))privateToolFail('STUDENT_COMPOSITION_FINAL_INTEGRITY',409)
  accumulator.seen++
  if(quality!=='invalid'&&metric.quality!=='not_calculable'&&typeof metric.value==='number')accumulator.values.push(metric.value)
 }
}
export function discloseStudentScaleMetrics(accumulators:StudentScaleMetric[],count:number,minimum:number,options?:PrivacyOptions){
 return accumulators.map(metric=>{
  const identity={key:metric.key,label:metric.label,displayPrecision:metric.displayPrecision}
  const validN=metric.values.length,missingN=count-validN
  const reason=metric.seen!==count?'SOURCE_INTEGRITY':options?.restrictedStatisticsProjection?'POLICY_RESTRICTED_STATISTICS':validN<minimum?'MINIMUM_N':
   ((options?.withholdSmallCells??true)||(options?.protectSmallNonrespondentComplement??true))&&missingN>0&&missingN<5?'SMALL_COMPLEMENT':null
  if(reason)return {...identity,status:'WITHHELD' as const,reason,mean:null}
  const mean=metric.values.reduce((average,value,index)=>average*(index/(index+1))+value/(index+1),0)
  if(!Number.isFinite(mean))return {...identity,status:'WITHHELD' as const,reason:'SOURCE_INTEGRITY',mean:null}
  return {...identity,status:'READY' as const,validN,missingN,mean}
 })
}
