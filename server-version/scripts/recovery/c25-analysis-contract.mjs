/** Exact inherited qualification; this supplement does not repeat restore or promote failed phases. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {privateBinding,captureInherited} from './c25-missing-contract.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
export const coreState=path.join(root,'eduk12_c25_continuation_02')
export const analysisState=path.join(root,'eduk12_c25_analysis_01')
export const coreSnapshotSha256='2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85'
export const qualification=Object.freeze({scope:'C25_C19_SUPPRESSED_ANALYSIS_AND_DOWNLOADED_LONG_CSV_ONLY',pairedValidN:1,thresholdBoundaryTested:false,browser:false,capacity:false,newDatabaseRestoreExecuted:false})
const files={
 'c25-missing-result.json':'94949c13018705e3413f9cffa3aa810fc1d0720f173363f60cd16dffa96d76ba',
 'c25-missing-final-db-snapshot.json':coreSnapshotSha256,
 'c25-missing-audit-final-result.json':'46b2479d1996ccac4d682e2502ec03ff7b4f326af3644b6496c16089cafd3726',
 'c25-missing-restore-result.json':'6a57f6ae2d261a58b93fde9d1561282df1c6095bad0e7e9b00a85ae1076d868d',
 'c25-missing-probe-fixture-private.json':'12bf405745467fd50b15c8b7ed8518c50c48ba9f955aee50aa51488a2dfd08ea',
 'c25-fixture-private.json':'e1015179f1c4494c3448000b9c62fb0d18ab82a382c43a43ebb29d0bc7fc4e28',
 'status.json':'23e0f9485477818fca66b669173f09ce67c7a845f52823fd2af2df120dec66b6',
 'frozen-inputs.json':'62d8155e8b609f5271b94242be6cd23172d6c179512d0d58c3f078bc0fc16eaa',
}
const phases=['missing-open','missing-probe','missing-consumers','missing-guards','missing-restore']
const coreFlags=['apiStoppedAfterProbe','requestedPrefixPassed','finalSnapshotVerified','allPriorRowsPreserved','cleanupVerified','sourceUnchanged','inputsUnchanged','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','recoveryArchiveVerified']
function retained(value){
 assert.equal(value.retainedFacts.allOriginalRowsRetained,true);assert.equal(value.retainedFacts.oldRows,6529);assert.equal(value.retainedFacts.originalCheckpointRowsRetained,16)
 assert.equal(value.continuationRetainedFacts.allFailedRowsRetained,true);assert.equal(value.continuationRetainedFacts.oldRows,6582);assert.equal(value.continuationRetainedFacts.checkpointRows,17)
 assert.equal(value.missingRetainedFacts.allSecondFailedRowsRetained,true);assert.equal(value.missingRetainedFacts.oldRows,6651);assert.equal(value.missingRetainedFacts.checkpointRows,20)
}
export function validateCoreFacts({receipt,snapshot,audit,restore,status}){
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.passed,true)
 assert.equal(receipt.scope,'C25_MISSING_ONLY_COMPOSED_SUBCHECKS_NOT_A_SINGLE_FRESH_RUN_OR_CAPACITY')
 assert.deepEqual(receipt.executedPhases,phases);assert.deepEqual(Object.keys(receipt.phases),phases)
 for(const phase of phases){assert.equal(receipt.phases[phase].passed,true);assert.equal(receipt.phases[phase].phase,phase)}
 for(const key of coreFlags)assert.equal(receipt[key],true,key)
 assert.equal(receipt.finalSnapshotSha256,coreSnapshotSha256)
 assert.equal(receipt.apiLifetime.stopped,true);assert.equal(receipt.apiLifetime.expired,false);assert.equal(receipt.apiLifetime.restartAllowed,false)
 assert.equal(Object.keys(receipt.processExits).length,16);for(const exit of Object.values(receipt.processExits))assert.equal(exit,0)
 assert.equal(Object.keys(snapshot.columns).length,217);assert.deepEqual(Object.keys(snapshot.projection).sort(),Object.keys(snapshot.columns).sort())
 assert.equal(Object.values(snapshot.projection).reduce((n,x)=>n+x.rows,0),6667)
 for(const [table,count]of Object.entries({training_attempt_checkpoints:21,composite_report_jobs:148,export_batches:42,export_artifacts:42,submission_idempotency_receipts:0,checkin_submission_idempotency_receipts:0}))assert.equal(snapshot.projection[table].rows,count,table)
 assert.deepEqual(receipt.finalOriginalRowsPreserved,audit.retainedFacts);
 assert.equal(audit.passed,true);assert.equal(audit.mode,'final');assert.equal(audit.snapshotSha256,coreSnapshotSha256);retained(audit)
 assert.equal(restore.passed,true);assert.equal(restore.phase,'missing-restore');assert.equal(restore.currentRows,6667);retained(restore)
 assert.deepEqual(restore.restoredFullRows,{firstFailedRunFullRowsRetained:6582,secondFailedRunFullRowsRetained:6651,originalHTTP03FullRowsRetained:6529,allPostContinuationFullRowsEqual:true,tables:217,postContinuationRows:6667})
 assert.equal(status.state,'stopped');assert.equal(status.cleanupVerified,true);assert.deepEqual(status.cleanupErrors,[])
 return {tables:217,rows:6667,checkpoints:21,reportJobs:148,exportBatches:42,exportArtifacts:42,inheritedRestoreRows:6667,newDatabaseRestoreExecuted:false}
}
export function captureCore(){
 const references={},values={}
 for(const [name,expected]of Object.entries(files)){
  const file=path.join(coreState,name),binding=privateBinding(file);assert.equal(binding.sha256,expected,'Pinned accepted core changed: '+name);references[file]=binding
  if(['c25-missing-result.json','c25-missing-final-db-snapshot.json','c25-missing-audit-final-result.json','c25-missing-restore-result.json','status.json'].includes(name))values[name]=JSON.parse(fs.readFileSync(file))
 }
 const receipt=values['c25-missing-result.json'],runtime=path.join(coreState,'runtime-private.json')
 references[runtime]=privateBinding(runtime);assert.equal(references[runtime].sha256,receipt.privateRuntimeFileSha256)
 const accepted=validateCoreFacts({receipt,snapshot:values['c25-missing-final-db-snapshot.json'],audit:values['c25-missing-audit-final-result.json'],restore:values['c25-missing-restore-result.json'],status:values['status.json']})
 const historical=captureInherited();assert.deepEqual(receipt.inheritedSubchecks,historical)
 for(const [file,binding]of Object.entries(references))assert.deepEqual(privateBinding(file),binding,'Accepted core changed during parsing')
 return {schemaVersion:1,...qualification,sourceSnapshotSha256:coreSnapshotSha256,sourceRows:6667,sourceCheckpoints:21,accepted,references,historical}
}
export function readAnalysisPrerequisites(state){
 assert.equal(path.resolve(state),analysisState)
 const file=path.join(state,'c25-analysis-prerequisites.json');const before=privateBinding(file),value=JSON.parse(fs.readFileSync(file))
 assert.deepEqual(value,captureCore());assert.deepEqual(privateBinding(file),before);return value
}
export function issueAnalysisPrerequisites(state){
 assert.equal(path.resolve(state),analysisState);const value=captureCore()
 fs.writeFileSync(path.join(state,'c25-analysis-prerequisites.json'),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});return readAnalysisPrerequisites(state)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[action,state,...rest]=process.argv.slice(2);assert.equal(rest.length,0);assert.ok(['--issue-prerequisites','--validate-prerequisites'].includes(action))
 const value=action==='--issue-prerequisites'?issueAnalysisPrerequisites(state):readAnalysisPrerequisites(state)
 console.log(JSON.stringify({valid:true,scope:value.scope,sourceRows:value.sourceRows,sourceSnapshotSha256:value.sourceSnapshotSha256}))
}
