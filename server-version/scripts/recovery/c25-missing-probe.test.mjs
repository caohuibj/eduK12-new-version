/** New E orchestration pure contracts only; no runtime or database is loaded. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {assertProbeWindow,assertProbeFinal} from './c25-missing-probe.mjs'
const t0='2026-10-19T12:00:00.000Z',releaseAt='2026-10-19T12:05:00.000Z'
const schedule=()=>({t0,releaseAt,submittedAt:'2026-10-19T12:02:59.999Z',closedStartedAt:'2026-10-19T12:03:00.000Z',closedFinishedAt:'2026-10-19T12:03:59.999Z',observedOpenAt:'2026-10-19T12:05:00.001Z'})
test('E schedule requires the genuine 300-second anchor and bounded closed/natural-open windows',()=>{
 assertProbeWindow(schedule())
 for(const patch of [{releaseAt:'2026-10-19T12:06:00.000Z'},{submittedAt:'2026-10-19T12:03:00.001Z'},{closedFinishedAt:'2026-10-19T12:04:00.000Z'},{closedStartedAt:'2026-10-19T12:02:00.000Z'},{observedOpenAt:'2026-10-19T12:04:59.999Z'},{observedOpenAt:'2026-10-19T12:05:30.001Z'},{closedFinishedAt:undefined}])assert.throws(()=>assertProbeWindow({...schedule(),...patch}))
 assert.throws(()=>assertProbeWindow(schedule(),[{receivedAt:'2026-10-19T12:03:59.000Z',serverDate:'Mon, 19 Oct 2026 12:04:00 GMT'}]))
})
test('only the new authenticated 120-trial Cognitive FINAL matches its frozen session',()=>{
 const session={attemptEpoch:1,definitionHash:'d',contextSnapshotHash:null,config:{totalTrials:120}},body={submissionId:'new-e-submission',attemptEpoch:1,definitionHash:'d',contextSnapshotHash:null,trials:Array.from({length:120},(_,trialIndex)=>({trialIndex}))}
 assertProbeFinal(body,session)
 for(const patch of [{trials:body.trials.slice(1)},{attemptEpoch:2},{definitionHash:'other'},{contextSnapshotHash:undefined},{recoveryToken:'old-public-recovery'},{submissionId:''}])assert.throws(()=>assertProbeFinal({...body,...patch},session))
 assert.throws(()=>assertProbeFinal(body,{...session,config:{totalTrials:119}}))
})
test('E orchestration prepares before T0 and uses only one unchanged original drain with distinct private state',()=>{
 const source=fs.readFileSync(new URL('./c25-missing-probe.mjs',import.meta.url),'utf8')
 const anchor=source.indexOf('const t0=await pgNow()');assert.ok(anchor>=0)
 assert.ok(anchor>source.indexOf("item:{type:'COGNITIVE'"));assert.ok(anchor>source.indexOf('await prisma.courseStudent.create'))
 assert.equal((source.match(/await drainReports\(h,\[parent\.id\]\)/g)||[]).length,1)
 assert.equal((source.match(/student\.request\(route,'POST',body\)/g)||[]).length,1)
 assert.match(source,/harness\('missing-probe',600\)/);assert.match(source,/c25-missing-probe-fixture-private\.json/)
 assert.doesNotMatch(source,/h\.write\('c25-fixture-private\.json'|\.user\.update|\.courseStudent\.update|participantMatrix|saveCheckpoint|markTombstones/)
 assert.match(source,/assert\.deepEqual\(oldAfter,oldBefore/);assert.match(source,/readMissingPrerequisites\(process\.argv\[2\]\)/)
})
