import {Capture} from './capture'
import {reviewRaw,type Plan,type Location} from './generated/protocol'
import {isReport} from './generated/report'
import {digest,manifestFor,validateContext,type Context,type Ports,type Draft,type FinalClaim,type Receipt} from './contracts'
export type View='intro'|'preparing'|'practice-ready'|'practice-instructions'|'presenting'|'running'|'practice-feedback'|'formal-ready'|'interval'|'break'|'draining'|'retry'|'report'|'stopped'|'blocked'
export class Session{
  readonly context:Context;readonly manifest:ReturnType<typeof manifestFor>;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()}
  view:View='intro';phase:'practice'|'test'='practice';round=0;practiceIndex=0;practiceCorrect=0;practiceIncomplete=false;formalIndex=0
  activePlan:Plan|null=null;capture:Capture|null=null;lastRaw:Draft['raw']|null=null;receipt:Receipt|null=null;reason=''
  private records:Draft[]=[];private durable=0;private saving=false;private finalBusy=false;private opened=false;private disposed=false;private ended=false;private saveError=false;private finalClaim:FinalClaim|null=null;private ports:Ports
  constructor(context:Context,ports:Ports,private changed:()=>void,private now=()=>performance.now()){this.context=validateContext(context);this.manifest=manifestFor(this.context);this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}}
  get retained(){return structuredClone(this.records)}
  get durableCount(){return this.durable}
  get practicePassed(){return this.practiceIndex===4&&this.practiceCorrect===4&&!this.practiceIncomplete}
  get practiceRoundFinished(){return this.practiceIndex===4||this.practiceIncomplete}
  get canRetryPractice(){return this.round<2}
  async prepare(){
    if(this.view!=='intro'||this.opened||this.disposed)return;this.view='preparing';this.changed()
    try{const r=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm});if(this.disposed)return;if(r.fresh!==true||r.contextKey!==this.context.contextKey||r.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('SRL fresh retained attempt not confirmed');this.opened=true;this.view='practice-ready';this.changed()}
    catch{if(!this.disposed){this.reason='attempt-not-confirmed';this.view='blocked';this.changed()}}
  }
  begin(){
    if(this.disposed||!this.opened||!['practice-ready','practice-instructions','formal-ready','break'].includes(this.view))return
    if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceIndex=0;this.practiceCorrect=0;this.practiceIncomplete=false}
    if(this.view==='formal-ready'){if(!this.practicePassed||this.durable!==this.records.length)return;this.phase='test'}
    this.present()
  }
  private present(){this.activePlan=this.phase==='test'?this.manifest.formal[this.formalIndex]:this.manifest.practice[this.round][this.practiceIndex];if(!this.activePlan)throw Error('SRL plan exhausted');this.capture=null;this.view='presenting';this.changed()}
  expose(now:number){if(this.disposed||this.view!=='presenting'||!this.activePlan)return;this.capture=new Capture(this.activePlan,now);this.view='running';this.changed()}
  tap(location:Location,now:number){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.tap(location,now);if(this.capture.done)this.captureDone()}
  ignore(){this.capture?.ignore()}
  private captureDone(){
    const raw=this.capture!.raw,result=reviewRaw(raw,this.activePlan!);this.capture=null;this.lastRaw=structuredClone(raw)
    const base={contextKey:this.context.contextKey,phase:this.phase,round:raw.plan.round,index:raw.plan.index,raw,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,realm:{...this.realm},recordKey:`${this.phase}:${raw.plan.round}:${raw.plan.index}`}
    this.records.push({...base,recordDigest:digest(base)})
    if(this.phase==='practice'){this.practiceIndex++;if(result.firstCorrect)this.practiceCorrect++;if(result.interrupted)this.practiceIncomplete=true;this.view='practice-feedback'}
    else{this.formalIndex++;if(result.interrupted){this.ended=true;this.reason=raw.events.slice(-1)[0]?.kind==='interrupt'?(raw.events.slice(-1)[0] as {reason:string}).reason:'interrupted'}this.view=this.ended||this.formalIndex===this.manifest.formal.length?'draining':this.formalIndex%84===0?'break':'interval'}
    this.changed();void this.flush()
  }
  /** UI schedules from actual correctAtMs +500; IO never determines target onset. */
  nextAfterInterval(){if(this.disposed||this.view!=='interval'||this.ended||this.saveError)return;this.present()}
  nextPractice(){if(this.disposed||this.view!=='practice-feedback'||this.practiceRoundFinished)return;this.present()}
  acceptPractice(){if(this.disposed||this.view!=='practice-feedback'||!this.practicePassed||this.durable!==this.records.length)return;this.view='formal-ready';this.changed()}
  reviewInstructions(){if(this.disposed||this.view!=='practice-feedback'||!this.practiceRoundFinished||this.practicePassed||!this.canRetryPractice)return;this.view='practice-instructions';this.changed()}
  endPractice(){if(this.disposed||this.phase!=='practice')return;if(this.capture){this.capture.interrupt('practice-ended',this.now());this.captureDone()}this.reason='practice-ended';this.view='stopped';this.changed()}
  stop(reason:string,now:number){
    if(this.disposed||!['presenting','running','interval','break'].includes(this.view))return
    if(this.phase==='test'){this.ended=true;this.reason=reason}
    if(this.capture){this.capture.interrupt(reason,now);this.captureDone()}
    else if(this.phase==='practice'){this.practiceIncomplete=true;this.view='practice-feedback';this.changed()}
    else{this.view='draining';this.changed();void this.flush()}
  }
  private async flush(){
    if(this.saving||this.saveError)return;this.saving=true
    try{while(this.durable<this.records.length){const record=this.records[this.durable],r=await this.ports.persistLocalDraft(structuredClone(record));if(r.retained!==true||r.contextKey!==record.contextKey||r.recordKey!==record.recordKey||r.recordDigest!==record.recordDigest)throw Error('SRL exact draft retention not confirmed');this.durable++}if(!this.disposed)this.changed()}
    catch{this.saveError=true;if(!this.disposed){if(this.phase==='test'&&this.formalIndex<this.manifest.formal.length){this.ended=true;this.reason='draft-not-retained'}if(this.capture){this.capture.interrupt('draft-not-retained',this.now());this.captureDone()}else if(this.phase==='practice')this.practiceIncomplete=true;this.view='retry';this.changed()}}
    finally{this.saving=false;if(!this.disposed&&!this.saveError&&this.view==='draining')void this.finish()}
  }
  async retry(){if(this.disposed||this.view!=='retry'||this.saving||this.finalBusy)return;if(this.finalClaim){await this.finish();return}this.saveError=false;this.view=this.phase==='test'?'draining':'practice-feedback';this.changed();await this.flush()}
  private async finish(){
    if(this.disposed||this.finalBusy||this.saving||this.saveError||this.durable!==this.records.length||this.phase!=='test')return
    this.finalBusy=true;this.view='draining';this.changed()
    try{if(!this.finalClaim){const claim={contextKey:this.context.contextKey,configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,formalCount:this.records.filter(r=>r.phase==='test').length,practiceCount:this.records.filter(r=>r.phase==='practice').length,termination:(!this.ended&&this.formalIndex===this.manifest.formal.length?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.finalClaim={...claim,finalPayloadDigest:digest(claim)}}
      const r=await this.ports.finalize(structuredClone(this.finalClaim));if(this.disposed)return
      if(r.finalSaved!==true||r.contextKey!==this.context.contextKey||r.finalPayloadDigest!==this.finalClaim.finalPayloadDigest||!r.receiptId||!isReport(r.report,{configHash:this.context.snapshot.configHash,protocolSignature:this.context.snapshot.protocolSignature,manifestHash:this.context.manifestHash,profile:this.context.snapshot.config.profile,received:this.finalClaim.formalCount}))throw Error('SRL matching saved public report not confirmed')
      this.receipt=structuredClone(r);this.view='report';this.changed()
    }catch{if(!this.disposed){this.view='retry';this.changed()}}finally{this.finalBusy=false}
  }
  dispose(){if(this.disposed)return;if(['presenting','running','interval','break'].includes(this.view))this.stop('context-disposed',this.now());this.disposed=true}
}
