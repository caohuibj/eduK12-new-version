import {initialHorizonState,reduceHorizonEvent,type HorizonConfig,type HorizonPlan,type HorizonRaw,type HorizonEvent} from './generated/protocol'
export type HorizonInputEvent=Extract<HorizonEvent,{kind:'down'|'up'|'activate'}>
/** Only stage/input events are retained; no frame logs or network requests. */
export class HorizonCapture {
 readonly raw:HorizonRaw;done=false;private last:number
 constructor(readonly config:HorizonConfig,plan:HorizonPlan,now:number){if(!Number.isFinite(now)||now<0)throw Error('Invalid Horizon clock');this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,events:[],state:initialHorizonState(now),ignoredRepeatCount:0,overflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic Horizon clock');this.last=now}
 tick(now:number){if(this.done)return;this.clock(now);if(this.raw.state.stage==='feedback'&&now>=this.raw.state.readyAtMs)this.store({kind:'ready',atMs:now})}
 input(e:HorizonInputEvent){if(this.done)return;this.clock(e.atMs);if(e.kind==='down'&&e.repeat){this.raw.ignoredRepeatCount++;return}this.store(e)}
 private store(e:HorizonEvent){if(this.raw.events.length>=256){this.raw.overflow=true;this.interrupt('input-log-bound',e.atMs);return}reduceHorizonEvent(this.raw.state,e,this.raw.plan,this.config);this.raw.events.push(e);if(this.raw.state.stage==='complete'){this.raw.status='complete';this.raw.endedAtPerfMs=e.atMs;this.raw.stopReason=null;this.done=true}}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.done=true}
}
