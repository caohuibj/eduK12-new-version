import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createBlinkSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/attentional-blink/package'
import {blinkPlan,type BlinkAction} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/attentional-blink/protocol'
import {scoreBlink,blinkEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/attentional-blink/scorer'
import {reviewBlink} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/attentional-blink/analysis'
import {projectBlinkReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/attentional-blink/report'
import {BlinkCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/attentional-blink/capture'

const session=createBlinkSnapshot('experience'),randomSeed='independent-blink-20261028',plan=blinkPlan(session.config,randomSeed)
let now=100
const modes=['t1-only','both','t2-only','explicit-forget','reversed','unconfirmed','stream-interrupted','one-frame-late'] as const
const records=modes.map((mode,index)=>{
 const p=plan[index],cap=new BlinkCapture(session.config,p,now),start=now
 cap.action(start+1,{kind:'letter',target:0,letter:'A',input:'keyboard',key:'KeyA'})
 cap.tick(start+100);cap.tick(start+900)
 for(let i=0;i<p.stream.length;i++){
  const onset=cap.raw.exposures[i].onsetMs
  cap.tick(onset+p.letterMs+(mode==='one-frame-late'&&i===0?17:0))
  if(mode==='stream-interrupted'&&i===2){cap.interrupt('participant-ended',onset+p.letterMs+1);break}
  cap.tick(onset+p.soaMs)
 }
 const t1=p.stream[p.t1Index],t2=p.stream[p.t2Index],wrong=p.stream.find(c=>c!==t1&&c!==t2)!
 if(!cap.done){
  let at=cap.raw.responseAtMs!
  cap.action(++at,{kind:'letter',target:0,letter:'A',input:'keyboard',key:'KeyA'},true)
  const answers=mode==='explicit-forget'?[null,null]:mode==='reversed'?[t2,t1]:[mode==='t2-only'?wrong:t1,mode==='t1-only'?wrong:t2]
  for(const target of [0,1] as const){
   if(mode==='unconfirmed'&&target===1)break
   const letter=answers[target]
   cap.action(++at,{kind:letter===null?'forget':'letter',target,letter,input:letter===null?'touch':'keyboard',key:letter===null?null:'Key'+letter})
  }
  if(mode==='unconfirmed')cap.interrupt('participant-ended',++at)
  else cap.action(++at,{kind:'confirm',target:1,letter:null,input:'keyboard',key:'Enter'})
 }
 now=cap.raw.endedAtPerfMs+10
 return {mode,raw:cap.raw,review:reviewBlink(cap.raw,p,session.config)}
})
const score=(n:number)=>scoreBlink({session,config:session.config,randomSeed,trials:records.slice(0,n).map(r=>blinkEnvelope(r.raw))})
const full=score(records.length),report=projectBlinkReport(full),first=projectBlinkReport(score(1))
assert.deepEqual({valid:report.valid,t1:report.t1Correct,t2:report.t2Correct,both:report.bothCorrect,forgot:report.forgotTargets},{valid:6,t1:3,t2:3,both:2,forgot:2})
assert.equal(full.metrics.t2GivenT1Rate,2/3)
assert.equal(first.byLag[plan[0].lag].t2GivenT1,0)
assert.ok(Object.values(first.byLag).some(g=>g.t2GivenT1===null))
assert.equal(records[4].review.t1Offset,plan[4].lag);assert.equal(records[4].review.t2Offset,-plan[4].lag)
assert.equal(records[5].review.valid,false);assert.equal(records[6].review.valid,false)
assert.equal(records[7].review.valid,true)
const invalid=projectBlinkReport(scoreBlink({session,config:session.config,randomSeed,trials:[]}))
for(const [lag,g] of Object.entries(report.byLag)){
 const rows=records.filter(r=>r.raw.plan.lag===Number(lag)&&r.review.valid)
 assert.equal(g.valid,rows.length);assert.equal(g.t1Correct,rows.filter(r=>r.review.t1).length)
 assert.equal(g.t2Correct,rows.filter(r=>r.review.t2).length);assert.equal(g.bothCorrect,rows.filter(r=>r.review.both).length)
}
writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,node:process.version,base:'a67f425269283d8281379fdf8234f9fd6b0acebc',session,randomSeed,records,reports:{first,partial:report,invalid}},null,2)+'\n')
console.log(JSON.stringify({success:true,node:process.version,modes:records.map(r=>({mode:r.mode,...r.review,ignored:r.raw.ignored})),totals:{valid:report.valid,t1:report.t1Correct,t2:report.t2Correct,both:report.bothCorrect,t2GivenT1:full.metrics.t2GivenT1Rate},byLag:report.byLag},null,2))
