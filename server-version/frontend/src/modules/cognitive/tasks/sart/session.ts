import {SartCapture,type SartInputEvent} from './capture'
import {isSartReport} from './generated/report'
import {digest,sartManifest,validateSartContext,type SartContext,type SartPorts,type SartDraft,type SartFinal,type SartReceipt} from './contracts'
export type SartView='intro'|'preparing'|'practice-ready'|'running'|'practice-feedback'|'practice-result'|'practice-instructions'|'formal-ready'|'saving'|'retry'|'report'|'stopped'|'blocked'
export class SartSession {
  readonly context:SartContext;readonly manifest:ReturnType<typeof sartManifest>;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
  view:SartView='intro';phase:'practice'|'test'='practice';capture:SartCapture|null=null;receipt:SartReceipt|null=null
  round=0;practiceIndex=0;formalIndex=0;goCorrect=0;noGoCorrect=0;practiceComplete=0;lastCorrect:boolean|null=null;reason=''
  private held:string[]=[];private records:SartDraft[]=[];private saved=0;private writing=false;private finalizing=false;private opened=false;private disposed=false;private aborted=false;private final:SartFinal|null=null;private feedbackUntil=0;private ports:SartPorts
  constructor(context:SartContext,ports:SartPorts,private changed:()=>void,private now=()=>performance.now()){
    this.context=validateSartContext(context);this.manifest=sartManifest(this.context)
    this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}
  }
  get retained(){return structuredClone(this.records)}
  get pending(){return this.saved!==this.records.length}
  get practicePassed(){return this.practiceIndex===9&&this.practiceComplete===9&&this.goCorrect>=7&&this.noGoCorrect===1}
  get canRetryPractice(){return this.round<2}
  private notify(){if(!this.disposed)this.changed()}
  async prepare(){if(this.view!=='intro'||this.opened||this.disposed)return;this.view='preparing';this.notify()
    try{const receipt=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm});if(this.disposed)return
      if(receipt.fresh!==true||receipt.contextKey!==this.context.contextKey||receipt.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('Fresh durable SART identity required')
      this.opened=true;this.view='practice-ready';this.notify()
    }catch{if(!this.disposed){this.view='blocked';this.reason='local-attempt-not-confirmed';this.notify()}}}
  begin(now:number){if(this.disposed||!this.opened||this.pending||!['practice-ready','practice-instructions','formal-ready'].includes(this.view))return
    if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceIndex=0;this.practiceComplete=0;this.goCorrect=0;this.noGoCorrect=0;this.lastCorrect=null;this.aborted=false;this.reason=''}
    if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test';this.aborted=false;this.reason=''}
    this.held=[];this.start(now)
  }
  private start(now:number){const plan=this.phase==='test'?this.manifest.formal[this.formalIndex]:this.manifest.practice[this.round][this.practiceIndex]
    if(!plan)throw Error('SART plan exhausted');this.capture=new SartCapture(plan,now,this.held);this.view='running';this.notify()}
  tick(now:number){if(this.disposed)return
    if(this.view==='practice-feedback'&&now>=this.feedbackUntil){if(this.practiceIndex===9){this.view='practice-result';this.notify()}else this.start(now);return}
    if(this.view!=='running'||!this.capture)return;const masked=this.capture.masked;this.capture.tick(now)
    if(this.capture.done)this.closeCapture(now);else if(masked!==this.capture.masked)this.notify()
  }
  input(e:SartInputEvent){if(this.disposed)return
    if(this.view==='practice-feedback'){const held=new Set(this.held);if(e.kind==='up')held.delete(e.token);else if(held.size<16)held.add(e.token);this.held=[...held].sort();return}
    if(this.view!=='running'||!this.capture)return;this.capture.input(e);if(this.capture.done)this.closeCapture(e.atMs)}
  private closeCapture(now:number){const capture=this.capture!,raw=structuredClone(capture.raw),review=capture.review;this.capture=null;this.held=review.heldAfter
    const base={contextKey:this.context.contextKey,phase:this.phase,round:raw.plan.round,index:raw.plan.index,raw,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,realm:{...this.realm},recordKey:`${this.phase}:${raw.plan.round}:${raw.plan.index}`}
    // Synchronously retain the exact original before any asynchronous callback.
    this.records.push({...base,recordDigest:digest(base)})
    if(raw.status!=='complete'){this.aborted=true;this.reason=this.reason||raw.stopReason||'interrupted'}
    if(this.phase==='practice'){
      this.practiceIndex++;if(review.complete){this.practiceComplete++;if(review.correct){if(raw.plan.digit===3)this.noGoCorrect++;else this.goCorrect++}}
      this.lastCorrect=review.correct;this.feedbackUntil=now+this.context.snapshot.config.practice.feedbackMs
      this.view=raw.status==='complete'?'practice-feedback':this.canRetryPractice?'practice-instructions':'stopped';this.notify()
    }else{this.formalIndex++;if(raw.status==='complete'&&this.formalIndex<this.manifest.formal.length)this.start(now);else{this.view='saving';this.notify()}}
    void this.drain()
  }
  private async drain(){if(this.writing)return;this.writing=true
    try{while(this.saved<this.records.length){const record=this.records[this.saved],receipt=await this.ports.persistLocalDraft(structuredClone(record))
        if(receipt.retained!==true||receipt.contextKey!==record.contextKey||receipt.recordKey!==record.recordKey||receipt.recordDigest!==record.recordDigest)throw Error('SART durable receipt mismatch')
        this.saved++;this.notify()}
    }catch{if(this.capture||this.phase==='practice'){this.aborted=true;this.reason=this.reason||'local-save-not-confirmed'}
      if(this.capture){this.capture.interrupt(this.reason,this.now());this.closeCapture(this.now())}this.view='retry';this.notify()
    }finally{this.writing=false;if(!this.disposed&&this.view==='saving'&&!this.pending)void this.finish()}}
  acceptPractice(){if(this.disposed||this.view!=='practice-result'||!this.practicePassed||this.pending)return;this.view='formal-ready';this.notify()}
  reviewInstructions(){if(this.disposed||this.view!=='practice-result'||this.practicePassed||!this.canRetryPractice)return;this.view='practice-instructions';this.notify()}
  endPractice(){if(this.disposed||this.phase!=='practice')return;if(this.capture){this.stop('practice-ended',this.now());return}this.view='stopped';this.notify()}
  stop(reason:string,now:number){if(this.disposed||!['running','practice-feedback','practice-result','formal-ready'].includes(this.view))return
    this.aborted=true;this.reason=this.reason||reason
    if(this.capture){this.capture.interrupt(reason,now);this.closeCapture(now)}
    else{this.view=this.phase==='practice'?(this.canRetryPractice?'practice-instructions':'stopped'):'saving';this.notify();if(this.phase==='test'&&!this.pending)void this.finish()}}
  async retry(){if(this.disposed||this.writing||this.finalizing||this.view!=='retry')return
    this.view=this.phase==='test'?'saving':this.canRetryPractice?'practice-instructions':'stopped';this.notify();await this.drain()
    if(this.phase==='test'&&!this.pending&&this.view==='saving')await this.finish()}
  private async finish(){if(this.disposed||this.pending||this.finalizing||this.phase!=='test'||this.view!=='saving')return;this.finalizing=true
    try{if(!this.final){const claim={contextKey:this.context.contextKey,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,formalCount:this.records.filter(r=>r.phase==='test').length,practiceCount:this.records.filter(r=>r.phase==='practice').length,
          termination:(!this.aborted&&this.formalIndex===this.manifest.formal.length?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.final={...claim,finalPayloadDigest:digest(claim)}}
      const receipt=await this.ports.finalize(structuredClone(this.final));if(this.disposed)return
      if(receipt.finalSaved!==true||receipt.contextKey!==this.context.contextKey||receipt.finalPayloadDigest!==this.final.finalPayloadDigest||!receipt.receiptId||!isSartReport(receipt.report,{configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,profile:this.context.snapshot.config.profile,received:this.final.formalCount}))throw Error('Matching frozen SART final receipt required')
      this.receipt=structuredClone(receipt);this.view='report';this.notify()
    }catch{if(!this.disposed){this.view='retry';this.notify()}}finally{this.finalizing=false}}
  dispose(){if(this.capture)this.stop('context-disposed',this.now());this.disposed=true}
}
