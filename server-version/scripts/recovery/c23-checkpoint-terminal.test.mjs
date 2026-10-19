/** New deterministic assertion/order fault tests only; no services or DB qualification. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {completeTerminalCheckpoint} from './c23-checkpoint-terminal.mjs'
const clone=value=>structuredClone(value)
function fixture(){
 const baseline={queue:{id:'reports',pending:3},otherJobs:[{id:'historical-job',attemptId:'historical',status:'PENDING',attemptCount:2}]}
 const before={parent:{id:'new',attemptEpoch:1,asyncReportEpoch:1,status:'IN_PROGRESS',completedAt:null},job:{id:'job',attemptId:'new',attemptEpoch:1,status:'PENDING',budgetHeld:true,attemptCount:0},queue:{id:'reports',pending:4},checkpoint:{attemptId:'new',revision:3,successfulSaveCount:2,payloadEncrypted:'ciphertext',payloadHash:'hash',expiresAt:'future',definitionHash:'frozen',createdAt:'original'},snapshots:['first','second'].map(slotKey=>({id:slotKey,slotKey,compositeAttemptId:'new',attemptEpoch:1,unitType:'FORM_SECTION',terminalState:'COMPLETED'})),otherJobs:clone(baseline.otherJobs)}
 const after=clone(before);Object.assign(after.parent,{status:'COMPLETED',completedAt:'actual-time'});Object.assign(after.job,{status:'READY',budgetHeld:false,attemptCount:1});Object.assign(after.checkpoint,{revision:4,payloadEncrypted:null,payloadHash:null,expiresAt:null});after.queue=clone(baseline.queue)
 return {baseline,before,after}
}
async function execute(f){
 const events=[];let reads=0,drains=0
 const promise=completeTerminalCheckpoint({attemptId:'new',attemptEpoch:1,slotKeys:['first','second'],baseline:f.baseline,
  readFacts:async()=>{events.push('read');return clone(reads++?f.after:f.before)},record:async(stage,rows)=>{events.push(stage);assert.ok(rows)},
  drain:async ids=>{events.push('drain');drains++;assert.deepEqual(ids,['new'])}})
 return {promise,events,get drains(){return drains}}
}
test('records actual facts before validation, drains only the new fixture once, then verifies terminal proof',async()=>{
 const x=await execute(fixture());const proof=await x.promise
 assert.deepEqual(x.events,['read','before-drain','drain','read','after-drain']);assert.equal(x.drains,1)
 assert.equal(proof.parentStatusAfter,'COMPLETED');assert.equal(proof.jobStatusAfter,'READY');assert.equal(proof.queuePendingAfter,3);assert.equal(proof.successfulSaveCount,2)
})
test('missing real baseline or parent/job/queue/checkpoint rows fail without calling drain',async()=>{
 for(const field of ['parent','job','queue','checkpoint']){const f=fixture();f.before[field]=null;const x=await execute(f);await assert.rejects(x.promise);assert.equal(x.drains,0);assert.ok(x.events.includes('before-drain'))}
 const f=fixture();f.baseline.queue=null;const x=await execute(f);await assert.rejects(x.promise);assert.equal(x.drains,0)
})
test('wrong pre-drain status, claim, budget, epochs or accepted snapshots fail before processing',async()=>{
 for(const change of [f=>f.before.parent.status='COMPLETED',f=>f.before.parent.asyncReportEpoch=2,f=>f.before.job.status='WAITING',f=>f.before.job.budgetHeld=false,f=>f.before.job.attemptCount=1,f=>f.before.queue.pending=3,f=>f.before.snapshots.pop(),f=>f.before.snapshots[0].terminalState='IN_PROGRESS',f=>f.before.snapshots[0].compositeAttemptId='foreign']){
  const f=fixture();change(f);const x=await execute(f);await assert.rejects(x.promise);assert.equal(x.drains,0)
 }
})
test('uncompleted parent, wrong READY/claim/budget, or unreleased queue never receive terminal proof',async()=>{
 for(const change of [f=>f.after.parent.status='IN_PROGRESS',f=>f.after.parent.completedAt=null,f=>f.after.job.status='PENDING',f=>f.after.job.attemptCount=2,f=>f.after.job.budgetHeld=true,f=>f.after.queue.pending=4]){
  const f=fixture();change(f);const x=await execute(f);await assert.rejects(x.promise);assert.equal(x.drains,1)
 }
})
test('payload/hash/expiry, CAS revision and cumulative count cleanup failures are rejected',async()=>{
 for(const change of [f=>f.after.checkpoint.payloadEncrypted='retained',f=>f.after.checkpoint.payloadHash='retained',f=>f.after.checkpoint.expiresAt='retained',f=>f.after.checkpoint.revision=3,f=>f.after.checkpoint.successfulSaveCount=0,f=>f.after.checkpoint.definitionHash='changed']){
  const f=fixture();change(f);const x=await execute(f);await assert.rejects(x.promise)
 }
})
test('historical report jobs and accepted unit snapshot bytes must remain exact',async()=>{
 for(const change of [f=>f.before.otherJobs[0].attemptCount++,f=>f.after.otherJobs[0].attemptCount++,f=>f.after.snapshots[0].id='changed']){
  const f=fixture();change(f);const x=await execute(f);await assert.rejects(x.promise)
 }
})
