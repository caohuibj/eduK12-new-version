import {PVT_LIMITS,type PvtConfig,type PvtPlan,type PvtRaw,type PvtEvent,type PvtOutcome} from './generated/protocol'
import {reviewPvt} from './generated/analysis'
export type PvtInputEvent=Exclude<PvtEvent,{kind:'target'}>
/** Records actual display callbacks and first downs. There is no timing probe, per-frame log or speed-based validity threshold. */
export class PvtCapture {
  readonly raw:PvtRaw;done=false;targetOnsetMs:number|null=null
  private held:Set<string>;private last:number
  constructor(readonly config:PvtConfig,plan:PvtPlan,phaseStartedAtMs:number,now:number,heldBefore:string[]=[]){this.last=now;this.held=new Set(heldBefore);this.raw={plan:structuredClone(plan),phaseStartedAtMs,waitStartedAtMs:now,endedAtMs:now,outcome:'interrupted',stopReason:'ongoing',heldBefore:[...heldBefore].sort(),events:[],ignoredRepeats:0,overflow:false}}
  get review(){return reviewPvt(this.raw,this.raw.plan,this.config)}
  get inFeedback(){return this.last<this.raw.waitStartedAtMs+this.raw.plan.feedbackMs}
  private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic PVT clock');this.last=now;this.raw.endedAtMs=now}
  private close(outcome:PvtOutcome,reason:string|null=null){this.raw.outcome=outcome;this.raw.stopReason=reason;this.done=true}
  private expire(now:number){const cutoff=this.raw.plan.phase==='test'?this.raw.phaseStartedAtMs+this.config.durationMs:Infinity,timeout=this.targetOnsetMs===null?Infinity:this.targetOnsetMs+this.config.responseWindowMs
    if(now>=Math.min(cutoff,timeout)){this.close(timeout<=cutoff?'timeout':'budget-end');return true}return false}
  tick(now:number){if(this.done)return;this.clock(now);if(this.expire(now))return
    if(this.targetOnsetMs===null&&now>=this.raw.waitStartedAtMs+this.raw.plan.waitMs){if(this.store({kind:'target',atMs:now}))this.targetOnsetMs=now}}
  input(event:PvtInputEvent){if(this.done)return;this.clock(event.atMs);if(this.expire(event.atMs))return
    if(event.kind==='down'&&event.repeat){this.raw.ignoredRepeats++;this.expire(event.atMs);return}
    const fresh=!this.held.has(event.token)
    if(event.kind==='down'&&fresh&&this.held.size>=PVT_LIMITS.heldTokens){this.raw.overflow=true;this.stop('input-log-bound',event.atMs);return}
    if(!this.store(structuredClone(event)))return
    if(event.kind==='up')this.held.delete(event.token);else this.held.add(event.token)
    if(this.expire(event.atMs))return
    if(event.kind==='down'&&fresh){if(this.targetOnsetMs!==null)this.close('responded');else if(!this.inFeedback)this.close('early')}
  }
  private store(event:PvtEvent){if(this.raw.events.length>=PVT_LIMITS.eventsPerCycle){this.raw.overflow=true;this.stop('input-log-bound',event.atMs);return false}this.raw.events.push(event);return true}
  stop(reason:string,now:number){if(this.done)return;this.clock(now);if(!this.expire(now))this.close('interrupted',reason)}
}
