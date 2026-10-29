import {initialSearchState,reduceSearchEvent,type SearchConfig,type SearchPlan,type SearchRaw,type SearchEvent} from './generated/protocol'
export type SearchInputEvent=Exclude<SearchEvent,{kind:'reveal'}>
/** Three static stages, bounded meaningful input records. No frame logs or network writes during search. */
export class SearchCapture {
 readonly raw:SearchRaw;done=false;private last:number
 constructor(readonly config:SearchConfig,plan:SearchPlan,now:number){this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,events:[],state:initialSearchState(),ignoredRepeatCount:0,overflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic search clock');this.last=now}
 tick(now:number){if(this.done)return;this.clock(now);if(this.raw.state.stage==='preview'&&now-this.raw.startedAtPerfMs>=this.config.previewMs)this.store({kind:'reveal',atMs:now})}
 input(event:SearchInputEvent){if(this.done)return;this.clock(event.atMs);if(event.kind==='down'&&event.repeat){this.raw.ignoredRepeatCount++;return}this.store(event)}
 private store(event:SearchEvent){if(this.raw.events.length>=256){this.raw.overflow=true;this.interrupt('input-log-bound',event.atMs);return}reduceSearchEvent(this.raw.state,event,this.raw.plan,this.config,this.raw.startedAtPerfMs);this.raw.events.push(event)
  if(this.raw.state.stage==='complete'){this.raw.status='complete';this.raw.endedAtPerfMs=event.atMs;this.raw.stopReason=null;this.done=true}}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.done=true}
}
