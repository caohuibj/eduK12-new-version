import {spatialPlan,signedError,targetAngle,type Input,type SpatialRaw,type SpatialPlan} from './generated/protocol'
import {isSpatialReport} from './generated/report'
import {SpatialCapture} from './capture'
import {digest,validateSpatialContext,type SpatialContext,type SpatialPorts,type SpatialDraft,type SpatialFinal,type SpatialReceipt} from './contracts'
export type SpatialView='intro'|'preparing'|'practice-ready'|'running'|'saving-item'|'practice-feedback'|'practice-instructions'|'formal-ready'|'break'|'retry'|'saving-final'|'report'|'stopped'|'blocked'
/** One realm only. Host supplies durable ports; no invented resume clock, server authority or raw archive success. */
export class SpatialSession {
  readonly context:SpatialContext;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
  view:SpatialView='intro';capture:SpatialCapture|null=null;receipt:SpatialReceipt|null=null;reason='';round=0;practiceCorrect=0;practiceIndex=0;formalIndex=0;phase:'practice'|'test'='practice'
  feedback:{errorDeg:number;target:number;response:number;passed:boolean}|null=null;private disposed=false;private opened=false;private aborted=false
  private formalPlan:SpatialPlan[];private practicePlans:SpatialPlan[][]
  private records:SpatialDraft[]=[];private pending:SpatialDraft|null=null;private final:SpatialFinal|null=null;private busy=false
  private readonly ports:SpatialPorts
  constructor(context:SpatialContext,ports:SpatialPorts,private changed:()=>void,private now:()=>number=()=>performance.now()){
    this.context=validateSpatialContext(context);this.formalPlan=spatialPlan(this.context.snapshot.config,this.context.randomSeed);this.practicePlans=[0,1,2].map(r=>spatialPlan(this.context.snapshot.config,this.context.randomSeed,'practice',r));this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}
  }
  get retained(){return structuredClone(this.records)}
  get practicePassed(){return this.practiceIndex===6&&this.practiceCorrect>=this.context.snapshot.config.practice.minimumCorrect}
  get canRetryPractice(){return this.round+1<this.context.snapshot.config.practice.maxRounds}
  async prepare(){if(this.view!=='intro'||this.disposed||this.opened)return;this.view='preparing';this.changed()
    try{const c=this.context,manifest=[...this.formalPlan,...this.practicePlans.flat()]
      const receipt=await this.ports.prepareLocalAttempt(structuredClone(c),structuredClone(manifest),{...this.realm})
      if(this.disposed)return
      if(receipt.fresh!==true||receipt.contextKey!==c.contextKey||receipt.bindingDigest!==digest({context:c,manifest,realm:this.realm}))throw Error('Fresh durable attempt not confirmed')
      this.opened=true;this.view='practice-ready';this.changed()
    }catch{if(!this.disposed){this.reason='local-attempt-not-confirmed';this.view='blocked';this.changed()}}}
  begin(now:number){if(this.disposed||!this.opened||!['practice-ready','practice-instructions','formal-ready','break'].includes(this.view))return
    if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceIndex=0;this.practiceCorrect=0;this.feedback=null}
    if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test'}
    this.start(now)
  }
  private start(now:number){const c=this.context,plan=this.phase==='practice'?this.practicePlans[this.round]:this.formalPlan
    const index=this.phase==='practice'?this.practiceIndex:this.formalIndex;if(!plan[index])throw Error('Spatial trial budget exhausted')
    this.capture=new SpatialCapture(c.snapshot.config,plan[index],now);this.view='running';this.changed()}
  tick(now:number){if(this.disposed||this.view!=='running'||!this.capture)return;const old=this.capture.stage,w=this.capture.raw.warningAtMs;this.capture.tick(now)
    if(this.capture.stage!==old||this.capture.raw.warningAtMs!==w)this.changed()}
  pointer(now:number,x:number,y:number,input:Exclude<Input,'keyboard'>,kind:'down'|'move'|'up',primary=true){if(this.disposed||this.view!=='running'||!this.capture)return
    this.capture.pointer(now,x,y,input,kind,primary);if(this.capture.stage==='complete'){this.stop(this.capture.raw.stopReason??'input-stopped',now);return}this.changed()}
  keyboard(now:number,delta:number|null){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.keyboard(now,delta)
    if(this.capture.stage==='complete'){this.stop(this.capture.raw.stopReason??'input-stopped',now);return}this.changed()}
  confirm(now:number){if(this.disposed||this.view!=='running'||!this.capture)return
    if(!this.capture.confirm(now)){if(this.capture.stage==='complete')this.stop(this.capture.raw.stopReason??'input-stopped',now);return}
    const raw=structuredClone(this.capture.raw);this.capture=null
    if(this.phase==='practice'){const errorDeg=Math.abs(signedError(raw.response!.angleDeg,targetAngle(raw.plan)));this.feedback={errorDeg,target:targetAngle(raw.plan),response:raw.response!.angleDeg,passed:errorDeg<=30};if(this.feedback.passed)this.practiceCorrect++}
    this.store(raw)
  }
  private store(raw:SpatialRaw){if(this.pending)throw Error('Previous spatial record is not durable')
    const c=this.context,base={contextKey:c.contextKey,recordKey:raw.plan.phase==='practice'?`practice:${raw.plan.round}:${raw.plan.index}`:`test:${raw.plan.index}`,
      configHash:c.snapshot.configHash,protocolSignature:c.snapshot.protocolSignature,manifestHash:c.manifestHash,realm:{...this.realm},raw:structuredClone(raw)}
    this.pending={...base,recordDigest:digest(base)};this.view='saving-item';this.changed();void this.persist()
  }
  private async persist(){if(this.busy)return;this.busy=true
    try{const record=this.pending;if(!record)return;const receipt=await this.ports.persistLocalDraft(structuredClone(record))
      if(receipt.retained!==true||receipt.contextKey!==record.contextKey||receipt.recordKey!==record.recordKey||receipt.recordDigest!==record.recordDigest)throw Error('Spatial local receipt mismatch')
      this.records.push(record);this.pending=null;if(this.disposed)return
      if(this.phase==='practice'){this.practiceIndex++;this.view=this.aborted?'stopped':'practice-feedback';this.changed()}
      else{this.formalIndex++;if(this.aborted||this.formalIndex===this.context.snapshot.config.totalTrials){this.view='saving-final';this.changed()}
        else if(this.formalIndex%40===0){this.view='break';this.changed()}else this.start(this.now())}
    }catch{if(!this.disposed){this.aborted=true;if(!this.reason)this.reason='local-save-failure';this.view='retry';this.changed()}}
    finally{this.busy=false;if(!this.disposed&&this.view==='saving-final')void this.finish()}}
  nextPractice(now:number){if(this.disposed||this.view!=='practice-feedback'||this.practiceIndex>=6)return;this.feedback=null;this.start(now)}
  acceptPractice(){if(this.disposed||this.view!=='practice-feedback'||!this.practicePassed)return;this.view='formal-ready';this.changed()}
  reviewInstructions(){if(this.disposed||this.view!=='practice-feedback'||this.practiceIndex!==6||this.practicePassed||!this.canRetryPractice)return;this.view='practice-instructions';this.changed()}
  endPractice(){if(this.disposed||this.phase!=='practice'||!['practice-feedback','practice-instructions','practice-ready'].includes(this.view))return;this.reason='practice-ended';this.view='stopped';this.changed()}
  stop(reason:string,now:number){if(this.disposed||!['running','saving-item','break','formal-ready'].includes(this.view))return
    this.aborted=true;if(!this.reason)this.reason=reason
    if(this.capture){this.capture.interrupt(reason,now);const raw=structuredClone(this.capture.raw);this.capture=null;this.store(raw)}
    else if(this.view==='saving-item')return
    else if(this.phase==='test'){this.view='saving-final';this.changed();void this.finish()}else{this.view='stopped';this.changed()}}
  async retry(){if(this.disposed||this.busy||this.view!=='retry')return
    if(this.pending)await this.persist();else await this.finish()}
  private async finish(){if(this.disposed||this.busy||this.pending||this.phase!=='test')return;this.busy=true;this.view='saving-final';this.changed()
    try{if(!this.final){const c=this.context,claim={contextKey:c.contextKey,configHash:c.snapshot.configHash,protocolSignature:c.snapshot.protocolSignature,manifestHash:c.manifestHash,
      formalCount:this.records.filter(r=>r.raw.plan.phase==='test').length,practiceCount:this.records.filter(r=>r.raw.plan.phase==='practice').length,
      termination:(!this.aborted&&this.formalIndex===c.snapshot.config.totalTrials?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.final={...claim,finalPayloadDigest:digest(claim)}}
      const r=await this.ports.finalize(structuredClone(this.final));if(this.disposed)return
      if(r?.finalSaved!==true||r.contextKey!==this.context.contextKey||r.finalPayloadDigest!==this.final.finalPayloadDigest||!r.receiptId||!isSpatialReport(r.report,{configHash:this.context.snapshot.configHash,
        protocolSignature:this.context.snapshot.protocolSignature,profile:this.context.snapshot.config.profile,received:this.final.formalCount}))throw Error('Matching saved report receipt required')
      this.receipt=structuredClone(r);this.view='report';this.changed()
    }catch{if(!this.disposed){if(!this.reason)this.reason='final-save-not-confirmed';this.view='retry';this.changed()}}finally{this.busy=false}}
  dispose(){if(this.capture&&this.view==='running')this.stop('context-disposed',this.now());this.disposed=true}
}
