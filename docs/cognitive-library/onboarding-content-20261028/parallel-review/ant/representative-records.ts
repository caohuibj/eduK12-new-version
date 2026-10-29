import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {AntCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/ant/capture'
import {antPlan,antCaptureTiming,type AntConfig} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/ant/protocol'
import {antNativeGeometry,antNativeEnvelope,type AntFrozenDisplay} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/ant/native-protocol'
import {scoreAntGuided,projectAntReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/ant/scorer'
import {canonicalHash} from '../../../../../server-version/backend/src/modules/assessment-runtime/canonical'

const sourcePath=new URL('../../batch-3/ant-browser/archived-fixture.json',import.meta.url),sourceBytes=fs.readFileSync(sourcePath),original=JSON.parse(sourceBytes.toString())[0]
const authority=original.authority,detail=original.detail,session=authority.configSnapshot,config=session.config as AntConfig,seed=authority.session.randomSeed,display=detail.context.administration as AntFrozenDisplay
assert.equal(session.runtimeGeneration,'UNIFIED_V1')
assert.deepEqual(display.geometry,antNativeGeometry(display.referenceCssPx,display.viewingDistanceMm))
const existing=authority.rawSubmission.payload.trials,originalMetrics=authority.resultSnapshot.metrics,originalPublic=authority.resultSnapshot.report.nativeReport.report
// Read and independently calculate from the existing saved bytes; do not rerun capture/scorer/archive for the 48-trial record.
const cue:Record<string,{correct:number;total:number;sum:number;mean:number}>= {},flanker:typeof cue={}
for(const envelope of existing){
 const t=envelope.payload,response=t.events[t.responseIndex]
 assert.ok(response&&response.direction===t.direction&&!t.timedOut&&!t.interruptions.length)
 for(const [group,key] of [[cue,t.cue],[flanker,t.flanker]] as const){group[key]??={correct:0,total:0,sum:0,mean:0};group[key].total++;group[key].correct++;group[key].sum+=response.atPerfMs-t.targetOnsetPerfMs}
 assert.deepEqual(t.presentationBinding,{schemaVersion:1,geometryVersion:display.geometryVersion,geometryHash:display.geometryHash,displayHash:canonicalHash(display)})
}
for(const [name,group,denominator] of [['cue',cue,12],['flanker',flanker,16]] as const)for(const [key,t] of Object.entries(group)){
 t.mean=t.sum/t.correct;assert.equal(t.total,denominator)
 assert.deepEqual(originalMetrics.correctRtByInput.keyboard[name][key],{count:t.correct,sumMs:t.sum,meanMs:t.mean})
}
const differences={alerting:cue.none.mean-cue.double.mean,orienting:cue.central.mean-cue.spatial_valid.mean,conflict:flanker.incongruent.mean-flanker.congruent.mean}
assert.deepEqual(differences,originalMetrics.differencesByInput.keyboard)
for(const d of originalPublic.projection.differences)assert.equal(d.valueMs,differences[d.key as keyof typeof differences])
for(const [i,raw] of detail.records.filter((r:any)=>r.phase==='test').slice(0,2).map((r:any,i:number)=>[i,r.raw]))assert.deepEqual(antNativeEnvelope(raw,canonicalHash(raw.raw.display)).payload,existing[i].payload)

// Six newly captured synthetic software-clock records cover response eligibility, error, timeout, interruption and mixed inputs.
const plan=antPlan(config,seed),records=plan.slice(0,6).map((p,index)=>{
 const start=index*4000,cap=new AntCapture(antCaptureTiming(config,'test'),p,display,detail.context.contextKey,start,detail.realm.timeOriginMs,false)
 if(index===0){cap.input(p.direction,'touch',start+10,true,false);cap.input(p.direction,'touch',start+20,false,true)}
 const cue=start+p.plannedPreCueMs,onset=cue+500
 cap.tick(cue);cap.tick(cue+100)
 if(index===5)cap.input(p.direction,'pointer',onset-50)
 cap.tick(onset)
 if(index===0){cap.input(p.direction,'touch',onset);cap.tick(onset)}
 if(index===1){cap.input(p.direction==='left'?'right':'left','touch',onset+250);cap.tick(onset+250);cap.input(p.direction,'touch',onset+300)}
 if(index===2){cap.input(p.direction,'keyboard',onset+1700);cap.tick(onset+1700)}
 if(index===3)cap.interrupt('window_blur',onset+100)
 if(index===4){cap.input(p.direction,'keyboard',onset+350);cap.tick(onset+350)}
 if(index===5){cap.input(p.direction,'pointer',onset+100);cap.tick(onset+100)}
 cap.tick(start+4000);return cap.record()
})
const trials=records.map(r=>antNativeEnvelope(r,canonicalHash(r.raw.display))),input={session,config,randomSeed:seed,trials},score=scoreAntGuided(input),projection=projectAntReport(score)
assert.deepEqual([score.metrics.receivedTrialCount,score.metrics.validTrialCount,score.metrics.excludedTrialCount,score.metrics.accuracy],[6,4,2,.5])
assert.equal(records[0].core.responseIndex,2);assert.equal(records[1].core.responseIndex,0)
assert.equal(records[2].core.responseIndex,null);assert.equal(records[2].core.timedOut,true)
assert.equal(score.quality.flags.mixedInput,true);assert.equal(projection.state,'invalid');assert.equal(projection.accuracy,null);assert.deepEqual(projection.differences,[])
const rt=score.metrics.correctRtByInput as any
assert.deepEqual(rt.touch.cue[plan[0].cue],{count:1,sumMs:0,meanMs:0})
assert.deepEqual(rt.keyboard.cue[plan[4].cue],{count:1,sumMs:350,meanMs:350})
fs.writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,scope:'six software-clock capture records, not a completed attempt; original 48-trial bytes read arithmetically without recapture/rescore',originalSource:{path:'batch-3/ant-browser/archived-fixture.json',sha256:createHash('sha256').update(sourceBytes).digest('hex')},originalArithmetic:{cue,flanker,differences,displayHash:canonicalHash(display),formalCount:existing.length,practiceCount:detail.records.length-existing.length,selfReportedCalibrationNotPhysicalAccuracyProof:true},input,records,score,projection},null,2)+'\n')
console.log(JSON.stringify({originalDifferences:differences,newReceived:score.metrics.receivedTrialCount,newValid:score.metrics.validTrialCount,newExcluded:score.metrics.excludedTrialCount,accuracy:score.metrics.accuracy,mixedInput:score.quality.flags.mixedInput,state:projection.state,zeroCorrectRt:rt.touch.cue[plan[0].cue]}))
