/** New inherited-subcheck contract only; reads pinned private evidence, no DB. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {captureInherited,validateInheritedFacts,privateBinding,originalFailure,priorContinuation,sourceSnapshotSha256} from './c25-missing-contract.mjs'
const read=(root,name)=>JSON.parse(fs.readFileSync(path.join(root,name)))
function actual(){return {first:read(originalFailure,'c25-runtime-result.json'),second:read(priorContinuation,'c25-continuation-result.json'),upgrade:read(originalFailure,'c25-upgrade-result.json'),prepare:read(originalFailure,'c25-prepare-result.json'),fixturePrepare:read(priorContinuation,'c25-continuation-prepare-result.json'),scheduled:read(priorContinuation,'c25-scheduled-result.json'),baseline:read(priorContinuation,'c25-scheduled-baseline-private.json'),before:read(priorContinuation,'c25-scheduled-before-drain-private.json'),after:read(priorContinuation,'c25-scheduled-after-drain-private.json'),snapshot:read(priorContinuation,'c25-continuation-final-db-snapshot.json'),audit:read(priorContinuation,'c25-continuation-audit-final-result.json')}}
test('actual pinned failures yield exact inherited subchecks without promoting either false phase',()=>{
 const value=captureInherited();assert.equal(value.sourceRows,6651);assert.equal(value.sourceCheckpoints,20);assert.equal(value.sourceSnapshotSha256,sourceSnapshotSha256)
 assert.equal(value.preservedFalseReceipts.length,2);assert.equal(value.accepted.closedHttp.closedMatrixRequests,81);assert.equal(value.accepted.closedHttp.scheduledRequests,143)
 assert.equal(value.accepted.closedHttp.closedFinishedAtMissing,true);assert.equal(value.accepted.typedFinals,8);assert.equal(value.accepted.teacherCsvRows,2)
 assert.deepEqual(value.requiredNewPhases,['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore'])
})
test('new inherited contract rejects invented success/timing, changed terminal facts, and loss of any protected row',()=>{
 const good=actual();validateInheritedFacts(good)
 for(const mutate of [x=>x.first.passed=true,x=>x.second.passed=true,x=>x.scheduled.passed=true,x=>x.scheduled.schedule.closedFinishedAt=x.scheduled.windowDiagnostic.observedAt,x=>x.scheduled.windowDiagnostic.observedAt='2026-10-19T10:32:32.000Z',x=>x.scheduled.requests.pop(),x=>x.after.cases[0].job.attemptCount=2,x=>x.snapshot.projection.training_attempt_checkpoints.rows=19,x=>x.audit.continuationRetainedFacts.oldRows=6581]){const bad=structuredClone(good);mutate(bad);assert.throws(()=>validateInheritedFacts(bad))}
})
test('private inherited evidence rejects aliases and permissions while detecting changed bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c25-missing-private-test-'));try{const file=path.join(dir,'evidence.json');fs.writeFileSync(file,'first',{mode:0o600});const before=privateBinding(file);fs.writeFileSync(file,'other');assert.notEqual(privateBinding(file).sha256,before.sha256)
 fs.chmodSync(file,0o644);assert.throws(()=>privateBinding(file));fs.chmodSync(file,0o600);fs.linkSync(file,path.join(dir,'alias'));assert.throws(()=>privateBinding(file));fs.unlinkSync(path.join(dir,'alias'));fs.symlinkSync(file,path.join(dir,'link'));assert.throws(()=>privateBinding(path.join(dir,'link')))
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
