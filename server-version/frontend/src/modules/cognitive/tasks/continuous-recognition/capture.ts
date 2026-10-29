import {clone,type Envelope,type NativeTrial} from './contracts'
type Kind=NativeTrial['record']['kind']
export type Stage='image'|'isi'|'complete'
/** One image+following ISI. Actual transitions only; no synthetic catch-up after a stalled frame. */
export class RecognitionCapture {
  stage:Stage='image';private sequence=0;private stopReason:string|null=null
  private lastTime:number;private flags={timeout:false,premature:false};private qualityEvents:Envelope['qualityEvents']=[]
  readonly payload:NativeTrial;private actual:{imageOnsetMs:number;imageOffsetMs:number|null;windowEndMs:number|null}
  constructor(index:number,assetId:string,kind:Kind,now:number,private readonly timing:{imageMs:number;isiMs:number}={imageMs:750,isiMs:800}){
    this.lastTime=now;this.actual={imageOnsetMs:now,imageOffsetMs:null,windowEndMs:null}
    this.payload={record:{index,assetId,kind,imageOnsetMs:now,imageOffsetMs:null,windowEndMs:null,status:'complete',interruptions:[]},
      events:[],startedAtPerfMs:now,endedAtPerfMs:now,recordOrigin:'live',telemetryOverflow:false}
  }
  tick(now:number):Stage {
    this.check(now)
    const r=this.payload.record
    if(this.stage==='image'&&now-this.payload.startedAtPerfMs>=this.timing.imageMs){r.imageOffsetMs=now;this.actual.imageOffsetMs=now;this.stage='isi'}
    else if(this.stage==='isi'&&now-r.imageOffsetMs!>=this.timing.isiMs&&this.payload.events.every(e=>e.atMs<now)){
      r.windowEndMs=now;this.actual.windowEndMs=now;this.payload.endedAtPerfMs=now;this.stage='complete'
    }
    return this.stage
  }
  input(now:number,input:NativeTrial['events'][number]['input'],key:string|null=null,isRepeat=false,primary=true){
    if(this.stage==='complete')return
    this.check(now)
    if(this.payload.events.length>=20){this.payload.telemetryOverflow=true;this.interrupt('overflow',now);return}
    const seen=primary&&(input!=='keyboard'||key?.toLowerCase()==='r')
    this.payload.events.push({id:'image-'+this.payload.record.index+'-event-'+this.sequence++,atMs:now,action:seen?'seen':'other',input,key,isRepeat})
    if(!primary)this.interrupt('multi-pointer',now)
  }
  interrupt(reason:string,now:number){
    if(this.stage==='complete')return
    this.check(now);this.stopReason=reason;this.actual.windowEndMs=now
    const r=this.payload.record
    const type=reason==='blur'?'blur':reason==='hidden'?'hidden':reason==='rotation'?'rotation':'pause'
    if(r.interruptions.length<32)r.interruptions.push({type,atMs:now})
    this.qualityEvents=[reason==='hidden'?'visibility_lost':reason==='blur'?'window_blur':'resume']
    // An incomplete stage has no invented offset: native all-or-none stage contract; outer clocks retain exposure bounds.
    if(r.imageOffsetMs===null){r.imageOnsetMs=null;r.imageOffsetMs=null;r.windowEndMs=null}
    else r.windowEndMs=now>r.imageOffsetMs?now:null
    if(r.windowEndMs===null){r.imageOnsetMs=null;r.imageOffsetMs=null;r.windowEndMs=null}
    r.status='interrupted';this.payload.endedAtPerfMs=now;this.stage='complete'
  }
  envelope():Envelope {
    if(this.stage!=='complete')throw Error('Exposure is incomplete')
    const p=clone(this.payload),end=p.endedAtPerfMs
    // A clock-coarse input exactly at an interrupted end cannot be assigned to a future unshown image.
    // Preserve it in sidecar via allEvents(); omit it from owned envelope and mark technical exclusion.
    if(p.events.some(e=>e.atMs>=end)){p.events=p.events.filter(e=>e.atMs<end);this.flags.premature=true}
    return {schemaVersion:1,trialIndex:p.record.index,phase:'test',condition:p.record.kind,
      startedAtPerfMs:p.startedAtPerfMs,endedAtPerfMs:end,durationMs:end-p.startedAtPerfMs,
      flags:{...this.flags},qualityEvents:[...this.qualityEvents],payload:p}
  }
  actualExposure(){return clone(this.actual)}
  allEvents(){return clone(this.payload.events)}
  reason(){return this.stopReason}
  private check(now:number){if(!Number.isFinite(now)||now<this.lastTime
    ||(this.payload.events.length>0&&now<this.payload.events[this.payload.events.length-1].atMs))throw Error('Nonmonotonic actual capture clock');this.lastTime=now}
}
