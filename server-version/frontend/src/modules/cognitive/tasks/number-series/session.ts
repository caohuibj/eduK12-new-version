import {NumberSeriesCapture} from './capture'
import {isNumberSeriesReport} from './generated/report'
import {reviewNumberSeriesRaw,type InputMode,type NumberSeriesPlan} from './generated/protocol'
import {digest,numberSeriesManifest,validateNumberSeriesContext,type NumberSeriesContext,type NumberSeriesPorts,type NumberSeriesDraft,type NumberSeriesFinal,type NumberSeriesReceipt} from './contracts'
export type NumberSeriesView='intro'|'preparing'|'practice-ready'|'presenting'|'running'|'saving-item'|'practice-feedback'|'practice-instructions'|'formal-ready'|'item-ready'|'break'|'retry'|'saving-final'|'report'|'stopped'|'blocked'
export class NumberSeriesSession {
  readonly context:NumberSeriesContext;readonly manifest:ReturnType<typeof numberSeriesManifest>
  readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
  view:NumberSeriesView='intro';phase:'practice'|'test'='practice';round=0;practiceIndex=0;practiceCorrect=0;practiceFailed=false;practiceIncomplete=false;formalIndex=0
  capture:NumberSeriesCapture|null=null;activePlan:NumberSeriesPlan|null=null;lastRaw:NumberSeriesDraft['raw']|null=null;receipt:NumberSeriesReceipt|null=null;reason=''
  private opened=false;private disposed=false;private busy=false;private ended=false
  private records:NumberSeriesDraft[]=[];private pending:NumberSeriesDraft|null=null;private finalClaim:NumberSeriesFinal|null=null;private ports:NumberSeriesPorts
  constructor(context:NumberSeriesContext,ports:NumberSeriesPorts,private changed:()=>void,private now=()=>performance.now()) {
    this.context=validateNumberSeriesContext(context);this.manifest=numberSeriesManifest(this.context)
    this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}
  }
  get retained(){return structuredClone([...this.records,...(this.pending?[this.pending]:[])])}
  get practicePassed(){return this.practiceIndex===3&&this.practiceCorrect===3&&!this.practiceFailed}
  get practiceRoundFinished(){return this.practiceIndex===3||this.practiceIncomplete}
  get canRetryPractice(){return this.round<2}
  async prepare() {
    if(this.view!=='intro'||this.opened||this.disposed)return
    this.view='preparing';this.changed()
    try {
      const r=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm})
      if(this.disposed)return
      if(r.fresh!==true||r.contextKey!==this.context.contextKey||r.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('Fresh durable attempt was not confirmed')
      this.opened=true;this.view='practice-ready';this.changed()
    }catch{if(!this.disposed){this.reason='attempt-not-confirmed';this.view='blocked';this.changed()}}
  }
  begin() {
    if(this.disposed||!this.opened||!['practice-ready','practice-instructions','formal-ready','item-ready','break'].includes(this.view))return
    if(this.view==='practice-instructions'){
      if(!this.canRetryPractice)return
      this.round++;this.practiceIndex=0;this.practiceCorrect=0;this.practiceFailed=false;this.practiceIncomplete=false;this.lastRaw=null
    }
    if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test'}
    this.presentNext()
  }
  private presentNext() {
    this.activePlan=this.phase==='test'?this.manifest.formal[this.formalIndex]:this.manifest.practice[this.round][this.practiceIndex]
    if(!this.activePlan)throw Error('Number-series plan exhausted')
    this.capture=null;this.lastRaw=null;this.view='presenting';this.changed()
  }
  /** Called by React layout effect after this row was committed, not by a pre-render click clock. */
  expose(now:number) {
    if(this.disposed||this.view!=='presenting'||!this.activePlan)return
    this.capture=new NumberSeriesCapture(this.activePlan,now);this.view='running';this.changed()
  }
  answer(choice:number,input:InputMode,key:string|null,now:number,repeat=false) {
    if(this.disposed||this.view!=='running'||!this.capture)return
    this.capture.answer(choice,input,key,now,repeat);if(this.capture.done)this.captureDone()
  }
  skip(input:InputMode,now:number){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.skip(input,now);this.captureDone()}
  private captureDone() {
    const raw=this.capture!.raw;this.capture=null;this.lastRaw=structuredClone(raw)
    const result=reviewNumberSeriesRaw(raw,this.activePlan!)
    if(this.phase==='practice'){if(result.correct)this.practiceCorrect++;else this.practiceFailed=true;if(raw.status==='interrupted')this.practiceIncomplete=true}
    if(raw.status==='interrupted'&&this.phase==='test'){this.ended=true;this.reason=raw.stopReason??'interrupted'}
    const base={contextKey:this.context.contextKey,phase:this.phase,round:raw.plan.round,index:raw.plan.index,raw,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,realm:{...this.realm},recordKey:`${this.phase}:${raw.plan.round}:${raw.plan.index}`}
    this.pending={...base,recordDigest:digest(base)};this.view='saving-item';this.changed();void this.persist()
  }
  private async persist() {
    if(this.busy||!this.pending)return
    this.busy=true
    try {
      const record=this.pending,r=await this.ports.persistLocalDraft(structuredClone(record))
      if(r.retained!==true||r.contextKey!==record.contextKey||r.recordKey!==record.recordKey||r.recordDigest!==record.recordDigest)throw Error('Draft retention not confirmed')
      this.records.push(record);this.pending=null
      if(this.disposed)return
      if(this.phase==='practice'){this.practiceIndex++;this.view='practice-feedback'}
      else{this.formalIndex++;this.view=this.ended||this.formalIndex===this.context.snapshot.config.totalItems?'saving-final':this.manifest.formal[this.formalIndex].blockIndex!==record.raw.plan.blockIndex?'break':'item-ready'}
      this.changed()
    }catch{if(!this.disposed){this.view='retry';this.changed()}}
    finally{this.busy=false;if(!this.disposed&&this.view==='saving-final')void this.finish()}
  }
  nextPractice(){if(this.disposed||this.view!=='practice-feedback'||this.practiceRoundFinished)return;this.presentNext()}
  acceptPractice(){if(this.disposed||this.view!=='practice-feedback'||!this.practicePassed)return;this.view='formal-ready';this.changed()}
  reviewInstructions(){if(this.disposed||this.view!=='practice-feedback'||!this.practiceRoundFinished||!this.practiceFailed||!this.canRetryPractice)return;this.view='practice-instructions';this.changed()}
  endPractice(){if(this.disposed||this.phase!=='practice'||!['intro','practice-ready','practice-feedback','practice-instructions','formal-ready'].includes(this.view))return;this.reason='practice-ended';this.view='stopped';this.changed()}
  stop(reason:string,now:number) {
    if(this.disposed||!['running','presenting','saving-item','item-ready','break'].includes(this.view))return
    if(this.phase==='test'){this.ended=true;if(!this.reason)this.reason=reason}
    if(this.capture){this.capture.interrupt(reason,now);this.captureDone()}
    else if(this.view==='saving-item'){if(this.phase==='practice'){this.practiceFailed=true;this.practiceIncomplete=true}}
    else if(this.phase==='test'){this.view='saving-final';this.changed();void this.finish()}
    else{this.practiceFailed=true;this.practiceIncomplete=true;this.view='practice-feedback';this.changed()}
  }
  async retry(){if(this.disposed||this.busy||this.view!=='retry')return;if(this.pending)await this.persist();else await this.finish()}
  private async finish() {
    if(this.disposed||this.busy||this.pending||this.phase!=='test')return
    this.busy=true;this.view='saving-final';this.changed()
    try {
      if(!this.finalClaim){const claim={contextKey:this.context.contextKey,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,formalCount:this.records.filter(r=>r.phase==='test').length,practiceCount:this.records.filter(r=>r.phase==='practice').length,termination:(!this.ended&&this.formalIndex===this.context.snapshot.config.totalItems?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.finalClaim={...claim,finalPayloadDigest:digest(claim)}}
      const r=await this.ports.finalize(structuredClone(this.finalClaim))
      if(this.disposed)return
      if(r.finalSaved!==true||r.contextKey!==this.context.contextKey||r.finalPayloadDigest!==this.finalClaim.finalPayloadDigest||!r.receiptId||!isNumberSeriesReport(r.report,{configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,profile:this.context.snapshot.config.profile,received:this.finalClaim.formalCount}))throw Error('Matching frozen saved report not confirmed')
      this.receipt=structuredClone(r);this.view='report';this.changed()
    }catch{if(!this.disposed){this.view='retry';this.changed()}}
    finally{this.busy=false}
  }
  dispose(){if(this.disposed)return;if(['running','presenting','saving-item','item-ready','break'].includes(this.view))this.stop('context-disposed',this.now());this.disposed=true}
}
