import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createBalloonEffortSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/balloon-effort/package'
import {effortPlan} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/balloon-effort/protocol'
import {scoreBalloonEffort,effortEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/balloon-effort/scorer'
import {projectEffortReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/balloon-effort/report'
import {EffortCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/balloon-effort/capture'

// Synthetic first-trial prefixes only: no participant data or complete-suite replay.
const snapshot=createBalloonEffortSnapshot('experience')
const randomSeed=Array.from({length:1000},(_,i)=>`independent-effort-${i}`).find(seed=>{
 const p=effortPlan(snapshot.config,seed)[0]
 return p.highGoal===100&&p.highReward===5&&p.probability===1
})!
assert.ok(randomSeed)
const plan=effortPlan(snapshot.config,randomSeed)[0]
const cases=[]
for(const kind of ['80-presses','120-presses','true-zero','no-choice','interrupted-after-choice','one-frame-late'] as const){
 const c=new EffortCapture(snapshot.config,plan,100)
 for(const t of [1100,2100,2800,4300])c.tick(t)
 const key=plan.highSide==='left'?'key:KeyQ':'key:KeyP'
 if(kind==='no-choice')c.tick(10800)
 else {
  c.down(4400,key,plan.highSide,'keyboard');c.up(4410,key)
  if(kind==='interrupted-after-choice')c.interrupt('participant-ended',4411)
  else {
   c.tick(7410)
   const n=kind==='120-presses'?120:kind==='true-zero'?0:80
   for(let i=0;i<n;i++){
    // Delayed first response; the execution onset must remain 7410.
    c.down(8410+i*50,key,plan.highSide,'keyboard');c.up(8435+i*50,key)
   }
   assert.equal(c.raw.onsets.execution,7410)
   c.tick(32410+(kind==='one-frame-late'?17:0))
  }
 }
 if(c.stage==='feedback'){
  c.tick(c.raw.onsets.feedback!+1000);c.tick(c.raw.onsets.feedback!+2000)
 }
 const input={session:snapshot,config:snapshot.config,randomSeed,trials:[effortEnvelope(c.raw)]}
 const score=scoreBalloonEffort(input),report=projectEffortReport(score)
 const expected=kind==='no-choice'?{state:'invalid',valid:0,high:0,noChoice:1,executionCount:0,totalPresses:null,knownTaskPoints:null}
  :kind==='interrupted-after-choice'?{state:'limited',valid:1,high:1,noChoice:0,executionCount:0,totalPresses:null,knownTaskPoints:null}
  :{state:'limited',valid:1,high:1,noChoice:0,executionCount:1,totalPresses:kind==='120-presses'?120:kind==='true-zero'?0:80,knownTaskPoints:kind==='120-presses'?6:kind==='true-zero'?0:4}
 for(const [key,value] of Object.entries(expected))assert.equal(report[key as keyof typeof report],value,`${kind}:${key}`)
 assert.equal('choicesByEffort' in report,false)
 assert.equal('reportBinding' in report,false)
 cases.push({kind,input,expected,report})
}
writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,base:'fdc72a9739df7cafc2b238ae45f7d976b3c985f2',node:process.version,cases},null,2)+'\n')
console.log(JSON.stringify({success:true,caseCount:cases.length,randomSeed,formula:'5 × 80 / 100 = 4; 5 × 120 / 100 = 6',cases:cases.map(c=>({kind:c.kind,...c.expected}))},null,2))
