import {sartDeadline,SART_LIMITS,type SartPlan,type SartRaw,type SartEvent} from './generated/protocol'
import {reviewSart} from './generated/analysis'
export type SartInputEvent=Exclude<SartEvent,{kind:'mask'}>
/** Actual stage callbacks only; no frame log, probes, clocks or timing-based ability gates. */
export class SartCapture {
  readonly raw:SartRaw;done=false;private last:number
  constructor(plan:SartPlan,now:number,heldBefore:string[]=[]){this.last=now;this.raw={plan:structuredClone(plan),onsetMs:now,endedAtMs:now,status:'interrupted',stopReason:'ongoing',heldBefore:[...heldBefore].sort(),events:[],ignoredRepeats:0,overflow:false}}
  get review(){return reviewSart(this.raw,this.raw.plan)}
  get masked(){return this.raw.events.some(e=>e.kind==='mask')}
  private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic SART clock');this.last=now;this.raw.endedAtMs=now}
  tick(now:number){if(this.done)return;this.clock(now)
    if(!this.masked&&now>=this.raw.onsetMs+this.raw.plan.digitMs){this.store({kind:'mask',atMs:now});return}
    if(this.masked&&now>=this.raw.onsetMs+sartDeadline(this.raw.plan)){this.raw.status='complete';this.raw.stopReason=null;this.done=true}}
  input(e:SartInputEvent){if(this.done)return;this.clock(e.atMs)
    if(e.kind==='down'&&e.repeat){this.raw.ignoredRepeats++;return}
    if(e.kind==='down'&&!this.review.heldAfter.includes(e.token)&&this.review.heldAfter.length>=SART_LIMITS.heldTokens){this.raw.overflow=true;this.interrupt('input-log-bound',e.atMs);return}
    this.store(structuredClone(e))}
  private store(e:SartEvent){if(this.raw.events.length>=SART_LIMITS.eventsPerTrial){this.raw.overflow=true;this.interrupt('input-log-bound',e.atMs);return}this.raw.events.push(e)}
  interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.done=true}
}
