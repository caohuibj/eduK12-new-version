import {HFCapture,type HFInputEvent} from './capture'
import {correctSide} from './generated/protocol'
import {isHFReport} from './generated/report'
import {digest,hfManifest,validateHFContext,type HFContext,type HFPorts,type HFDraft,type HFFinal,type HFReceipt} from './contracts'
export type HFView='intro'|'preparing'|'practice-ready'|'running'|'saving-item'|'feedback'|'practice-instructions'|'formal-ready'|'block-ready'|'retry'|'saving-final'|'report'|'stopped'|'blocked'
export class HFSession {
 readonly context:HFContext;readonly manifest:ReturnType<typeof hfManifest>;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
 view:HFView='intro';capture:HFCapture|null=null;receipt:HFReceipt|null=null;phase:'practice'|'test'='practice';round=0;practiceIndex=0;formalIndex=0;correct=0;lastFeedback:{correct:boolean;raw:HFDraft['raw']}|null=null;reason=''
 private opened=false;private disposed=false;private aborted=false;private practiceInterrupted=false;private busy=false;private records:HFDraft[]=[];private pending:HFDraft|null=null;private final:HFFinal|null=null;private ports:HFPorts;private held=new Set<string>()
 constructor(context:HFContext,ports:HFPorts,private changed:()=>void,private now=()=>performance.now()){this.context=validateHFContext(context);this.manifest=hfManifest(this.context);this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}}
 get retained(){return structuredClone([...this.records,...(this.pending?[this.pending]:[])])}
 get heldTokens(){return [...this.held]}
 get practicePassed(){return !this.practiceInterrupted&&this.practiceIndex===8&&this.correct>=7}
 get canRetryPractice(){return this.round+1<3}
 async prepare(){if(this.view!=='intro'||this.opened||this.disposed)return;this.view='preparing';this.changed();try{const receipt=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm});if(this.disposed)return
  if(receipt.fresh!==true||receipt.contextKey!==this.context.contextKey||receipt.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('Fresh durable identity required');this.opened=true;this.view='practice-ready';this.changed()
 }catch{if(!this.disposed){this.reason='local-attempt-not-confirmed';this.view='blocked';this.changed()}}}
 begin(now:number){if(this.disposed||!this.opened||!['practice-ready','practice-instructions','formal-ready','block-ready'].includes(this.view))return
  if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceIndex=0;this.correct=0;this.practiceInterrupted=false;this.lastFeedback=null;this.reason=''}
  if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test'}this.start(now)}
 private start(now:number){const plan=this.phase==='test'?this.manifest.formal[this.formalIndex]:this.manifest.practice[this.round][this.practiceIndex];if(!plan)throw Error('Hearts-flowers budget exhausted');this.capture=new HFCapture(this.context.snapshot.config,plan,now,[...this.held]);this.view='running';this.changed()}
 tick(now:number){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.tick(now);if(this.capture.done)this.captureDone()}
 /** Observe held inputs across blanks, saving and block screens as well as stimulus windows. */
 input(event:HFInputEvent){if(this.disposed)return;if(event.kind==='down'&&!event.repeat)this.held.add(event.token);if(event.kind==='up')this.held.delete(event.token);if(this.held.size>64){this.stop('held-input-bound',event.atMs);return}if(this.view!=='running'||!this.capture)return;this.capture.input(event);if(this.capture.done)this.captureDone();else this.changed()}
 private captureDone(){const raw=structuredClone(this.capture!.raw);this.capture=null;if(raw.status!=='complete'){if(this.phase==='practice')this.practiceInterrupted=true;else this.aborted=true;if(!this.reason)this.reason=raw.stopReason??'capture-stopped'}
  if(this.phase==='practice'){const correct=raw.status==='complete'&&raw.state.response?.side===correctSide(raw.plan.shape,raw.plan.side);if(correct)this.correct++;this.lastFeedback={correct,raw}}
  const base={contextKey:this.context.contextKey,phase:this.phase,round:raw.plan.round,index:raw.plan.index,raw,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,realm:{...this.realm},recordKey:`${this.phase}:${raw.plan.round}:${raw.plan.index}`}
  this.pending={...base,recordDigest:digest(base)};this.view='saving-item';this.changed();void this.persist()}
 private async persist(){if(this.busy||!this.pending)return;this.busy=true;try{const record=this.pending,receipt=await this.ports.persistLocalDraft(structuredClone(record))
  if(receipt.retained!==true||receipt.contextKey!==record.contextKey||receipt.recordKey!==record.recordKey||receipt.recordDigest!==record.recordDigest)throw Error('Local receipt mismatch')
  this.records.push(record);this.pending=null;if(this.disposed)return
  if(this.phase==='practice'){this.practiceIndex++;this.view='feedback';this.changed()}else{this.formalIndex++;if(this.aborted||this.formalIndex===this.context.snapshot.config.totalTrials){this.view='saving-final';this.changed()}else if(this.manifest.formal[this.formalIndex].mode!==record.raw.plan.mode){this.view='block-ready';this.changed()}else this.start(this.now())}
 }catch{if(!this.disposed){if(this.phase==='test')this.aborted=true;else this.practiceInterrupted=true;if(!this.reason)this.reason='local-save-failure';this.view='retry';this.changed()}}finally{this.busy=false;if(!this.disposed&&this.view==='saving-final')void this.finish()}}
 nextPractice(now:number){if(this.disposed||this.view!=='feedback'||this.practiceInterrupted||this.practiceIndex>=8)return;this.start(now)}
 acceptPractice(){if(this.disposed||this.view!=='feedback'||!this.practicePassed)return;this.view='formal-ready';this.changed()}
 reviewInstructions(){if(this.disposed||this.view!=='feedback'||this.practicePassed||(!this.practiceInterrupted&&this.practiceIndex!==8)||!this.canRetryPractice)return;this.view='practice-instructions';this.changed()}
 get practiceNeedsReview(){return this.practiceInterrupted||this.practiceIndex===8&&!this.practicePassed}
 endPractice(){if(this.disposed||this.phase!=='practice'||!['intro','practice-ready','feedback','practice-instructions','formal-ready'].includes(this.view))return;this.reason='practice-ended';this.view='stopped';this.changed()}
 stop(reason:string,now:number){if(this.disposed||!['running','saving-item','formal-ready','block-ready'].includes(this.view))return;if(this.phase==='test')this.aborted=true;else this.practiceInterrupted=true;if(!this.reason)this.reason=reason
  if(this.capture){this.capture.interrupt(reason,now);this.captureDone()}else if(this.view==='saving-item')return;else if(this.phase==='test'){this.view='saving-final';this.changed();void this.finish()}else{this.view='stopped';this.changed()}}
 async retry(){if(this.disposed||this.busy||this.view!=='retry')return;if(this.pending)await this.persist();else await this.finish()}
 private async finish(){if(this.disposed||this.busy||this.pending||this.phase!=='test')return;this.busy=true;this.view='saving-final';this.changed()
  try{if(!this.final){const claim={contextKey:this.context.contextKey,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,formalCount:this.records.filter(r=>r.phase==='test').length,practiceCount:this.records.filter(r=>r.phase==='practice').length,termination:(!this.aborted&&this.formalIndex===this.context.snapshot.config.totalTrials?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.final={...claim,finalPayloadDigest:digest(claim)}}
   const receipt=await this.ports.finalize(structuredClone(this.final));if(this.disposed)return
   if(receipt.finalSaved!==true||receipt.contextKey!==this.context.contextKey||receipt.finalPayloadDigest!==this.final.finalPayloadDigest||!receipt.receiptId||receipt.reportDigest!==digest(receipt.report)||!isHFReport(receipt.report,{configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,profile:this.context.snapshot.config.profile,received:this.final.formalCount}))throw Error('Matching saved report receipt required')
   this.receipt=structuredClone(receipt);this.view='report';this.changed()
  }catch{if(!this.disposed){if(!this.reason)this.reason='final-save-not-confirmed';this.view='retry';this.changed()}}finally{this.busy=false}}
 /** Stop progression first, then offer the retained interrupted raw once to the original local port. Never finalize on disposal. */
 dispose(){if(this.disposed)return;this.disposed=true;if(this.capture&&this.view==='running'){this.capture.interrupt('context-disposed',this.now());this.captureDone()}}
}
