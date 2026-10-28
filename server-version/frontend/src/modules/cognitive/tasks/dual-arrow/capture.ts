import {initialDualState,reduceDualEvent,dualFeedbackMs,type DualConfig,type DualPlan,type DualRaw,type DualEvent} from './generated/protocol'
export type DualInputEvent=Extract<DualEvent,{kind:'down'|'up'|'activate'}>
/** Actual stage callbacks and bounded input, no per-frame telemetry or forced timing probes. */
export class DualCapture {
 readonly raw:DualRaw;done=false;private last:number
 constructor(readonly config:DualConfig,plan:DualPlan,now:number){this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,events:[],state:initialDualState(plan),ignoredRepeatCount:0,overflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic dual clock');this.last=now}
 tick(now:number){if(this.done)return;this.clock(now);const s=this.raw.state,p=this.raw.plan
  if(s.stage==='fixation'&&now-this.raw.startedAtPerfMs>=p.fixationMs)this.store({kind:'stimulus',atMs:now})
  else if(s.stage==='stimulus'&&now-s.stimulusAtMs!>=p.deadlineMs)this.store({kind:'timeout',atMs:now})
  else if(s.stage==='feedback'&&now-s.feedbackAtMs!>=dualFeedbackMs(s,p,this.config))this.store({kind:'finish',atMs:now})}
 input(event:DualInputEvent){if(this.done)return;this.clock(event.atMs);if(this.raw.state.stage==='stimulus'&&event.atMs>=this.raw.state.stimulusAtMs!+this.raw.plan.deadlineMs)this.store({kind:'timeout',atMs:event.atMs})
  if(event.kind==='down'&&event.repeat){this.raw.ignoredRepeatCount++;return}if(!this.done)this.store(event)}
 private store(event:DualEvent){if(this.raw.events.length>=256){this.raw.overflow=true;this.interrupt('input-log-bound',event.atMs);return}reduceDualEvent(this.raw.state,event,this.raw.plan,this.config,this.raw.startedAtPerfMs);this.raw.events.push(event)
  if(this.raw.state.stage==='complete'){this.raw.status='complete';this.raw.endedAtPerfMs=event.atMs;this.raw.stopReason=null;this.done=true}}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.done=true}
}
