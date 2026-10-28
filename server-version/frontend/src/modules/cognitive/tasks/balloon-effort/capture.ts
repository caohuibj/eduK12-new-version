import {isHigh,earnedPoints,type EffortConfig,type EffortPlan,type EffortRaw,type Input,type Side,type Stage} from './generated/protocol'
/** Actual stage transitions and complete down/up cycles. First press never resets the execution clock. */
export class EffortCapture {
 stage:Stage='iti';readonly raw:EffortRaw;private last:number;private held:Map<string,{stage:Stage;side:Side;input:Input;at:number}>=new Map()
 constructor(readonly config:EffortConfig,plan:EffortPlan,now:number){this.last=now;this.raw={plan:structuredClone(plan),status:'interrupted',stopReason:null,startedAtPerfMs:now,endedAtPerfMs:now,
  onsets:{iti:now,probability:null,frame:null,offers:null,choice:null,prepare:null,execution:null,feedback:null,cumulative:null},choiceEndMs:null,choice:null,choiceOutcome:null,executionEndMs:null,executionResult:null,presses:[],reward:null,
  ignored:{early:0,held:0,wrongSide:0,late:0,multiplePointer:0},eventOverflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic effort clock');this.last=now}
 private enter(stage:Exclude<Stage,'complete'>,now:number){this.stage=stage;this.raw.onsets[stage]=now}
 get remainingMs(){if(this.stage==='prepare')return Math.max(0,3000-(this.last-this.raw.onsets.prepare!));return this.stage==='execution'?Math.max(0,this.raw.plan.executionMs-(this.last-this.raw.onsets.execution!)):this.stage==='choice'?Math.max(0,6500-(this.last-this.raw.onsets.choice!)):0}
 tick(now:number){if(this.stage==='complete')return;this.clock(now);const r=this.raw,t=this.config.timing
  if(this.stage==='iti'&&now-r.onsets.iti!>=t.iti)this.enter('probability',now)
  else if(this.stage==='probability'&&now-r.onsets.probability!>=t.probability)this.enter('frame',now)
  else if(this.stage==='frame'&&now-r.onsets.frame!>=t.frame)this.enter('offers',now)
  else if(this.stage==='offers'&&now-r.onsets.offers!>=t.offers)this.enter('choice',now)
  else if(this.stage==='choice'&&now-r.onsets.choice!>=t.choice){r.choiceEndMs=now;r.choiceOutcome='no_response';this.enter('feedback',now)}
  else if(this.stage==='prepare'&&now-r.onsets.prepare!>=t.prepare)this.enter('execution',now)
  else if(this.stage==='execution'&&now-r.onsets.execution!>=r.plan.executionMs)this.endExecution('window_elapsed',now)
  else if(this.stage==='feedback'&&now-r.onsets.feedback!>=t.feedback)this.enter('cumulative',now)
  else if(this.stage==='cumulative'&&now-r.onsets.cumulative!>=t.cumulative){r.status='complete';r.endedAtPerfMs=now;this.stage='complete'}
 }
 down(now:number,token:string,side:Side,input:Input,repeat=false,primary=true){if(this.stage==='complete')return;this.clock(now)
  if(!primary){this.raw.ignored.multiplePointer++;return}
  if(repeat||this.held.size>0){this.raw.ignored.held++;return}
  this.held.set(token,{stage:this.stage,side,input,at:now})
  if(this.stage!=='choice'&&this.stage!=='execution')this.raw.ignored.early++
 }
 up(now:number,token:string){if(this.stage==='complete')return;this.clock(now);const h=this.held.get(token);this.held.delete(token);if(!h)return
  const r=this.raw;if(this.stage==='choice'&&h.stage==='choice'){
   if(now>=r.onsets.choice!+6500){r.ignored.late++;return}
   if(r.plan.forced&&isHigh(r.plan,h.side)!==(r.plan.forced==='high')){r.ignored.wrongSide++;return}
   r.choice={side:h.side,input:h.input,key:h.input==='keyboard'?token:null,downAtMs:h.at,upAtMs:now};r.choiceOutcome='selected';r.choiceEndMs=now;this.enter('prepare',now)
  }else if(this.stage==='execution'&&h.stage==='execution'){
   if(now>=r.onsets.execution!+r.plan.executionMs){r.ignored.late++;return}
   if(!r.choice||h.side!==r.choice.side){r.ignored.wrongSide++;return}
   if(r.presses.length>=2048){r.eventOverflow=true;this.interrupt('input-overflow',now);return}
   r.presses.push({side:h.side,input:h.input,key:h.input==='keyboard'?token:null,downAtMs:h.at,upAtMs:now})
   if(!isHigh(r.plan,h.side)&&r.presses.length===r.plan.lowGoal)this.endExecution('target_reached',now)
  }
 }
 private endExecution(result:'target_reached'|'window_elapsed',now:number){this.raw.executionEndMs=now;this.raw.executionResult=result;this.raw.reward=earnedPoints(this.raw.plan,this.raw.choice!.side,this.raw.presses.length,true);this.enter('feedback',now)}
 interrupt(reason:string,now:number){if(this.stage==='complete')return;this.clock(now);this.raw.stopReason=reason;this.raw.status='interrupted';this.raw.endedAtPerfMs=now;this.stage='complete'}
}
