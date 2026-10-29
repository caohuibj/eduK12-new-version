import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createGradSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/package'
import {gradPlan} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/protocol'
import {reviewGrad} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/analysis'
import {scoreGrad,gradEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/scorer'
import {projectGradReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/report'
import {GradCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/gradcpt/capture'

const snapshot=createGradSnapshot('experience')
const randomSeed=Array.from({length:1000},(_,i)=>`independent-grad-${i}`).find(seed=>{
 const p=gradPlan(snapshot.config,seed)
 return p[1].kind==='city'&&p[2].kind==='city'&&p[3].kind==='mountain'
})!
assert.ok(randomSeed)
const plan=gradPlan(snapshot.config,randomSeed)
const specs=[
 {name:'only-boundary-closed',closed:0,respond:[] as number[],openResponse:false,late:0},
 {name:'first-picture-closed-successor-open',closed:1,respond:[1],openResponse:false,late:0},
 {name:'first-picture-settled-open-response',closed:2,respond:[1],openResponse:true,late:0},
 {name:'negative-dprime',closed:4,respond:[3],openResponse:false,late:0},
 {name:'negative-criterion-zero-omissions',closed:4,respond:[1,2,3],openResponse:false,late:0},
 {name:'one-frame-late',closed:4,respond:[1,2,3],openResponse:false,late:17},
]
const cases=specs.map(spec=>{
 const capture=new GradCapture(snapshot.config,plan,100)
 for(let i=0;i<=spec.closed;i++){
  const start=capture.raw.slots[i].startMs
  capture.tick(start+720)
  if(spec.respond.includes(i)){
   capture.event(start+721,'down','key:Space','keyboard')
   capture.event(start+722,'up','key:Space','keyboard')
  }
  capture.tick(start+800+(i===spec.closed?spec.late:0))
 }
 const last=capture.raw.slots[capture.index].startMs
 capture.tick(last+720)
 if(spec.openResponse){capture.event(last+721,'down','key:Space','keyboard');capture.event(last+722,'up','key:Space','keyboard')}
 capture.interrupt('participant-ended',last+760)
 const raw=capture.raw,input={session:snapshot,config:snapshot.config,randomSeed,trials:[gradEnvelope(raw)]}
 const review=reviewGrad(raw,plan),report=projectGradReport(scoreGrad(input))
 const expectedSettled=Math.max(0,spec.closed-1)
 assert.equal(report.statistics.city+report.statistics.mountain,expectedSettled)
 assert.equal(report.presented,spec.closed)
 assert.equal(report.statistics.medianMs,spec.respond.includes(1)&&expectedSettled>=1?721:null)
 if(spec.name==='negative-dprime'){assert.ok(report.statistics.dPrime!<0);assert.equal(report.statistics.hits,0);assert.equal(report.statistics.falseAlarms,1)}
 if(spec.name==='negative-criterion-zero-omissions'){assert.ok(report.statistics.criterion!<0);assert.equal(report.statistics.omissions,0)}
 return {spec,input,settledRows:review.rows.filter(r=>r.settled),assigned:review.assigned,report}
})
writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,base:'a67f425269283d8281379fdf8234f9fd6b0acebc',node:process.version,cases},null,2)+'\n')
console.log(JSON.stringify({success:true,node:process.version,randomSeed,firstKinds:plan.slice(0,6).map(p=>p.kind),cases:cases.map(c=>({name:c.spec.name,presented:c.report.presented,settled:c.report.statistics.city+c.report.statistics.mountain,statistics:c.report.statistics,inputResponses:c.report.inputResponses,assigned:c.assigned}))},null,2))
