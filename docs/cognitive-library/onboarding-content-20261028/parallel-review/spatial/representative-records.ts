import fs from 'node:fs'
import assert from 'node:assert/strict'
import {SpatialCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/precision-working-memory/capture'
import {createSpatialMemorySnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/precision-working-memory/package'
import {spatialPlan,position,targetAngle,normalizeAngle} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/precision-working-memory/protocol'
import {scoreSpatialMemory,spatialEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/precision-working-memory/scorer'
import {projectSpatialReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/precision-working-memory/report'

const session=createSpatialMemorySnapshot('experience'),randomSeed='spatial-first-selection-review',manifest=spatialPlan(session.config,randomSeed)
let clock=100
const records=manifest.slice(0,4).map((plan,index)=>{
  const cap=new SpatialCapture(session.config,plan,clock)
  if(index===3){cap.interrupt('participant-ended',clock+50);return cap.raw}
  const encoding=clock+plan.itiMs,prompt=encoding+1500
  cap.tick(encoding);cap.tick(encoding+500);cap.tick(prompt)
  const angle=normalizeAngle(targetAngle(plan)+[0,-2,180][index]),xy=position(angle)
  if(index===1){
    cap.keyboard(prompt+100,null)
    cap.keyboard(prompt+200,angle-plan.keyboardStartAngle)
  }else{
    const input=index===0?'mouse':'pen'
    cap.pointer(prompt+100,xy.x,xy.y,input,'down')
    cap.pointer(prompt+150,xy.x,xy.y,input,'move')
    cap.pointer(prompt+200,xy.x,xy.y,input,'up')
  }
  assert.equal(cap.selection?.firstSelectedAtMs,prompt+100)
  assert.equal(cap.selection?.lastAdjustedAtMs,prompt+200)
  assert.equal(cap.confirm(prompt+300),true)
  clock=prompt+400
  return cap.raw
})
const input={session,config:session.config,randomSeed,trials:records.map(spatialEnvelope)}
const score=scoreSpatialMemory(input),report=projectSpatialReport(score)
assert.equal(score.metrics.validTrialCount,3)
assert.equal(report.received,4);assert.equal(report.excluded,1);assert.equal(report.state,'limited')
assert.ok(Math.abs(records[0].signedErrorDeg!)<1e-8)
assert.ok(Math.abs(records[1].signedErrorDeg!+2)<1e-8)
assert.equal(records[2].signedErrorDeg,-180)
assert.equal(records[3].signedErrorDeg,null)
for(const condition of report.conditions){
  const errors=records.slice(0,3).filter(r=>r.plan.setSize===condition.setSize).map(r=>Math.abs(r.signedErrorDeg!))
  assert.equal(condition.valid,errors.length)
  assert.equal(condition.planned,20)
  assert.ok(errors.length===0?condition.meanAbsoluteErrorDeg===null:Math.abs(condition.meanAbsoluteErrorDeg!-errors.reduce((a,b)=>a+b,0)/errors.length)<1e-8)
}
const oneRecordReport=projectSpatialReport(scoreSpatialMemory({...input,trials:input.trials.slice(0,1)}))
assert.equal(oneRecordReport.conditions.find(c=>c.valid===0)?.meanAbsoluteErrorDeg,null)
assert.ok(Math.abs(oneRecordReport.conditions.find(c=>c.valid===1)!.meanAbsoluteErrorDeg!)<1e-8)
const emptyReport=projectSpatialReport(scoreSpatialMemory({...input,trials:[]}))
assert.equal(emptyReport.state,'invalid')
assert.deepEqual(emptyReport.conditions.map(c=>c.meanAbsoluteErrorDeg),[null,null])
fs.writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,scope:'four records captured by the actual SpatialCapture; not a completed 40-trial attempt',input,score,report,oneRecordReport,emptyReport},null,2)+'\n')
console.log(JSON.stringify({received:report.received,excluded:report.excluded,state:report.state,conditions:report.conditions,signedErrors:records.map(r=>r.signedErrorDeg),emptyState:emptyReport.state}))
