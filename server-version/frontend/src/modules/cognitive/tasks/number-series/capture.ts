import {keyChoice,type NumberSeriesPlan,type NumberSeriesRaw,type NumberSeriesEvent,type InputMode} from './generated/protocol'
/** Untimed task: one software DOM-commit onset and one actual terminal event, no frame/timing probes. */
export class NumberSeriesCapture {
  private value:NumberSeriesRaw
  done=false
  get raw(){return structuredClone(this.value)}
  constructor(plan:NumberSeriesPlan,now:number) {
    if(!Number.isFinite(now)||now<0)throw Error('Invalid onset time')
    this.value={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',response:null,rtMs:null,input:null,stopReason:null,events:[],ignoredRepeatCount:0}
  }
  repeat(){if(!this.done)this.value.ignoredRepeatCount=Math.min(Number.MAX_SAFE_INTEGER,this.value.ignoredRepeatCount+1)}
  answer(choice:number,input:InputMode,key:string|null,now:number,repeat=false) {
    if(this.done)return
    if(repeat){this.repeat();return}
    if(!Number.isInteger(choice)||choice<0||choice>3||(input==='keyboard'?key===null||keyChoice(key)!==choice:key!==null))throw Error('Input mapping mismatch')
    this.finish({kind:'answer',choice,input,key,atMs:now})
  }
  skip(input:InputMode,now:number){if(!this.done)this.finish({kind:'skip',input,atMs:now})}
  interrupt(reason:string,now:number){if(!this.done)this.finish({kind:'interrupt',reason,atMs:now})}
  private finish(event:NumberSeriesEvent) {
    if(!Number.isFinite(event.atMs)||event.atMs<this.value.startedAtPerfMs)throw Error('Nonmonotonic terminal clock')
    if(event.kind==='interrupt'&&(!event.reason||event.reason.length>96))throw Error('Missing interruption reason')
    const answer=event.kind==='answer'
    this.value.events=[structuredClone(event)];this.value.endedAtPerfMs=event.atMs
    this.value.status=answer?'answered':event.kind==='skip'?'skipped':'interrupted'
    this.value.response=answer?event.choice:null;this.value.rtMs=answer?event.atMs-this.value.startedAtPerfMs:null
    this.value.input=event.kind==='interrupt'?null:event.input;this.value.stopReason=event.kind==='interrupt'?event.reason:null
    this.done=true
  }
}
