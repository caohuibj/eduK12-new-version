/** Fail-closed assertions around the existing real async report claim/process helper.
 * No state mutation, service startup, queue reset, worker substitute, or added timer.
 * The race child's aggregate 300s deadline and drainReports' 120s gate remain in force.
 */
import assert from 'node:assert/strict'
function identity(facts,attemptId,attemptEpoch){
 for(const name of ['parent','job','queue','checkpoint'])assert.ok(facts[name],`missing actual ${name} row`)
 assert.equal(facts.parent.id,attemptId);assert.equal(facts.parent.attemptEpoch,attemptEpoch)
 assert.equal(facts.parent.asyncReportEpoch,attemptEpoch)
 assert.equal(facts.job.attemptId,attemptId);assert.equal(facts.job.attemptEpoch,attemptEpoch)
 assert.equal(facts.checkpoint.attemptId,attemptId)
}
function snapshots(facts,attemptId,attemptEpoch,slotKeys){
 assert.equal(slotKeys.length,2);assert.equal(new Set(slotKeys).size,2)
 assert.equal(facts.snapshots.length,2)
 assert.deepEqual(facts.snapshots.map(s=>s.slotKey).sort(),[...slotKeys].sort())
 for(const s of facts.snapshots){assert.equal(s.compositeAttemptId,attemptId);assert.equal(s.attemptEpoch,attemptEpoch);assert.equal(s.unitType,'FORM_SECTION');assert.equal(s.terminalState,'COMPLETED')}
}
export async function completeTerminalCheckpoint({attemptId,attemptEpoch,slotKeys,baseline,readFacts,drain,record}){
 assert.ok(baseline.queue,'missing actual phase queue baseline')
 assert.equal(baseline.queue.id,'reports');assert.ok(Number.isSafeInteger(baseline.queue.pending)&&baseline.queue.pending>=0)
 assert.ok(Array.isArray(baseline.otherJobs));assert.ok(baseline.otherJobs.every(j=>j.attemptId!==attemptId),'terminal fixture must be new in this phase')
 const before=await readFacts();await record('before-drain',before)
 identity(before,attemptId,attemptEpoch);snapshots(before,attemptId,attemptEpoch,slotKeys)
 assert.equal(before.parent.status,'IN_PROGRESS');assert.equal(before.job.status,'PENDING');assert.equal(before.job.budgetHeld,true);assert.equal(before.job.attemptCount,0)
 assert.ok(before.checkpoint.payloadEncrypted);assert.ok(before.checkpoint.payloadHash);assert.ok(before.checkpoint.expiresAt)
 assert.deepEqual(before.queue,{...baseline.queue,pending:baseline.queue.pending+1})
 assert.deepEqual(before.otherJobs,baseline.otherJobs,'nonfixture report jobs changed before drain')
 // Caller supplies the unchanged C20/C21 helper: other jobs locked, original claim/process only.
 await drain([attemptId])
 const after=await readFacts();await record('after-drain',after)
 identity(after,attemptId,attemptEpoch);snapshots(after,attemptId,attemptEpoch,slotKeys)
 assert.equal(after.parent.status,'COMPLETED');assert.ok(after.parent.completedAt)
 assert.equal(after.job.id,before.job.id);assert.equal(after.job.status,'READY');assert.equal(after.job.attemptCount,1);assert.equal(after.job.budgetHeld,false)
 assert.equal(after.checkpoint.payloadEncrypted,null);assert.equal(after.checkpoint.payloadHash,null);assert.equal(after.checkpoint.expiresAt,null)
 assert.equal(after.checkpoint.successfulSaveCount,before.checkpoint.successfulSaveCount)
 assert.ok(after.checkpoint.revision>before.checkpoint.revision)
 const stableCheckpoint=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['payloadEncrypted','payloadHash','expiresAt','revision','updatedAt'].includes(key)))
 assert.deepEqual(stableCheckpoint(after.checkpoint),stableCheckpoint(before.checkpoint),'terminal cleanup changed checkpoint identity or budget')
 assert.deepEqual(after.queue,baseline.queue,'real report completion must return queue singleton to phase baseline')
 assert.deepEqual(after.otherJobs,baseline.otherJobs,'nonfixture report jobs changed during drain')
 assert.deepEqual(after.snapshots,before.snapshots,'accepted unit snapshots changed during parent completion')
 return {case:'parent-terminal-async-report-cleanup',parentStatusBefore:before.parent.status,parentStatusAfter:after.parent.status,jobStatusBefore:before.job.status,jobStatusAfter:after.job.status,jobClaims:after.job.attemptCount,acceptedSnapshots:after.snapshots.length,queuePendingBaseline:baseline.queue.pending,queuePendingBefore:before.queue.pending,queuePendingAfter:after.queue.pending,revisionBefore:before.checkpoint.revision,revisionAfter:after.checkpoint.revision,successfulSaveCount:after.checkpoint.successfulSaveCount,otherJobsUnchanged:true}
}
