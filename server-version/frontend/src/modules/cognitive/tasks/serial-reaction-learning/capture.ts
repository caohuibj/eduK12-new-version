import {reviewRaw,type Plan,type Raw,type Location} from './generated/protocol'
/** One ordinary DOM-commit software onset; no frame probes or fabricated hardware accuracy. */
export class Capture{
  private value:Raw;done=false
  constructor(plan:Plan,now:number){if(!Number.isFinite(now)||now<0)throw Error('Bad SRL onset');this.value={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',firstLocation:null,firstRtMs:null,firstCorrect:null,correctAtMs:null,events:[],ignoredInputCount:0}}
  get raw(){return structuredClone(this.value)}
  ignore(){if(!this.done)this.value.ignoredInputCount=Math.min(Number.MAX_SAFE_INTEGER,this.value.ignoredInputCount+1)}
  private clock(now:number){if(!Number.isFinite(now)||now<(this.value.events.slice(-1)[0]?.atMs??this.value.startedAtPerfMs))throw Error('Nonmonotonic SRL clock')}
  tap(location:Location,now:number){
    if(this.done)return;this.clock(now);if(!Number.isInteger(location)||location<0||location>3)throw Error('Invalid SRL location')
    if(this.value.events.length>=2048){this.ignore();this.interrupt('response-record-limit',now);return}
    this.value.events.push({kind:'tap',atMs:now,location,input:'touch'});this.value.endedAtPerfMs=now
    if(this.value.firstLocation===null){this.value.firstLocation=location;this.value.firstRtMs=now-this.value.startedAtPerfMs;this.value.firstCorrect=location===this.value.plan.target}
    if(location===this.value.plan.target){this.value.correctAtMs=now;this.value.status='completed';this.done=true;reviewRaw(this.value,this.value.plan)}
  }
  interrupt(reason:string,now:number){if(this.done)return;this.clock(now);if(!reason||reason.length>96)throw Error('Invalid SRL interruption');this.value.events.push({kind:'interrupt',atMs:now,reason});this.value.endedAtPerfMs=now;this.done=true;reviewRaw(this.value,this.value.plan)}
}
