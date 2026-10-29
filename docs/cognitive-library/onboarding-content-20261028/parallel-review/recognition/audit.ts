import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {createGuidedRecognitionSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/continuous-recognition/package'
import {freezeGuidedRecognitionManifest,scoreGuidedRecognition,projectNativeRecognitionReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/continuous-recognition/native'
import {RecognitionCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/continuous-recognition/capture'

const formal=Array.from({length:74},(_,i)=>'review_formal_'+i),practice=Array.from({length:6},(_,i)=>'review_practice_'+i)
const session=createGuidedRecognitionSnapshot('experience',formal,practice,undefined,{status:'synthetic-review-only',manifestHash:'f'.repeat(64),evidenceRef:'LOGICAL-ID UNIT EXAMPLE ONLY; NO IMAGE BYTES OR ASSET CLEARANCE'})
const randomSeed='recognition-independent-20261028',manifest=freezeGuidedRecognitionManifest(session.config,randomSeed).manifest
const pairs=manifest.targetPairs.slice(0,3),endIndex=pairs[2].repeatIndex
const cases=['negative-same-pair-denominator','last-repeat-interrupted'].map(name=>{
 let now=100
 const captured=[]
 for(const p of manifest.formal.slice(0,endIndex+1)){
  const cap=new RecognitionCapture(p.index,p.assetId,p.kind,now),first=pairs.some(pair=>pair.firstIndex===p.index)
  if(first){cap.input(now+100,'keyboard','r');cap.input(now+110,'keyboard','r',true);cap.input(now+120,'touch')}
  if(name==='last-repeat-interrupted'&&p.index===endIndex){cap.input(now+130,'touch');cap.interrupt('blur',now+200)}
  else{cap.tick(now+750);if(p.index===pairs[0].repeatIndex)cap.input(now+850,'keyboard','R');cap.tick(now+1550)}
  const envelope=cap.envelope();captured.push({envelope,allEvents:cap.allEvents(),actual:cap.actualExposure()});now=envelope.endedAtPerfMs
 }
 const input={session,config:session.config,randomSeed,trials:captured.map(c=>c.envelope)},score=scoreGuidedRecognition(input),report=projectNativeRecognitionReport(score)
 const denominator=name==='last-repeat-interrupted'?2:3
 assert.equal(score.metrics.completeTargetPairs,denominator)
 assert.equal(score.metrics.targetHits,1);assert.equal(score.metrics.targetFalseAlarms,denominator)
 assert.equal(score.metrics.hitRate,1/denominator);assert.equal(score.metrics.falseAlarmRate,1)
 assert.equal(score.metrics.correctedRecognitionRate,1/denominator-1)
 assert.equal(report.state,'limited');assert.equal(report.hitRate,null);assert.equal(report.correctedRecognitionRate,null)
 const audit=score.metrics.candidateAudit as {extraSeen:number;ignoredEvents:number;firstResponses:Array<{phase:string}>}
 assert.equal(audit.extraSeen,3);assert.equal(audit.ignoredEvents,3)
 assert.ok(audit.firstResponses.some(r=>r.phase==='isi'))
 return {name,input,captured,score,report}
})
const first=manifest.formal[0],coarse=new RecognitionCapture(0,first.assetId,first.kind,100)
coarse.input(120,'keyboard','r');coarse.interrupt('blur',120)
const clipped=coarse.envelope()
assert.equal(clipped.payload.events.length,0);assert.equal(coarse.allEvents().length,1);assert.equal(clipped.flags.premature,true)
const empty=projectNativeRecognitionReport(scoreGuidedRecognition({session,config:session.config,randomSeed,trials:[]}))
assert.equal(empty.state,'invalid');assert.equal(empty.hitRate,null);assert.equal(empty.denominator,null)
writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,node:process.version,base:'a67f425269283d8281379fdf8234f9fd6b0acebc',targetPairs:pairs,cases,coarseEnd:{clipped,allEvents:coarse.allEvents()},empty},null,2)+'\n')
console.log(JSON.stringify({success:true,node:process.version,prefixLength:endIndex+1,cases:cases.map(c=>({name:c.name,pairs:c.score.metrics.completeTargetPairs,hits:c.score.metrics.targetHits,firstFalseAlarms:c.score.metrics.targetFalseAlarms,hitRate:c.score.metrics.hitRate,falseAlarmRate:c.score.metrics.falseAlarmRate,difference:c.score.metrics.correctedRecognitionRate,publicState:c.report.state})),coarseBoundaryPreserved:true},null,2))
