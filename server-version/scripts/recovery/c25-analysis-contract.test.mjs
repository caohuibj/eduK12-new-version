import assert from 'node:assert/strict'
import test from 'node:test'
import {validateCoreFacts,coreSnapshotSha256,qualification,readAnalysisPrerequisites} from './c25-analysis-contract.mjs'
function fixture(){
 const phases=['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore']
 const receipt={schemaVersion:1,passed:true,scope:'C25_MISSING_ONLY_COMPOSED_SUBCHECKS_NOT_A_SINGLE_FRESH_RUN_OR_CAPACITY',executedPhases:phases,phases:Object.fromEntries(phases.map(phase=>[phase,{passed:true,phase}])),finalSnapshotSha256:coreSnapshotSha256,apiLifetime:{stopped:true,expired:false,restartAllowed:false},processExits:Object.fromEntries(Array.from({length:16},(_,i)=>['child'+i,0]))}
 for(const key of ['apiStoppedAfterProbe','requestedPrefixPassed','finalSnapshotVerified','allPriorRowsPreserved','cleanupVerified','sourceUnchanged','inputsUnchanged','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','recoveryArchiveVerified'])receipt[key]=true
 const projection=Object.fromEntries(Object.entries({training_attempt_checkpoints:21,composite_report_jobs:148,export_batches:42,export_artifacts:42,submission_idempotency_receipts:0,checkin_submission_idempotency_receipts:0}).map(([k,rows])=>[k,{rows}]))
 for(let i=0;i<211;i++)projection['table'+i]={rows:i===0?6414:0}
 const layers={retainedFacts:{allOriginalRowsRetained:true,oldRows:6529,originalCheckpointRowsRetained:16},continuationRetainedFacts:{allFailedRowsRetained:true,oldRows:6582,checkpointRows:17},missingRetainedFacts:{allSecondFailedRowsRetained:true,oldRows:6651,checkpointRows:20}}
 receipt.finalOriginalRowsPreserved=structuredClone(layers.retainedFacts)
 return {receipt,snapshot:{columns:Object.fromEntries(Object.keys(projection).map(k=>[k,[]])),projection},audit:{passed:true,mode:'final',snapshotSha256:coreSnapshotSha256,...structuredClone(layers)},restore:{passed:true,phase:'missing-restore',currentRows:6667,...structuredClone(layers),restoredFullRows:{firstFailedRunFullRowsRetained:6582,secondFailedRunFullRowsRetained:6651,originalHTTP03FullRowsRetained:6529,allPostContinuationFullRowsEqual:true,tables:217,postContinuationRows:6667}},status:{state:'stopped',cleanupVerified:true,cleanupErrors:[]}}
}
test('accepted core remains inherited and the supplemental scope never claims new restore or threshold proof',()=>{
 assert.deepEqual(validateCoreFacts(fixture()),{tables:217,rows:6667,checkpoints:21,reportJobs:148,exportBatches:42,exportArtifacts:42,inheritedRestoreRows:6667,newDatabaseRestoreExecuted:false})
 assert.equal(qualification.pairedValidN,1);assert.equal(qualification.thresholdBoundaryTested,false);assert.equal(qualification.newDatabaseRestoreExecuted,false)
})
test('failed phase, changed full baseline, missing zero-cleanup prerequisite and unsafe lifecycle are rejected',()=>{
 for(const mutate of [x=>x.receipt.phases['missing-consumers'].passed=false,x=>x.receipt.executedPhases.pop(),x=>x.snapshot.projection.training_attempt_checkpoints.rows++,x=>x.snapshot.projection.submission_idempotency_receipts.rows=1,x=>x.receipt.apiLifetime.expired=true,x=>x.receipt.processExits.child0=1,x=>x.status.cleanupErrors.push('failure')]){const x=fixture();mutate(x);assert.throws(()=>validateCoreFacts(x))}
})
test('restore and all three historical layers cannot be replaced with a passed boolean',()=>{
 for(const mutate of [x=>delete x.restore.restoredFullRows,x=>x.restore.restoredFullRows.postContinuationRows=6651,x=>x.audit.retainedFacts.oldRows--,x=>x.restore.continuationRetainedFacts.checkpointRows--,x=>x.audit.missingRetainedFacts.allSecondFailedRowsRetained=false]){const x=fixture();mutate(x);assert.throws(()=>validateCoreFacts(x))}
})
test('old evidence cannot be reused as the writable supplement state',()=>{
 assert.throws(()=>readAnalysisPrerequisites('/workspace/scratch/5a77e8bdc1ae/eduk12_c25_continuation_02'))
})
test('pinned accepted core receipt uses an actual preservation object, not a synthetic passed flag',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto')
 const {coreState}=await import('./c25-analysis-contract.mjs')
 const pinned={receipt:['c25-missing-result.json','94949c13018705e3413f9cffa3aa810fc1d0720f173363f60cd16dffa96d76ba'],snapshot:['c25-missing-final-db-snapshot.json',coreSnapshotSha256],audit:['c25-missing-audit-final-result.json','46b2479d1996ccac4d682e2502ec03ff7b4f326af3644b6496c16089cafd3726'],restore:['c25-missing-restore-result.json','6a57f6ae2d261a58b93fde9d1561282df1c6095bad0e7e9b00a85ae1076d868d'],status:['status.json','23e0f9485477818fca66b669173f09ce67c7a845f52823fd2af2df120dec66b6']}
 const actual={};for(const [key,[name,hash]]of Object.entries(pinned)){const bytes=fs.readFileSync(path.join(coreState,name));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);actual[key]=JSON.parse(bytes)}
 assert.equal(validateCoreFacts(actual).rows,6667)
 for(const wrong of [true,false,null,{allOriginalRowsRetained:true}]){const bad=structuredClone(actual);bad.receipt.finalOriginalRowsPreserved=wrong;assert.throws(()=>validateCoreFacts(bad))}
 const changed=structuredClone(actual);changed.receipt.finalOriginalRowsPreserved.oldRows--;assert.throws(()=>validateCoreFacts(changed))
})
