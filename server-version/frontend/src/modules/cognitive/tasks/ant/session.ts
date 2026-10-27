import { antPlan,antCaptureTiming,isAntGuidedConfig,type AntConfig } from './generated/protocol'
import { AntCapture,type AntRawRecord } from './capture'
import type { AntFrozenDisplay } from './display'
import { antDigest,freezeAntValue } from './seal'
import { AntLocalQueue,type PersistAntLocalDraft } from './local-save'
export type AntView='intro'|'running'|'practice-item-feedback'|'practice-instructions'|'practice-feedback'|'break'|'saving'|'error'|'terminated'|'complete'
export interface AntCompletion {
  contextId:string;configHash:string;protocolSignature:string;localRecordKeys:string[];localDurableCount:number;
  status:'complete'|'limited';reason:string|null;fixture:boolean;localRecordSetDigest:string;requestDigest:string;
}
export interface AntExposureClaim { contextId:string;durable:true;fresh:true;claimId:string }
export interface AntServerReceipt { contextId:string;serverSaved:boolean;receiptId?:string;configHash:string;protocolSignature:string;localRecordSetDigest:string;requestDigest:string }
export interface AntSessionOptions {
  contextId:string;config:AntConfig;seed:string;display:AntFrozenDisplay;fixture:boolean;
  persistLocalDraft:PersistAntLocalDraft;
  onTaskComplete:(completion:AntCompletion)=>Promise<AntServerReceipt|null>;
  now:()=>number;timeOrigin:()=>number|null;
  paint:(capture:AntCapture|null)=>void;onChange:()=>void;
}
/** One continuous 4s block. Local persistence is serial and never awaited on the paint path. */
export class AntSession {
  view:AntView='intro';capture:AntCapture|null=null;phase:'practice'|'test'='practice';index=0
  practiceRound=0;practiceCorrect=0;practicePassed=false;lastPractice:AntRawRecord|null=null
  get practicePolicy(){return isAntGuidedConfig(this.options.config)?this.options.config.practicePolicy:null}
  get needsExposureClaim(){return !this.exposureAuthorized}
  get canRetryPractice(){return !!this.practicePolicy&&!this.practicePassed&&this.practiceRound+1<this.practicePolicy.maxRounds}
  serverSaved=false;serverReceiptId:string|null=null;reason:string|null=null
  private armed=false;private closed=false;private terminated=false;private completionRunning=false;private finalPromise:Promise<void>|null=null
  private exposureAuthorized=false
  authorizeExposure(claim:AntExposureClaim){
    if(this.view!=='intro'||this.exposureAuthorized||claim?.contextId!==this.options.contextId
      ||claim.durable!==true||claim.fresh!==true||!claim.claimId)throw Error('ANT fresh durable attempt marker required')
    this.exposureAuthorized=true
  }
  private practiceComplete=false;private savedBoundary:AntView='intro'
  readonly queue:AntLocalQueue
  private practice:ReturnType<typeof antPlan>
  private readonly formal:ReturnType<typeof antPlan>
  constructor(readonly options:AntSessionOptions){
    this.options={...options,config:freezeAntValue(structuredClone(options.config)),display:freezeAntValue(structuredClone(options.display))}
    options=this.options
    this.practice=antPlan(options.config,options.seed,'practice');this.formal=antPlan(options.config,options.seed)
    this.queue=new AntLocalQueue(options.contextId,options.persistLocalDraft,reason=>{
      if(this.closed)return
      // A later local failure must still expose retry after an earlier blur/resize stop.
      // Keep the original interruption, sealed raw record and digest unchanged.
      if(this.terminated){this.view='error';this.change();return}
      this.stop(reason,options.now())
    })
  }
  private change(){if(!this.closed)this.options.onChange()}
  startPractice(){
    if(this.closed||this.terminated||(this.view!=='intro'&&this.view!=='practice-instructions'))return
    if(!this.exposureAuthorized)throw Error('ANT fresh durable attempt marker required')
    if(this.view==='practice-instructions'){
      if(!this.canRetryPractice)return
      this.practiceRound++;this.practice=antPlan(this.options.config,this.options.seed,'practice',this.practiceRound)
    }
    this.practiceComplete=false;this.practicePassed=false;this.practiceCorrect=0;this.lastPractice=null
    this.arm('practice',0)
  }
  reviewPracticeInstructions(){
    if(this.closed||this.terminated||this.view!=='practice-feedback'||!this.canRetryPractice)return
    this.view='practice-instructions';this.change()
  }
  nextPracticeTrial(){
    if(this.closed||this.terminated||this.view!=='practice-item-feedback'||!this.practicePolicy)return
    this.arm('practice',this.index)
  }
  endPractice(){if(this.view==='practice-feedback'&&!this.practicePassed)this.stop('practice_not_passed',this.options.now())}
  get lastPracticeCorrect(){return !!this.lastPractice&&this.practiceRecordCorrect(this.lastPractice)}
  private practiceRecordCorrect(record:AntRawRecord){
    const t=record.core,response=t.responseIndex===null?null:t.events[t.responseIndex]
    return !!response&&response.direction===t.direction&&!t.timedOut&&!t.interruptions.length&&!t.eventOverflow
      &&t.targetOnsetPerfMs!==null&&!t.events.some(e=>!e.repeat&&!e.held&&e.atPerfMs<t.targetOnsetPerfMs!)
  }
  startFormal(){if(this.view!=='practice-feedback'||!this.practiceComplete||this.terminated||this.closed)return;this.arm('test',0)}
  continueBlock(){if(this.view!=='break'||this.terminated||this.closed)return;this.arm('test',this.index)}
  private arm(phase:'practice'|'test',index:number){this.phase=phase;this.index=index;this.armed=true;this.capture=null;this.view='running';this.change()}
  tick(now:number){
    if(this.closed||this.view!=='running')return
    if(this.armed){this.armed=false;this.capture=this.create(now)}
    else this.capture?.tick(now)
    const value=this.capture
    if(!value)return
    if(value.stage==='complete'){
      this.capture=null
      const record=value.record()
      this.queue.enqueue(record)
      if(this.terminated||this.queue.failed){this.change();return}
      const early=record.core.events.some(e=>!e.repeat&&!e.held
        &&(record.core.targetOnsetPerfMs===null||e.atPerfMs<record.core.targetOnsetPerfMs))
      const timing=value.config
      const t=record.core,onset=t.targetOnsetPerfMs,response=t.responseIndex===null?null:t.events[t.responseIndex]
      const missing=t.cueOnsetPerfMs===null||t.cueOffsetPerfMs===null||onset===null||t.targetOffsetPerfMs===null
        ||(!response&&!t.timedOut)
      const badDuration=!missing&&[
        t.cueOnsetPerfMs!-t.startedAtPerfMs-t.plannedPreCueMs,t.cueOffsetPerfMs!-t.cueOnsetPerfMs!-timing.cueMs,
        onset!-t.cueOffsetPerfMs!-timing.postCueMs,
        t.targetOffsetPerfMs!-(response?.atPerfMs??(onset!+timing.responseWindowMs)),
        t.endedAtPerfMs-t.startedAtPerfMs-timing.trialIntervalMs,
      ].some(d=>Math.abs(d)>this.options.config.phaseToleranceMs)
      if(record.core.interruptions.length||record.core.eventOverflow||missing||badDuration||(this.phase==='practice'&&!this.practicePolicy&&early)){
        this.stop('practice_or_render_record_incomplete',now);return
      }
      this.index++
      if(this.phase==='practice'&&this.practicePolicy){
        this.lastPractice=record;this.options.paint(null);this.view='saving';this.change()
        void this.afterLocalBoundary(this.index===this.practice.length?'practice-feedback':'practice-item-feedback')
        return
      }
      const boundary=this.phase==='practice'?this.index===this.practice.length:
        this.index===this.formal.length||this.index%(this.options.config.totalTrials/this.options.config.blocks)===0
      if(boundary){
        this.options.paint(null)
        this.view='saving';this.change()
        const next=this.phase==='practice'?'practice-feedback':this.index===this.formal.length?'complete':'break'
        this.savedBoundary=next
        void this.afterLocalBoundary(next)
        return
      }
      this.capture=this.create(now) // same actual paint as previous end; no network/extra ITI
    }
    try{this.options.paint(this.capture)}catch{this.stop('render_failed',now)}
  }
  private create(now:number){return new AntCapture(antCaptureTiming(this.options.config,this.phase),(this.phase==='practice'?this.practice:this.formal)[this.index],
    this.options.display,this.options.contextId,now,this.options.timeOrigin(),this.options.fixture,
    this.phase==='practice'&&this.practicePolicy?{policyVersion:this.practicePolicy.version,round:this.practiceRound}:undefined)}
  private async afterLocalBoundary(next:AntView){
    const ok=await this.queue.wait()
    if(this.closed||this.terminated)return
    if(!ok){this.stop('local_write_unconfirmed',this.options.now());return}
    if(next==='practice-feedback'){
      if(this.practicePolicy){
        const rows=this.records().filter(r=>r.phase==='practice'&&r.raw.practice?.round===this.practiceRound)
        this.practiceCorrect=rows.filter(r=>this.practiceRecordCorrect(r)).length
        this.practicePassed=rows.length===this.practice.length&&this.practiceCorrect>=this.practicePolicy.minimumCorrect
        this.practiceComplete=this.practicePassed
      }else this.practiceComplete=true
    }
    this.view=next;this.change()
    if(next==='complete')await this.finalize()
  }
  stop(reason:string,now:number){
    if(this.terminated||this.closed)return
    this.terminated=true;this.reason=reason;this.armed=false
    const value=this.capture;this.capture=null
    if(value&&value.stage!=='complete'){
      const kind=reason==='visibility_lost'||reason==='window_blur'||reason==='viewport_changed'||reason==='clock_discontinuity'
        ||reason==='runner_restart'?reason:'render_failed'
      value.interrupt(kind,now)
      this.queue.enqueue(value.record())
    }
    try{this.options.paint(null)}catch{/* Failed rendering remains an explicit interruption. */}
    this.view=this.queue.failed?'error':'terminated';this.change()
    void this.queue.wait().then(()=>this.change())
  }
  async retryLocal(){
    if(this.closed||!this.queue.failed)return
    this.view='saving';this.change()
    const ok=await this.queue.retry()
    if(this.closed)return
    this.view=ok?'terminated':'error';this.change()
    // A recovered write never starts another exposure or invents a block boundary.
  }
  finalize():Promise<void>{
    if(this.finalPromise)return this.finalPromise
    if(this.closed||this.completionRunning||this.serverSaved||(!this.terminated&&this.view!=='complete')||this.queue.records().length===0)return Promise.resolve()
    this.completionRunning=true
    this.finalPromise=this.finalizeOnce().finally(()=>{this.finalPromise=null;this.completionRunning=false})
    return this.finalPromise
  }
  private async finalizeOnce(){
    const ok=await this.queue.wait();if(this.closed||!ok)return
    const localRecordSetDigest=antDigest(this.queue.sealedRecordSet())
    const base={contextId:this.options.contextId,configHash:this.options.display.configHash,
      protocolSignature:this.options.display.protocolSignature,localRecordKeys:this.queue.records().map(r=>r.key),
      localDurableCount:this.queue.durableCount,status:(this.terminated?'limited':'complete') as 'limited'|'complete',reason:this.reason,fixture:this.options.fixture,localRecordSetDigest}
    const completion:AntCompletion={...base,requestDigest:antDigest(base)}
    try{
      const receipt=await this.options.onTaskComplete(completion)
      if(this.closed)return
      this.serverSaved=receipt?.contextId===this.options.contextId&&receipt.serverSaved===true&&!!receipt.receiptId
        &&receipt.configHash===completion.configHash&&receipt.protocolSignature===completion.protocolSignature
        &&receipt.localRecordSetDigest===completion.localRecordSetDigest&&receipt.requestDigest===completion.requestDigest
      this.serverReceiptId=this.serverSaved?receipt!.receiptId!:null
    }catch{if(!this.closed)this.serverSaved=false}
    finally{this.change()}
  }
  records():AntRawRecord[]{return this.queue.records()}
  close(){if(this.closed)return;this.stop('runner_restart',this.options.now());this.closed=true}
}
