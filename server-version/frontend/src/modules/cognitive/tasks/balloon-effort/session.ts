import {EFFORT_QUIZ,type EffortRaw,type Side,type Input} from './generated/protocol'
import {isEffortReport} from './generated/report'
import {EffortCapture} from './capture'
import {digest,validateEffortContext,effortManifest,type EffortContext,type EffortPorts,type EffortDraft,type EffortPayload,type EffortFinal,type EffortReceipt} from './contracts'
export type EffortView='intro'|'preparing'|'practice-ready'|'running'|'saving-item'|'demo-feedback'|'quiz'|'quiz-feedback'|'practice-instructions'|'formal-ready'|'break'|'retry'|'saving-final'|'report'|'stopped'|'blocked'
/** Task-owned single-realm state. Failed writes/finalization retry immutable records, never replay presses or choices. */
export class EffortSession {
 readonly context:EffortContext;readonly realm={timeOriginMs:performance.timeOrigin,pageInstanceId:crypto.randomUUID()};readonly manifest:ReturnType<typeof effortManifest>
 view:EffortView='intro';capture:EffortCapture|null=null;receipt:EffortReceipt|null=null;reason='';phase:'practice'|'test'='practice';round=0;practiceIndex=0;formalIndex=0;quizIndex=0;quizCorrect=0
 lastDemo:EffortRaw|null=null;lastQuiz:{correct:boolean;questionIndex:number}|null=null;private demosWorked=true;private opened=false;private disposed=false;private aborted=false;private busy=false
 private records:EffortDraft[]=[];private pending:EffortDraft|null=null;private final:EffortFinal|null=null;private readonly ports:EffortPorts
 constructor(context:EffortContext,ports:EffortPorts,private changed:()=>void,private now:()=>number=()=>performance.now()){
  this.context=validateEffortContext(context);this.manifest=effortManifest(this.context);this.ports={prepareLocalAttempt:ports.prepareLocalAttempt.bind(ports),persistLocalDraft:ports.persistLocalDraft.bind(ports),finalize:ports.finalize.bind(ports)}}
 get retained(){return structuredClone(this.records)}
 get practicePassed(){return this.demosWorked&&this.practiceIndex===2&&this.quizIndex===3&&this.quizCorrect===3}
 get canRetryPractice(){return this.round+1<3}
 get demosPassed(){return this.demosWorked&&this.practiceIndex===2}
 get recordedPoints(){return this.records.reduce((sum,r)=>sum+(r.kind==='trial'&&r.raw.plan.phase===this.phase&&(this.phase==='test'||r.raw.plan.round===this.round)?r.raw.reward??0:0),0)}
 async prepare(){if(this.view!=='intro'||this.opened||this.disposed)return;this.view='preparing';this.changed()
  try{const receipt=await this.ports.prepareLocalAttempt(structuredClone(this.context),structuredClone(this.manifest),{...this.realm});if(this.disposed)return
   if(receipt.fresh!==true||receipt.contextKey!==this.context.contextKey||receipt.bindingDigest!==digest({context:this.context,manifest:this.manifest,realm:this.realm}))throw Error('Fresh durable effort identity required')
   this.opened=true;this.view='practice-ready';this.changed()
  }catch{if(!this.disposed){this.reason='local-attempt-not-confirmed';this.view='blocked';this.changed()}}}
 begin(now:number){if(this.disposed||!this.opened||!['practice-ready','practice-instructions','formal-ready','break'].includes(this.view))return
  if(this.view==='practice-instructions'){if(!this.canRetryPractice)return;this.round++;this.practiceIndex=0;this.quizIndex=0;this.quizCorrect=0;this.demosWorked=true;this.lastQuiz=null;this.lastDemo=null}
  if(this.view==='formal-ready'){if(!this.practicePassed)return;this.phase='test'}
  this.start(now)}
 private start(now:number){const p=this.phase==='test'?this.manifest.formal[this.formalIndex]:this.manifest.practice[this.round][this.practiceIndex];if(!p)throw Error('Effort trial budget exhausted')
  this.capture=new EffortCapture(this.context.snapshot.config,p,now);this.view='running';this.changed()}
 tick(now:number){if(this.disposed||this.view!=='running'||!this.capture)return;const old=this.capture.stage,time=Math.ceil(this.capture.remainingMs/1000);this.capture.tick(now)
  if(this.capture.stage==='complete'){this.captureDone();return}if(old!==this.capture.stage||time!==Math.ceil(this.capture.remainingMs/1000))this.changed()}
 down(now:number,token:string,side:Side,input:Input,repeat=false,primary=true){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.down(now,token,side,input,repeat,primary);this.changed()}
 up(now:number,token:string){if(this.disposed||this.view!=='running'||!this.capture)return;this.capture.up(now,token);if(this.capture.stage==='complete')this.captureDone();else this.changed()}
 private captureDone(){const raw=structuredClone(this.capture!.raw);this.capture=null;if(raw.status==='interrupted'){this.aborted=true;if(!this.reason)this.reason=raw.stopReason??'capture-stopped'}
  if(this.phase==='practice'){this.lastDemo=raw;this.demosWorked=this.demosWorked&&raw.status==='complete'&&raw.choice!==null&&raw.presses.length>0}
  this.store({kind:'trial',raw})}
 private store(payload:EffortPayload){if(this.pending)throw Error('Previous effort record is not durable')
  const c=this.context,key=payload.kind==='trial'?`${payload.raw.plan.phase}:${payload.raw.plan.round}:${payload.raw.plan.index}`:`quiz:${payload.raw.round}:${payload.raw.questionId}`
  const base={...structuredClone(payload),contextKey:c.contextKey,recordKey:key,configHash:c.snapshot.configHash,protocolSignature:c.snapshot.protocolSignature,manifestHash:c.manifestHash,realm:{...this.realm}}
  this.pending={...base,recordDigest:digest(base)} as EffortDraft;this.view='saving-item';this.changed();void this.persist()}
 private async persist(){if(this.busy)return;this.busy=true
  try{const record=this.pending;if(!record)return;const receipt=await this.ports.persistLocalDraft(structuredClone(record))
   if(receipt.retained!==true||receipt.contextKey!==record.contextKey||receipt.recordKey!==record.recordKey||receipt.recordDigest!==record.recordDigest)throw Error('Effort local receipt mismatch')
   this.records.push(record);this.pending=null;if(this.disposed)return
   if(this.phase==='practice'){if(record.kind==='trial'){this.practiceIndex++;this.view=this.aborted?'stopped':'demo-feedback'}else{this.quizIndex++;this.view=this.aborted?'stopped':'quiz-feedback'}this.changed()}
   else{this.formalIndex++;if(this.aborted||this.formalIndex===this.context.snapshot.config.totalTrials){this.view='saving-final';this.changed()}else if(this.formalIndex%18===0){this.view='break';this.changed()}else this.start(this.now())}
  }catch{if(!this.disposed){this.aborted=true;if(!this.reason)this.reason='local-save-failure';this.view='retry';this.changed()}}
  finally{this.busy=false;if(!this.disposed&&this.view==='saving-final')void this.finish()}}
 nextDemo(now:number){if(this.disposed||this.view!=='demo-feedback')return
  if(this.practiceIndex<2)this.start(now);else if(this.demosPassed){this.view='quiz';this.changed()}}
 answerQuiz(answerIndex:number,now:number){if(this.disposed||this.view!=='quiz'||!Number.isInteger(answerIndex)||answerIndex<0||answerIndex>2||!Number.isFinite(now)||now<0)return
  const question=EFFORT_QUIZ[this.quizIndex];if(!question)return;const correct=question.correct===answerIndex;this.lastQuiz={correct,questionIndex:this.quizIndex};if(correct)this.quizCorrect++
  this.store({kind:'quiz',raw:{version:'effort-two-demos-three-questions-v1',round:this.round,questionId:question.id,answerIndex,atPerfMs:now}})}
 nextQuestion(){if(this.disposed||this.view!=='quiz-feedback'||this.quizIndex>=3)return;this.view='quiz';this.changed()}
 acceptPractice(){if(this.disposed||this.view!=='quiz-feedback'||!this.practicePassed)return;this.view='formal-ready';this.changed()}
 reviewInstructions(){if(this.disposed||!this.canRetryPractice||this.practicePassed||!((this.view==='demo-feedback'&&this.practiceIndex===2)||(this.view==='quiz-feedback'&&this.quizIndex===3)))return;this.view='practice-instructions';this.changed()}
 endPractice(){if(this.disposed||this.phase!=='practice'||!['intro','practice-ready','demo-feedback','quiz','quiz-feedback','practice-instructions','formal-ready'].includes(this.view))return;this.reason='practice-ended';this.view='stopped';this.changed()}
 stop(reason:string,now:number){if(this.disposed||!['running','saving-item','break','formal-ready'].includes(this.view))return;this.aborted=true;if(!this.reason)this.reason=reason
  if(this.capture){this.capture.interrupt(reason,now);this.captureDone()}else if(this.view==='saving-item')return;else if(this.phase==='test'){this.view='saving-final';this.changed();void this.finish()}else{this.view='stopped';this.changed()}}
 async retry(){if(this.disposed||this.busy||this.view!=='retry')return;if(this.pending)await this.persist();else await this.finish()}
 private async finish(){if(this.disposed||this.busy||this.pending||this.phase!=='test')return;this.busy=true;this.view='saving-final';this.changed()
  try{if(!this.final){const c=this.context,claim={contextKey:c.contextKey,configHash:c.snapshot.configHash,protocolSignature:c.snapshot.protocolSignature,manifestHash:c.manifestHash,
   formalCount:this.records.filter(r=>r.kind==='trial'&&r.raw.plan.phase==='test').length,practiceCount:this.records.filter(r=>r.kind==='trial'&&r.raw.plan.phase==='practice').length,quizCount:this.records.filter(r=>r.kind==='quiz').length,
   termination:(!this.aborted&&this.formalIndex===c.snapshot.config.totalTrials?'completed':'aborted') as 'completed'|'aborted',terminationReason:this.reason||null,recordDigests:this.records.map(r=>r.recordDigest)};this.final={...claim,finalPayloadDigest:digest(claim)}}
   const receipt=await this.ports.finalize(structuredClone(this.final));if(this.disposed)return
   if(receipt?.finalSaved!==true||receipt.contextKey!==this.context.contextKey||receipt.finalPayloadDigest!==this.final.finalPayloadDigest||!receipt.receiptId||!isEffortReport(receipt.report,{configHash:this.context.snapshot.configHash,
    protocolSignature:this.context.snapshot.protocolSignature,profile:this.context.snapshot.config.profile,received:this.final.formalCount}))throw Error('Matching saved effort report receipt required')
   this.receipt=structuredClone(receipt);this.view='report';this.changed()
  }catch{if(!this.disposed){if(!this.reason)this.reason='final-save-not-confirmed';this.view='retry';this.changed()}}finally{this.busy=false}}
 dispose(){if(this.capture&&this.view==='running')this.stop('context-disposed',this.now());this.disposed=true}
}
