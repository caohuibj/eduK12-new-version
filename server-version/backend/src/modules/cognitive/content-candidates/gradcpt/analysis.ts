import type {GradRaw,GradSlot} from './protocol'
import {same} from './protocol'
import {resolveGrad} from './assignment'
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6
/** No refresh-rate or single-frame exclusion. Only actually exposed, settled images enter the denominators. */
export function reviewGrad(raw:GradRaw,plan:GradSlot[]){
 if(!same(raw.plan,plan)||raw.endedAtPerfMs<raw.startedAtPerfMs||raw.slots.length>plan.length)throw Error('GradCPT plan/clock mismatch')
 const complete=raw.status==='complete';if(complete&&(raw.stopReason!==null||raw.overflow||raw.slots.length!==plan.length||raw.slots.some(s=>s.endMs===null)))throw Error('Unexecuted gradCPT sequence claimed complete')
 if(!complete&&raw.stopReason===null)throw Error('Interrupted gradCPT requires a reason')
 for(const [i,s] of raw.slots.entries()){if(s.index!==i||!near(s.startMs,i===0?raw.startedAtPerfMs:raw.slots[i-1].endMs??NaN)||s.startMs>raw.endedAtPerfMs
  ||(s.endMs!==null&&(s.endMs-s.startMs<plan[i].durationMs-1e-6||s.endMs>raw.endedAtPerfMs))||(s.endMs===null&&i!==raw.slots.length-1))throw Error('GradCPT exposure clock mismatch')}
 let lastAt=raw.startedAtPerfMs,lastSlot=0
 for(const f of raw.frames){const s=raw.slots[f.slotIndex];if(!s||f.atMs<lastAt||f.atMs>raw.endedAtPerfMs||f.slotIndex<lastSlot||f.slotIndex>lastSlot+1||f.atMs<s.startMs||(s.endMs!==null&&f.atMs>s.endMs)
   ||!near(f.opacity,Math.round(Math.min(1,(f.atMs-s.startMs)/plan[f.slotIndex].durationMs)*1e6)/1e6))throw Error('GradCPT paint evidence mismatch');lastAt=f.atMs;lastSlot=f.slotIndex}
 if(!near(raw.frames[0].atMs,raw.startedAtPerfMs)||raw.frames[0].slotIndex!==0||raw.frames[0].opacity!==0)throw Error('Missing initial gradCPT paint')
 for(const s of raw.slots)if(!raw.frames.some(f=>f.slotIndex===s.index&&near(f.atMs,s.startMs)&&f.opacity===0))throw Error('Missing actual gradCPT stage onset')
 let pointer=0,eventAt=raw.startedAtPerfMs
 for(const e of raw.events){if(e.atMs<eventAt||e.atMs>raw.endedAtPerfMs)throw Error('GradCPT event clock mismatch');eventAt=e.atMs
  while(pointer+1<raw.frames.length&&raw.frames[pointer+1].atMs<=e.atMs)pointer++
  const painted=raw.frames[pointer];if(e.slotIndex!==painted.slotIndex||!near(e.opacity,painted.opacity))throw Error('GradCPT input did not belong to the displayed frame')}
 const {assigned,ignored}=resolveGrad(raw,plan),rows=plan.filter(s=>s.kind!=='boundary').map(p=>{const s=raw.slots[p.index],next=raw.slots[p.index+1],settled=!!s&&s.endMs!==null&&!!next&&next.endMs!==null,
 response=settled?assigned[p.index]??null:null;return {index:p.index,kind:p.kind,settled,responded:response!==null,response,correct:settled?(p.kind==='city'?response!==null:response===null):null}})
 return {rows,assigned,ignored,complete,presented:rows.filter(p=>raw.slots[p.index]?.endMs!==null&&raw.slots[p.index]?.endMs!==undefined).length}
}
export function inverseNormal(p:number):number{if(!(p>0&&p<1))throw Error('Normal quantile requires open probability');const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924],b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857],c=[-.00778489400243029,-.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878],d=[.00778469570904146,.32246712907004,2.445134137143,3.75440866190742]
 if(p<.02425){const q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p>1-.02425)return -inverseNormal(1-p)
 const q=p-.5,t=q*q;return (((((a[0]*t+a[1])*t+a[2])*t+a[3])*t+a[4])*t+a[5])*q/(((((b[0]*t+b[1])*t+b[2])*t+b[3])*t+b[4])*t+1)}
export function gradStatistics(review:ReturnType<typeof reviewGrad>){const city=review.rows.filter(r=>r.settled&&r.kind==='city'),mountain=review.rows.filter(r=>r.settled&&r.kind==='mountain'),rt=city.filter(r=>r.response).map(r=>r.response!.rtMs).sort((a,b)=>a-b),hits=rt.length,fa=mountain.filter(r=>r.responded).length,
 mean=rt.length?rt.reduce((a,b)=>a+b,0)/rt.length:null,median=rt.length?(rt[Math.floor((rt.length-1)/2)]+rt[Math.floor(rt.length/2)])/2:null,sd=rt.length>1?Math.sqrt(rt.reduce((n,t)=>n+(t-mean!)**2,0)/(rt.length-1)):null,
 corrected=(count:number,n:number)=>count===0?.5/n:count===n?1-.5/n:count/n,h=city.length?corrected(hits,city.length):null,f=mountain.length?corrected(fa,mountain.length):null
 return {city:city.length,mountain:mountain.length,hits,omissions:city.length-hits,falseAlarms:fa,correctRejections:mountain.length-fa,rtCount:rt.length,meanMs:mean,medianMs:median,sdMs:sd,cv:sd!==null&&mean!==null&&mean>0?sd/mean:null,
 correctedHitRate:h,correctedFalseAlarmRate:f,dPrime:h!==null&&f!==null?inverseNormal(h)-inverseNormal(f):null,criterion:h!==null&&f!==null?-.5*(inverseNormal(h)+inverseNormal(f)):null}
}
