import {emptyBlinkAnswers,applyBlinkAction,type BlinkConfig,type BlinkPlan,type BlinkRaw,type BlinkStage,type BlinkAction} from './generated/protocol'
/** One actual paint transition per rAF. No skipped-letter catch-up, probes or per-frame HTTP. */
export class BlinkCapture {
 readonly raw:BlinkRaw;stage:BlinkStage='pre';letterIndex:number|null=null;done=false;private last:number
 constructor(readonly config:BlinkConfig,plan:BlinkPlan,now:number){this.last=now;this.raw={plan:structuredClone(plan),startedAtPerfMs:now,endedAtPerfMs:now,status:'interrupted',stopReason:null,fixationAtMs:null,responseAtMs:null,exposures:[],frames:[{atMs:now,stage:'pre',letterIndex:null,cue:false}],actions:[],answer:emptyBlinkAnswers(),ignored:{early:0,repeat:0,unready:0},overflow:false}}
 private clock(now:number){if(!Number.isFinite(now)||now<this.last)throw Error('Nonmonotonic blink clock');this.last=now}
 private letter(now:number,index:number){this.stage='letter';this.letterIndex=index;this.raw.exposures.push({index,onsetMs:now,offsetMs:null})}
 tick(now:number){if(this.done)return;this.clock(now);if(this.stage==='response')return
  if(this.raw.frames.length>=4096){this.raw.overflow=true;this.interrupt('paint-log-bound',now);return}
  const r=this.raw,p=r.plan,e=this.letterIndex===null?null:r.exposures[this.letterIndex]
  if(this.stage==='pre'&&now-r.startedAtPerfMs>=this.config.timing.preMs){this.stage='fixation';r.fixationAtMs=now}
  else if(this.stage==='fixation'&&now-r.fixationAtMs!>=this.config.timing.fixationMs)this.letter(now,0)
  else if(this.stage==='letter'&&now-e!.onsetMs>=p.letterMs){e!.offsetMs=now;this.stage='blank'}
  else if(this.stage==='blank'&&now-e!.onsetMs>=p.soaMs){if(this.letterIndex!+1===p.stream.length){this.stage='response';this.letterIndex=null;r.responseAtMs=now}else this.letter(now,this.letterIndex!+1)}
  r.frames.push({atMs:now,stage:this.stage,letterIndex:this.letterIndex,cue:this.stage==='letter'&&(this.letterIndex===p.t1Index||this.letterIndex===p.t2Index)})}
 action(now:number,input:Omit<BlinkAction,'atMs'>,repeat=false){if(this.done)return;this.clock(now);if(repeat){this.raw.ignored.repeat++;return}if(this.stage!=='response'){this.raw.ignored.early++;return}
  if(this.raw.actions.length>=128){this.raw.overflow=true;this.interrupt('answer-log-bound',now);return}const action={...input,atMs:now};if(!applyBlinkAction(this.raw.answer,action)){this.raw.ignored.unready++;return}this.raw.actions.push(action)
  if(action.kind==='confirm'){this.raw.status='complete';this.raw.stopReason=null;this.raw.endedAtPerfMs=now;this.done=true}}
 interrupt(reason:string,now:number){if(this.done)return;this.clock(now);this.raw.status='interrupted';this.raw.stopReason=reason;this.raw.endedAtPerfMs=now;this.done=true}
}
