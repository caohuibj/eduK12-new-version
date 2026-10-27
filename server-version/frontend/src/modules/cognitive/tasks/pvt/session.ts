import {PvtCapture,type PvtInputEvent} from './capture'
import {pvtManifest,validatePvtContext,same,type PvtDraft,type PvtFinal} from './generated/protocol'
import {pvtStats,reviewPvt} from './generated/analysis'
import {isPvtReport,pvtReportStats} from './generated/report'
import {digest,type PvtContext,type PvtPorts,type PvtReceipt} from './contracts'
export type PvtView='intro'|'preparing'|'practice-ready'|'running'|'practice-feedback'|'practice-result'|'practice-instructions'|'formal-ready'|'saving'|'retry'|'report'|'stopped'|'blocked'
export class PvtSession {
  readonly context:PvtContext;readonly manifest:ReturnType<typeof pvtManifest>;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
  view:PvtView='intro';phase:'practice'|'test'='practice';capture:PvtCapture|null=null;receipt:PvtReceipt|null=null;round=0;index=0;practiceComplete=0;feedback:'responded'|'early'|'timeout'|null=null;reason=''
  private held:string[]=[];private records:PvtDraft[]=[];private saved=0;private writing=false;private finalizing=false;private opened=false;private disposed=false;private final:PvtFinal|null=null;private phaseStarted=0;private feedbackUntil=0;private ports:PvtPorts
  constructor(context:PvtContext,ports:PvtPorts,private changed:()=>void,private now=()=>performance.now()){
    this.context=validatePvtContext(context,digest);this.manifest=pvtManifest(this.context.snapshot.config,this.context.randomSeed)
    this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}
  }
  get retained(){return structuredClone(this.records)}
  get pending(){return this.saved!==this.records.length}
  get practicePassed(){return this.practiceComplete===3&&this.index===3}
  get canRetryPractice(){return this.round<1}
  private notify(){if(!this.disposed)this.changed()}
  async prepare(){if(this.disposed||this.opened||this.view!=='intro')return;this.view='preparing';this.notify()
    try{const r=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm});if(this.disposed)return
      if(r.fresh!==true||r.contextKey!==this.context.contextKey||r.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('Fresh PVT attempt required')
      this.opened=true;this.view='practice-ready';this.notify()
    }catch{if(!this.disposed){this.view='blocked';this.reason='local-attempt-not-confirmed';this.notify()}}}
  begin(now:number){if(this.disposed||!this.opened||this.pending||!['practice-ready','practice-instructions','formal-ready'].includes(this.view))return
    if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceComplete=0;this.index=0;this.reason=''}
    if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test';this.index=0;this.reason=''}
    this.phaseStarted=now;this.feedback=null;this.start(now)
  }
  private start(now:number){const plan=this.phase==='test'?this.manifest.formal[this.index]:this.manifest.practice[this.round][this.index]
    if(!plan)throw Error('PVT wait reservoir exhausted');this.capture=new PvtCapture(this.context.snapshot.config,plan,this.phaseStarted,now,this.held);this.view='running';this.notify()}
  tick(now:number){if(this.disposed)return
    if(this.view==='practice-feedback'&&now>=this.feedbackUntil){this.view='practice-result';this.notify();return}
    if(this.view!=='running'||!this.capture)return
    const onset=this.capture.targetOnsetMs,feedback=this.capture.inFeedback;this.capture.tick(now)
    if(this.capture.done)this.closeCapture(now);else if(onset!==this.capture.targetOnsetMs||feedback!==this.capture.inFeedback)this.notify()
  }
  input(event:PvtInputEvent){if(this.disposed)return
    if(!this.capture){const held=new Set(this.held);if(event.kind==='up')held.delete(event.token);else if(!event.repeat&&held.size<16)held.add(event.token);this.held=[...held].sort();return}
    this.capture.input(event);if(this.capture.done)this.closeCapture(event.atMs)
  }
  private closeCapture(now:number){const cap=this.capture!,raw=structuredClone(cap.raw),review=cap.review;this.capture=null;this.held=review.heldAfter
    const base={contextKey:this.context.contextKey,raw,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,realm:{...this.realm},recordKey:`${raw.plan.phase}:${raw.plan.round}:${raw.plan.index}`}
    this.records.push({...base,recordDigest:digest(base)});this.index++
    if(this.phase==='practice'){
      if(raw.outcome==='responded')this.practiceComplete++
      this.feedback=raw.outcome==='responded'?'responded':raw.outcome==='early'?'early':'timeout'
      if(raw.outcome!=='responded'){this.reason=raw.stopReason||raw.outcome;this.view=this.canRetryPractice?'practice-instructions':'stopped';this.notify()}
      else if(this.index===3){this.feedbackUntil=now+this.context.snapshot.config.practice.feedbackMs;this.view='practice-feedback';this.notify()}else this.start(now)
    }else if(review.completedBudget||raw.outcome==='interrupted'){
      this.reason=review.completedBudget?'':raw.stopReason||'interrupted';this.view='saving';this.notify()
    }else{this.feedback=raw.outcome==='responded'?'responded':raw.outcome==='early'?'early':'timeout';this.start(now)}
    void this.drain()
  }
  private async drain(){if(this.writing)return;this.writing=true
    try{while(this.saved<this.records.length){const record=this.records[this.saved],r=await this.ports.persistLocalDraft(structuredClone(record))
      if(r.retained!==true||r.contextKey!==record.contextKey||r.recordKey!==record.recordKey||r.recordDigest!==record.recordDigest)throw Error('PVT durable receipt mismatch')
      this.saved++;this.notify()}
    }catch{if(this.capture){const now=this.now();this.capture.stop('local-save-not-confirmed',now);this.closeCapture(now)}this.view='retry';this.notify()
    }finally{this.writing=false;if(!this.disposed&&this.view==='saving'&&!this.pending)void this.finish()}}
  acceptPractice(){if(this.disposed||this.view!=='practice-result'||!this.practicePassed||this.pending)return;this.view='formal-ready';this.notify()}
  stop(reason:string,now:number){if(this.disposed)return
    if(this.capture){this.capture.stop(reason,now);this.closeCapture(now)}
    else if(this.phase==='practice'&&!['blocked','preparing','retry','stopped'].includes(this.view)){this.view='stopped';this.notify()}}
  async retry(){if(this.disposed||this.writing||this.finalizing||this.view!=='retry')return;this.view=this.phase==='test'?'saving':this.practicePassed?(this.now()<this.feedbackUntil?'practice-feedback':'practice-result'):this.canRetryPractice?'practice-instructions':'stopped';this.notify();await this.drain()}
  private async finish(){if(this.disposed||this.pending||this.finalizing||this.phase!=='test'||this.view!=='saving')return;this.finalizing=true
    try{if(!this.final){const formal=this.records.filter(r=>r.raw.plan.phase==='test'),last=formal[formal.length-1],completed=!!last&&reviewPvt(last.raw,last.raw.plan,this.context.snapshot.config).completedBudget
      const claim={contextKey:this.context.contextKey,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,formalCount:formal.length,practiceCount:this.records.length-formal.length,termination:(completed?'completed':'aborted') as 'completed'|'aborted',terminationReason:completed?null:this.reason||'interrupted',recordDigests:this.records.map(r=>r.recordDigest)};this.final={...claim,finalPayloadDigest:digest(claim)}}
      const receipt=await this.ports.finalize(structuredClone(this.final));if(this.disposed)return
      const formal=this.records.filter(r=>r.raw.plan.phase==='test'),stats=pvtStats(formal.map(r=>({raw:r.raw,review:reviewPvt(r.raw,r.raw.plan,this.context.snapshot.config)})))
      if(receipt.finalSaved!==true||receipt.contextKey!==this.context.contextKey||receipt.finalPayloadDigest!==this.final.finalPayloadDigest||!receipt.receiptId||!isPvtReport(receipt.report,{configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,profile:this.context.snapshot.config.profile,teachingLanguage:this.context.language,received:this.final.formalCount})||!same(receipt.report.stats,pvtReportStats(stats))||receipt.report.finishedBudget!==(this.final.termination==='completed'))throw Error('Matching frozen PVT final receipt required')
      this.receipt=structuredClone(receipt);this.view='report';this.notify()
    }catch{if(!this.disposed){this.view='retry';this.notify()}}finally{this.finalizing=false}}
  dispose(){if(this.capture)this.stop('context-disposed',this.now());this.disposed=true}
}
