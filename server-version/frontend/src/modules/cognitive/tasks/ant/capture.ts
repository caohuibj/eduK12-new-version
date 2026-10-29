import type { AntCaptureTiming,AntPlan,AntTrial,Direction,Input } from './generated/protocol'
import type { AntFrozenDisplay } from './display'
export type AntStage='fixation'|'cue'|'postcue'|'target'|'hold'|'complete'
export type AntCaptureCore=Omit<AntTrial,'phase'>&{phase:'practice'|'test'}
import type {AntNativeRawRecord as AntRawRecord} from './generated/native-protocol'
export type {AntNativeRawRecord as AntRawRecord} from './generated/native-protocol'
/** Paint-owned clock: the host must synchronously draw each tick result in that same rAF callback. */
export class AntCapture {
  stage:AntStage='fixation'
  readonly core:AntCaptureCore
  private frames:number[]=[]
  private frameOverflow=false
  private diagnostics:AntRawRecord['raw']['diagnostics']=[]
  private previous:number
  constructor(readonly config:AntCaptureTiming,readonly plan:AntPlan,readonly display:AntFrozenDisplay,
    readonly contextId:string,now:number,timeOrigin:number|null,readonly fixture=false,readonly practice?:{policyVersion:string;round:number}){
    if(!Number.isFinite(now)||now<0||!contextId)throw Error('ANT capture requires actual nonnegative clock/context')
    this.previous=now
    this.core={...plan,recordOrigin:fixture?'recovered_without_timing':'live',clock:{source:'performance',timeOriginUnixMs:timeOrigin},
      startedAtPerfMs:now,cueOnsetPerfMs:null,cueOffsetPerfMs:null,targetOnsetPerfMs:null,targetOffsetPerfMs:null,
      endedAtPerfMs:now,events:[],responseIndex:null,timedOut:false,eventOverflow:false,interruptions:[]}
  }
  private clock(now:number):number {
    if(!Number.isFinite(now)||now<0)throw Error('ANT clock must be finite/nonnegative')
    if(now<this.previous){
      if(this.diagnostics.length<32)this.diagnostics.push({kind:'clock_discontinuity',observedAtPerfMs:now,markerAtPerfMs:this.previous})
      this.interrupt('clock_discontinuity',this.previous)
      return this.previous
    }
    this.previous=now;return now
  }
  private isComplete(){return this.stage==='complete'}
  tick(now:number):AntStage {
    if(this.isComplete())return this.stage
    now=this.clock(now)
    if(this.isComplete())return this.stage
    if(this.frames.length<1024)this.frames.push(now);else {this.frameOverflow=true;this.core.eventOverflow=true}
    const t=this.core,c=this.config
    // At most one transition per actual paint; never invent presentations during a background pause.
    if(this.stage==='fixation'&&now-t.startedAtPerfMs>=t.plannedPreCueMs){t.cueOnsetPerfMs=now;this.stage='cue'}
    else if(this.stage==='cue'&&now-t.cueOnsetPerfMs!>=c.cueMs){t.cueOffsetPerfMs=now;this.stage='postcue'}
    else if(this.stage==='postcue'&&now-t.cueOffsetPerfMs!>=c.postCueMs){t.targetOnsetPerfMs=now;this.stage='target'}
    else if(this.stage==='target'&&(t.responseIndex!==null||now-t.targetOnsetPerfMs!>=c.responseWindowMs)){
      t.targetOffsetPerfMs=now;t.timedOut=t.responseIndex===null;this.stage='hold'
    }
    if(now-t.startedAtPerfMs>=c.trialIntervalMs)this.finish(now)
    return this.stage
  }
  input(direction:Direction,input:Input,now:number,repeat=false,held=false):void {
    if(this.isComplete())return
    now=this.clock(now);if(this.isComplete())return
    const t=this.core,index=t.events.length
    if(index>=32){t.eventOverflow=true;return}
    t.events.push({direction,input,atPerfMs:now,repeat,held})
    if(t.responseIndex===null&&this.stage==='target'&&!repeat&&!held&&t.targetOnsetPerfMs!==null
      &&now>=t.targetOnsetPerfMs&&now<t.targetOnsetPerfMs+this.config.responseWindowMs)t.responseIndex=index
  }
  interrupt(kind:AntTrial['interruptions'][number]['kind'],now:number):void {
    if(this.stage==='complete')return
    const at=Number.isFinite(now)?Math.max(this.previous,now):this.previous
    if(this.core.interruptions.length<32)this.core.interruptions.push({kind,atPerfMs:at});else this.core.eventOverflow=true
    if(this.core.targetOnsetPerfMs!==null&&this.core.targetOffsetPerfMs===null)this.core.targetOffsetPerfMs=at
    this.core.timedOut=this.core.responseIndex===null&&this.core.targetOnsetPerfMs!==null
      &&at>=this.core.targetOnsetPerfMs+this.config.responseWindowMs
    this.finish(at)
  }
  private finish(now:number){this.core.endedAtPerfMs=now;this.previous=now;this.stage='complete'}
  record():AntRawRecord {
    if(this.stage!=='complete')throw Error('ANT exposure record is not complete')
    return structuredClone({schemaVersion:1,contextId:this.contextId,phase:this.plan.phase,key:this.practice?`practice:${this.practice.round}:${this.plan.trialIndex}`:this.plan.phase+':'+this.plan.trialIndex,
      core:this.core,raw:{display:this.display,frameTimesPerfMs:this.frames,frameOverflow:this.frameOverflow,
        diagnostics:this.diagnostics,fixture:this.fixture,...(this.practice?{practice:{...this.practice,timing:this.config}}:{})}})
  }
}
