import {FAMILIES,type Family,type NumberSeriesConfig} from './protocol'
export interface Counts {planned:number;received:number;opportunities:number;correct:number;wrong:number;skipped:number;interrupted:number;unpresented:number}
export interface ConditionCounts {planned:number;opportunities:number;correct:number;wrong:number;skipped:number;interrupted:number;correctRtMs:number|null}
export const rate=(numerator:number,denominator:number)=>denominator===0?null:numerator/denominator
export const difference=(left:number|null,right:number|null)=>left===null||right===null?null:left-right
export function median(values:readonly number[]):number|null {
  if(!values.length)return null
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2
}
export const emptyConditions=(c:NumberSeriesConfig)=>Object.fromEntries(FAMILIES.map(f=>[f,{planned:c.itemsPerCondition,opportunities:0,correct:0,wrong:0,skipped:0,interrupted:0,correctRtMs:null}])) as Record<Family,ConditionCounts>
