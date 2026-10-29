import fs from 'node:fs'
import assert from 'node:assert/strict'
import {EnumerationCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/enumeration/capture'
import {enumerationArtifact,enumerationContextPlan,enumerationDigest,type EnumerationContext} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/enumeration/display'
import {enumerationFixtureContext} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/enumeration/fixtures.test-support'
import {createEnumerationRecipeSnapshot,createEnumerationSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/enumeration/package'
import {ENUMERATION_PROTOCOL,type EnumerationTrial} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/enumeration/protocol'
import {scoreEnumerationRecipe} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/enumeration/scorer'
import {enumerationTrialEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/enumeration/trial-envelope'
import {projectEnumerationReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/enumeration/report'

const session=createEnumerationRecipeSnapshot('experience'),randomSeed='enumeration-golden-中文-20261026',source=enumerationFixtureContext()
const context:EnumerationContext={...source,contextId:'synthetic-enumeration-independent-review',attemptId:JSON.stringify(['synthetic-enumeration-review',1]),usage:'AUTHENTICATED_CONTENT_CANDIDATE',config:session.config,randomSeed,recipe:session.config.stimulusRecipe,
 calibration:{...source.calibration!,id:'SYNTHETIC-SELF-REPORT-NOT-PHYSICAL-EVIDENCE',source:'self_reported_ruler_and_distance'}}
const artifact=enumerationArtifact(context)
const records=Array.from({length:6},(_,index)=>{
 const plan=enumerationContextPlan(context,index),c=new EnumerationCapture(context,plan,'test-review-'+index,artifact.artifactHash),base=index*20000
 c.frame(base)
 if(index===4){c.frame(base+10000);assert.equal(c.stage,'stimulus');assert.equal(c.core.maskOnsetPerfMs,null);c.interrupt('runner_restart',base+10010);return c.record()}
 c.frame(base+1000);c.frame(base+(index===5?1067:1050))
 if(index===3){c.interrupt('window_blur',base+1100);return c.record()}
 const response=base+(index===5?2067:2050);c.frame(response)
 const value=index===1?plan.targetValue-1:index===2?plan.targetValue+2:plan.targetValue,elapsed=[0,100,200,0,0,300][index]
 c.change(value,index===1?'keyboard':'pointer',response+elapsed);assert.equal(c.confirm('touch',response+elapsed),true)
 const record=c.record(),hash=enumerationDigest(record)
 assert.equal(c.confirm('keyboard',response+elapsed+10),false);assert.equal(c.change(1,'keyboard',response+elapsed+20),false)
 assert.equal(enumerationDigest(c.record()),hash)
 return record
})
assert.deepEqual(records.map(r=>r.core.plan.targetValue),[9,5,6,5,8,7])
const input={session,config:session.config,randomSeed,trials:records.map(r=>enumerationTrialEnvelope(r.core as EnumerationTrial))},score=scoreEnumerationRecipe(input),report=projectEnumerationReport(score)
assert.deepEqual([score.metrics.receivedTrialCount,score.metrics.includedTrialCount,score.metrics.excludedTrialCount,score.metrics.correctTrialCount],[6,4,2,2])
assert.deepEqual([score.metrics.overallAccuracy,score.metrics.signedMeanError,score.metrics.meanAbsoluteError,score.metrics.medianReportOperationMs],[.5,.25,.75,150])
const expected={5:{observed:2,included:1,correct:0,error:-1,absolute:1,operation:100},6:{observed:1,included:1,correct:0,error:2,absolute:2,operation:200},7:{observed:1,included:1,correct:1,error:0,absolute:0,operation:300},8:{observed:1,included:0,correct:0,error:null,absolute:null,operation:null},9:{observed:1,included:1,correct:1,error:0,absolute:0,operation:0}}
for(const r of score.metrics.byQuantity as any[]){const e=expected[r.targetValue as keyof typeof expected];assert.deepEqual([r.expected,r.observed,r.included,r.correct,r.accuracy,r.signedMeanError,r.meanAbsoluteError,r.medianReportOperationMs],[5,e.observed,e.included,e.correct,e.included?e.correct/e.included:null,e.error,e.absolute,e.operation])}
assert.equal(report.state,'limited');assert.deepEqual(report.headline,{correct:2,denominator:4})
assert.equal(records[3].core.responseValue,null);assert.equal(records[4].core.responseValue,null)
assert.equal(records[5].core.timingFacts.stimulusMaxFrameGapMs,67);assert.equal((score.metrics.excludedTrialIndices as number[]).includes(5),false)
const empty=projectEnumerationReport(scoreEnumerationRecipe({...input,trials:[]}));assert.equal(empty.state,'invalid');assert.equal(empty.summary,null)
const historical=JSON.parse(fs.readFileSync(new URL('../../../next-candidates-20261026/enumeration/implementation/recipe-config-20261026/legacy-descriptors-and-snapshots.json',import.meta.url),'utf8'))
assert.deepEqual(ENUMERATION_PROTOCOL,historical.descriptor.protocol)
for(const profile of ['research','experience'] as const){const old=createEnumerationSnapshot(profile);assert.equal(old.configHash,historical.snapshots[profile].configHash);assert.equal(old.protocolSignature,historical.snapshots[profile].protocolSignature)}
assert.equal(session.protocolSignature,historical.snapshots.experience.protocolSignature)
fs.writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,scope:'six capture records, not a completed 25-trial attempt; self-reported calibration values are synthetic',protocolUnchanged:ENUMERATION_PROTOCOL,protocolSignature:session.protocolSignature,artifact,records,input,expected,score,report,empty},null,2)+'\n')
console.log(JSON.stringify({received:6,included:4,excluded:2,correct:2,accuracy:score.metrics.overallAccuracy,signedMeanError:score.metrics.signedMeanError,byQuantity:score.metrics.byQuantity,state:report.state,protocolSignature:session.protocolSignature}))
