import {clone,type RecognitionContext,type RecognitionPorts,type CapturedRecord,type Envelope,type FinalReceipt} from './contracts'
import {RecognitionCapture} from './capture'
import {RecognitionSaveQueue} from './save-queue'
import {sealDigest} from './digest'
import {isNativeRecognitionProjection} from './report-projection'
export type SessionView='intro'|'preparing'|'ready-practice'|'practice'|'practice-saving'|'ready-formal'|'formal'|'saving'|'retry'|'report'|'blocked'
/** Task-owned orchestration only. Host owns verified freeze, durable local draft and authoritative final/archive save. */
export class RecognitionSession {
  view:SessionView='intro';capture:RecognitionCapture|null=null;error='';receipt:FinalReceipt|null=null
  phase:'practice'|'formal'='practice';private index=0;private emitted=0;private aborted=false;private disposed=false
  private opened=false;private finishing=false;readonly queue:RecognitionSaveQueue
  private readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:globalThis.crypto?.randomUUID?.()??('page-'+performance.timeOrigin)}
  private readonly ports:RecognitionPorts
  constructor(readonly context:RecognitionContext,ports:RecognitionPorts,readonly synthetic:boolean,
    private changed:()=>void,private now:()=>number=()=>performance.now(),private rawObserver?:(envelope:Envelope)=>void){
    this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}
    this.queue=new RecognitionSaveQueue(context.contextKey,this.ports.persistLocalDraft,()=>this.halt('local-save-failure',this.now()))
  }
  async prepare(){
    if(this.view!=='intro'||this.opened||this.disposed)return
    this.view='preparing';this.changed()
    try{const r=await this.ports.prepareLocalAttempt(clone(this.context))
      if(this.disposed)return
      if(r?.fresh!==true||r.contextKey!==this.context.contextKey||r.bindingDigest!==sealDigest(this.context))throw Error('Attempt is not a fresh unexposed local identity')
      this.opened=true;this.view='ready-practice';this.changed()
    }catch{if(!this.disposed){this.error='local-attempt-not-confirmed';this.view='blocked';this.changed()}}
  }
  begin(now:number){
    if(this.disposed||!this.opened||!['ready-practice','ready-formal'].includes(this.view))return
    this.phase=this.view==='ready-formal'?'formal':'practice';this.index=0;this.aborted=false;this.start(now)
  }
  private start(now:number){
    const p=this.phase==='formal'?this.context.manifest.formal[this.index]:this.context.manifest.practice[this.index]
    const kind=this.phase==='formal'?this.context.manifest.formal[this.index].kind:
      this.context.manifest.practice[this.index].seenBefore?'target-repeat':'target-first'
    this.capture=new RecognitionCapture(this.index,p.assetId,kind,now)
    this.view=this.phase;this.changed()
  }
  tick(now:number){
    if(this.disposed||!this.capture||!['practice','formal'].includes(this.view))return
    const before=this.capture.stage,next=this.capture.tick(now)
    if(next==='complete'){
      this.emit();this.capture=null;this.index++
      if(this.aborted){this.halt(this.error,now);return}
      const total=this.phase==='formal'?this.context.manifest.formal.length:8
      if(this.index===total){this.view=this.phase==='formal'?'saving':'practice-saving';this.changed();void this.finish();return}
      if(this.queue.pendingCount>=4){this.halt('local-draft-backlog',now);return}
      this.start(now)
    }else if(before!==next)this.changed()
  }
  input(now:number,input:Parameters<RecognitionCapture['input']>[1],key:string|null=null,repeat=false,primary=true){
    if(!this.capture||!['practice','formal'].includes(this.view))return
    this.capture.input(now,input,key,repeat,primary)
    if(this.capture.stage==='complete')this.halt(this.capture.reason()??'capture-stopped',now)
  }
  halt(reason:string,now:number){
    if(this.disposed||!['practice','formal','saving','practice-saving'].includes(this.view))return
    this.aborted=true;this.error=reason
    if(this.capture){this.capture.interrupt(reason,now);this.emit();this.capture=null}
    this.view='retry';this.changed()
  }
  private emit(){
    const cap=this.capture!;const envelope=cap.envelope()
    const record:CapturedRecord={contextKey:this.context.contextKey,recordKey:this.phase+':'+cap.payload.record.index,
      binding:{configHash:this.context.configHash,protocolSignature:this.context.protocolSignature,manifestHash:this.context.manifestHash,
        assetManifestHash:this.context.assetManifest.manifestHash,randomSeed:this.context.randomSeed},phase:this.phase,envelope,note:{stopReason:cap.reason(),synthetic:this.synthetic,
        unassignedBoundaryEvents:cap.allEvents().filter(e=>e.atMs>=envelope.endedAtPerfMs),allEvents:cap.allEvents(),
        actualExposure:cap.actualExposure(),realm:{...this.realm}}}
    this.queue.enqueue(record);this.emitted++
    if(this.phase==='formal')try{this.rawObserver?.(clone(envelope))}catch{this.aborted=true;this.error='raw-observer-failed'}
  }
  async retry(){
    if(this.view!=='retry'||this.disposed||this.finishing)return
    try{await this.queue.retry();if(this.disposed)return
      if(this.phase==='practice'){this.view='blocked';this.error='practice-interrupted-no-success';this.changed();return}
      this.view='saving';this.changed();await this.finish()
    }catch{if(!this.disposed){this.view='retry';this.changed()}}
  }
  private async finish(){
    if(this.finishing||this.disposed)return
    this.finishing=true
    try{await this.queue.idle();if(this.disposed||this.view==='retry')return
      if(this.phase==='practice'){
        if(this.aborted||this.queue.retained.filter(r=>r.phase==='practice').length!==8)throw Error('Practice not complete')
        this.view='ready-formal';this.changed();return
      }
      const formalCount=this.queue.retained.filter(r=>r.phase==='formal').length
      const claim={contextKey:this.context.contextKey,manifestHash:this.context.manifestHash,formalCount,
        practiceCount:this.queue.retained.filter(r=>r.phase==='practice').length,recordDigests:this.queue.retained.map(r=>r.recordDigest),
        termination:(!this.aborted&&formalCount===this.context.manifest.formal.length?'completed':'aborted') as 'completed'|'aborted'}
      const finalPayloadDigest=sealDigest(claim)
      const receipt=await this.ports.finalize({...claim,finalPayloadDigest})
      if(this.disposed)return
      if(receipt?.contextKey!==this.context.contextKey||receipt.finalSaved!==true||!receipt.receiptId||receipt.finalPayloadDigest!==finalPayloadDigest
        ||receipt.manifestHash!==this.context.manifestHash||receipt.formalCount!==formalCount||receipt.practiceCount!==claim.practiceCount
        ||!isNativeRecognitionProjection(receipt.report,{configHash:this.context.configHash,protocolSignature:this.context.protocolSignature,
          assetManifestHash:this.context.assetManifest.manifestHash,formalCount,assetStatus:this.context.assetManifest.status,synthetic:this.synthetic}))
        throw Error('Final platform/archive receipt and matching native projection required')
      this.receipt=clone(receipt);this.view='report';this.changed()
    }catch{if(!this.disposed){this.view='retry';this.error='saving-not-confirmed';this.changed()}}
    finally{this.finishing=false}
  }
  /** Context replacement/unmount is terminal; asynchronous old callbacks can only touch the old frozen port. */
  dispose(){if(this.capture&&['practice','formal'].includes(this.view))this.halt('context-disposed',this.now());this.disposed=true}
}
