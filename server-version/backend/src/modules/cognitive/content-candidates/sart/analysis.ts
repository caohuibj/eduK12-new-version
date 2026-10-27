import {same,sartDeadline,SART_LIMITS,type SartPlan,type SartRaw,type SartInput} from './protocol'
export interface SartReview {complete:boolean;responded:boolean;rtMs:number|null;input:SartInput|null;correct:boolean|null;heldAfter:string[]}
/** Rebuild first fresh input from raw events. A complete unanswered No-Go is correct withholding, never an omission. */
export function reviewSart(raw:SartRaw,plan:SartPlan,expectedHeld?:string[]):SartReview{
  if(!same(raw.plan,plan))throw Error('SART plan mismatch')
  if(!Number.isFinite(raw.onsetMs)||raw.onsetMs<0||!Number.isFinite(raw.endedAtMs)||raw.endedAtMs<raw.onsetMs)throw Error('SART clock mismatch')
  if(new Set(raw.heldBefore).size!==raw.heldBefore.length||raw.heldBefore.length>SART_LIMITS.heldTokens||expectedHeld&&!same(raw.heldBefore,expectedHeld))throw Error('SART held ownership mismatch')
  if(raw.events.length>SART_LIMITS.eventsPerTrial)throw Error('SART event budget exceeded')
  const held=new Set(raw.heldBefore);let previous=raw.onsetMs,mask=false,rtMs:number|null=null,input:SartInput|null=null
  for(const event of raw.events){
    if(!Number.isFinite(event.atMs)||event.atMs<previous||event.atMs>raw.endedAtMs)throw Error('SART event clock mismatch');previous=event.atMs
    if(event.kind==='mask'){if(mask||event.atMs<raw.onsetMs+plan.digitMs)throw Error('SART mask mismatch');mask=true;continue}
    if(event.kind==='up'){held.delete(event.token);continue}
    const fresh=!held.has(event.token);held.add(event.token)
    if(held.size>SART_LIMITS.heldTokens)throw Error('SART held budget exceeded')
    if(fresh&&!event.repeat&&rtMs===null&&event.atMs<raw.onsetMs+sartDeadline(plan)){rtMs=event.atMs-raw.onsetMs;input=event.input}
  }
  if(raw.status==='complete'&&(!mask||raw.endedAtMs<raw.onsetMs+sartDeadline(plan)||raw.stopReason!==null||raw.overflow))throw Error('SART false completion')
  if(raw.status==='interrupted'&&!raw.stopReason)throw Error('SART interruption reason missing')
  const complete=raw.status==='complete',responded=rtMs!==null
  return {complete,responded,rtMs,input,correct:complete?(plan.digit===3?!responded:responded):null,heldAfter:[...held].sort()}
}
export const medianSart=(values:number[]):number|null=>{if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export interface SartStats {go:number;noGo:number;hits:number;omissions:number;commissions:number;correctWithholds:number;rtCount:number;medianMs:number|null}
export function sartStats(rows:{plan:SartPlan;review:SartReview}[]):SartStats{
  let go=0,noGo=0,hits=0,commissions=0;const rts:number[]=[]
  for(const {plan,review:r} of rows){if(!r.complete)continue;if(plan.digit===3){noGo++;if(r.responded)commissions++}else{go++;if(r.responded){hits++;rts.push(r.rtMs!)}}}
  return {go,noGo,hits,omissions:go-hits,commissions,correctWithholds:noGo-commissions,rtCount:rts.length,medianMs:medianSart(rts)}
}
