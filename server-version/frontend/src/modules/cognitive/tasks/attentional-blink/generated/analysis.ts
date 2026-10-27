// Exact pure content projection. Backend SHA256: 163e40ed2e6c363c6554bfe0cf894285ce9cfffb1c739851ec452c0a6db3e3d9
import {same,emptyBlinkAnswers,applyBlinkAction,type BlinkRaw,type BlinkPlan,type BlinkConfig} from './protocol'
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6
/** Protocol review, not a frame-rate quality threshold. All actual exposures must exist; ordinary callback overshoot is retained. */
export function reviewBlink(raw:BlinkRaw,plan:BlinkPlan,c:BlinkConfig){
 if(!same(raw.plan,plan)||raw.endedAtPerfMs<raw.startedAtPerfMs||raw.exposures.length>plan.stream.length)throw Error('Blink plan/clock mismatch')
 if(raw.fixationAtMs!==null&&(raw.fixationAtMs<raw.startedAtPerfMs+c.timing.preMs-1e-6||raw.fixationAtMs>raw.endedAtPerfMs))throw Error('Blink fixation was not executed')
 for(const [i,e] of raw.exposures.entries()){if(e.index!==i||raw.fixationAtMs===null||e.onsetMs<(i===0?raw.fixationAtMs+c.timing.fixationMs:raw.exposures[i-1].onsetMs+plan.soaMs)-1e-6||e.onsetMs>raw.endedAtPerfMs
  ||(i>0&&(raw.exposures[i-1].offsetMs===null||e.onsetMs<raw.exposures[i-1].offsetMs!))||(e.offsetMs!==null&&(e.offsetMs<e.onsetMs+plan.letterMs-1e-6||e.offsetMs>raw.endedAtPerfMs))||(e.offsetMs===null&&i!==raw.exposures.length-1))throw Error('Blink letter exposure mismatch')}
 if(raw.responseAtMs!==null){const last=raw.exposures[raw.exposures.length-1];if(raw.exposures.length!==plan.stream.length||!last||last.offsetMs===null||raw.responseAtMs<last.onsetMs+plan.soaMs-1e-6||raw.responseAtMs<last.offsetMs||raw.responseAtMs>raw.endedAtPerfMs)throw Error('Response preceded complete blink stream')}
 let ordinal=0,lastAt=raw.startedAtPerfMs
 for(const frame of raw.frames){const i=frame.letterIndex,n=frame.stage==='pre'?0:frame.stage==='fixation'?1:frame.stage==='response'?2+2*plan.stream.length:2+2*(i??-100)+(frame.stage==='blank'?1:0)
  if(frame.atMs<lastAt||frame.atMs>raw.endedAtPerfMs||n<ordinal||n>ordinal+1||((frame.stage==='letter'||frame.stage==='blank')?(i===null||!raw.exposures[i]):i!==null))throw Error('Blink paint sequence mismatch')
  const e=i===null?null:raw.exposures[i],start=frame.stage==='pre'?raw.startedAtPerfMs:frame.stage==='fixation'?raw.fixationAtMs:frame.stage==='response'?raw.responseAtMs:frame.stage==='letter'?e?.onsetMs:e?.offsetMs,
   end=frame.stage==='pre'?raw.fixationAtMs:frame.stage==='fixation'?raw.exposures[0]?.onsetMs:frame.stage==='response'?null:frame.stage==='letter'?e?.offsetMs:raw.exposures[(i??0)+1]?.onsetMs??raw.responseAtMs
  if(start===null||start===undefined||frame.atMs<start||(end!==null&&end!==undefined&&frame.atMs>=end)||frame.cue!==(frame.stage==='letter'&&(i===plan.t1Index||i===plan.t2Index)))throw Error('Blink displayed target/phase mismatch')
  if(n>ordinal&&!near(frame.atMs,start))throw Error('Missing real blink paint onset');ordinal=n;lastAt=frame.atMs
 }
 if(raw.frames[0].stage!=='pre'||!near(raw.frames[0].atMs,raw.startedAtPerfMs))throw Error('Missing initial blink paint')
 const answer=emptyBlinkAnswers();let actionAt=raw.responseAtMs??Infinity
 for(const a of raw.actions){if(raw.responseAtMs===null||a.atMs<actionAt||a.atMs>raw.endedAtPerfMs||(a.input==='keyboard'?a.key===null:a.key!==null)||!applyBlinkAction(answer,a))throw Error('Blink answer action mismatch');actionAt=a.atMs}
 if(!same(answer,raw.answer))throw Error('Blink answers differ from actions')
 const executed=raw.responseAtMs!==null&&ordinal===2+2*plan.stream.length,confirmed=answer.confirmedAtMs!==null
 if(raw.status==='complete'&&(!executed||!confirmed||raw.stopReason!==null||raw.overflow||!near(raw.endedAtPerfMs,answer.confirmedAtMs!)))throw Error('Unexecuted blink trial claimed complete')
 if(raw.status==='interrupted'&&raw.stopReason===null)throw Error('Interrupted blink trial requires reason')
 const valid=raw.status==='complete',t1=valid?answer.answers[0]===plan.stream[plan.t1Index]:null,t2=valid?answer.answers[1]===plan.stream[plan.t2Index]:null,
 offset=(target:0|1)=>{if(!valid||answer.answers[target]===null)return null;const position=plan.stream.indexOf(answer.answers[target]!);return position<0?null:position-(target===0?plan.t1Index:plan.t2Index)}
 return {valid,t1,t2,both:t1===true&&t2===true,forgot:valid?answer.answers.filter(a=>a===null).length:0,t1Offset:offset(0),t2Offset:offset(1)}
}
