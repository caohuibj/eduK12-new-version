import {initialHFState,reduceHFEvent,type HFConfig,type HFPlan,type HFRaw,type HFEvent} from './generated/protocol'
export type HFInputEvent=Extract<HFEvent,{kind:'down'|'up'|'activate'}>
/** Record actual stage callbacks and bounded inputs. No frame log, calibration probe or latency correction. */
export class HFCapture {
 readonly raw:HFRaw;done=false;private last:number
 constructor(readonly config:HFConfig,plan:HFPlan,now:number,held:string[]=[]){if(held.length>64||new Set(held).size!==held.length)throw Error('Invalid held input baseline');this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,initialHeld:[...held],events:[],state:initialHFState(),ignoredRepeatCount:0,overflow:false};this.raw.state.held=[...held]}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic hearts-flowers clock');this.last=now}
 tick(now:number){if(this.done)return;this.clock(now);const s=this.raw.state
  if(s.stage==='ready')this.store({kind:'onset',atMs:now})
  else if(s.stage==='stimulus'&&now>=s.onsetMs!+this.raw.plan.deadlineMs)this.store({kind:'timeout',atMs:now})
  else if(s.stage==='blank'&&now>=s.closedMs!+this.config.blankMs)this.store({kind:'finish',atMs:now})}
 input(event:HFInputEvent){if(this.done)return;this.clock(event.atMs);if(this.raw.state.stage==='stimulus'&&event.atMs>=this.raw.state.onsetMs!+this.raw.plan.deadlineMs)this.store({kind:'timeout',atMs:event.atMs});if(event.kind==='down'&&event.repeat){this.raw.ignoredRepeatCount++;return}if(!this.done)this.store(event)}
 private store(event:HFEvent){if(this.raw.events.length>=256){this.raw.overflow=true;this.interrupt('input-log-bound',event.atMs);return}reduceHFEvent(this.raw.state,event,this.raw.plan,this.config,this.raw.startedAtPerfMs);this.raw.events.push(event);if(this.raw.state.stage==='complete'){this.raw.status='complete';this.raw.endedAtPerfMs=event.atMs;this.raw.stopReason=null;this.done=true}}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);if(this.raw.events.length<256&&this.raw.state.stage==='stimulus'&&now>=this.raw.state.onsetMs!+this.raw.plan.deadlineMs)this.store({kind:'timeout',atMs:now});this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.done=true}
}
