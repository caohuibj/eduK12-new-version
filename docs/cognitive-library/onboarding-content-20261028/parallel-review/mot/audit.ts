import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createMotSnapshot,motDefinition,motTrialEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/mot/package'
import {motTrialPlan,motPosition,projectMotReport,type MotCalibration} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/mot/protocol'
import {runAuthoritativeScorer} from '../../../../../server-version/backend/src/modules/cognitive/v2/authoritative-scorer'
import {MotCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/mot/capture'

const session=createMotSnapshot('experience'),randomSeed='mot-independent-review-20261028',config=session.config,plan=motTrialPlan(config,randomSeed,0)
const calibration:MotCalibration={version:1,method:'ruler_and_distance_self_reported',referenceMm:50,referenceCssPx:190,viewingDistanceMm:350,viewportWidthCssPx:820,viewportHeightCssPx:1180,devicePixelRatio:2,visualViewportScale:1,language:'zh'}
const cases=['two-targets-plus-duplicate','true-zero','interrupted-after-first','one-frame-late'] .map(name=>{
 const cap=new MotCapture(config,plan,calibration,100)
 cap.tick(600);cap.tick(1600)
 for(let at=1640;at<9600;at+=40)cap.tick(at)
 const late=name==='one-frame-late'?17:0
 cap.tick(9600+late);cap.tick(10100+late)
 const others=plan.objects.filter(o=>!plan.targetIds.includes(o.id)).map(o=>o.id)
 const ids=name==='true-zero'?others:[...plan.targetIds.slice(0,2),...others.slice(0,3)]
 let at=10200+late
 for(const [i,id] of ids.entries()){
  const point=motPosition(plan.objects[id],config.motionMs,config)
  assert.equal(cap.select(point,'keyboard',at++,id),true)
  if(name==='two-targets-plus-duplicate'&&i===0){assert.equal(cap.select(point,'keyboard',at++,id),false);assert.equal(cap.trial.responses.length,1)}
  if(name==='interrupted-after-first'){cap.interrupt('window_blur',at++);break}
 }
 const record=cap.record(),envelope=motTrialEnvelope(record.core)
 const score=runAuthoritativeScorer({definition:motDefinition,session,randomSeed,trials:[envelope]})
 const expected=name==='true-zero'?0:name==='interrupted-after-first'?null:2
 assert.equal(score.metrics['meanTargetsSpeed'+plan.speed],expected)
 assert.equal(score.metrics.validTrialCount,name==='interrupted-after-first'?0:1)
 assert.equal(score.metrics['accuracySpeed'+plan.speed],expected===null?null:expected/5)
 const publicModel=projectMotReport(score)
 assert.equal(publicModel.state,'invalid');assert.equal(publicModel.headline,null);assert.deepEqual(publicModel.rows,[])
 assert.equal(record.core.responses[0].objectId,ids[0])
 assert.equal('motionFrameTimesMs' in record.core,false)
 assert.equal(record.raw.motionFrameTimesMs.length,record.core.frameTiming.frameCount)
 return {name,record,envelope,score,publicModel}
})
writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,node:process.version,base:'a67f425269283d8281379fdf8234f9fd6b0acebc',session,randomSeed,cases},null,2)+'\n')
console.log(JSON.stringify({success:true,node:process.version,cases:cases.map(c=>({name:c.name,selected:c.record.core.responses.map(r=>r.objectId),valid:c.score.metrics.validTrialCount,mean:c.score.metrics['meanTargetsSpeed'+plan.speed],accuracy:c.score.metrics['accuracySpeed'+plan.speed],publicState:c.publicModel.state}))},null,2))
