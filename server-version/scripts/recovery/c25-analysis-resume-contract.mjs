/** Frozen failed supplement facts. Admission still has to observe actual PostgreSQL;
 * the failed run did not retain a final snapshot and is never promoted to PASS. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {captureCore,analysisState as failedAnalysisState,qualification as originalQualification} from './c25-analysis-contract.mjs'
import {privateBinding} from './c25-missing-contract.mjs'
export {failedAnalysisState}
export const analysisResumeState=path.join(path.dirname(failedAnalysisState),'eduk12_c25_analysis_02')
export const qualification=Object.freeze({...originalQualification,scope:'C25_C19_EXISTING_THREE_JOBS_REMAINING_ANALYSIS_CSV_COMPOSITION',attemptsCreatedThisRun:0,finalsSubmittedThisRun:0,inheritedAttempts:3,inheritedFinals:4})
export const FAILED_FILES=Object.freeze({
  "api.log": "90d510b34419105112beefcf830039836e68e3f2e37f659b03c16f0f75df2b71",
  "c25-analysis-audit-baseline-result.json": "c24577b7fc31b5e6601cfac2840a8cbf930010c490fdcb950cbb69ac455ccbde",
  "c25-analysis-audit-baseline.exit": "9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa",
  "c25-analysis-audit-baseline.log": "21ed8eab5442675da3e9c1766e375cb8bb6f6ec25f6783c1d2331d3baf10d92b",
  "c25-analysis-audit-final-error-private.log": "e9d96b0064fdccd6201603a8131d54ae30b72ced3bbc2274c674a87986954004",
  "c25-analysis-audit-final-result.json": "2e3214162b08968bdf1cebc24b97429bf47056aecdd79fae59006e2f935cb943",
  "c25-analysis-audit-final.exit": "4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865",
  "c25-analysis-audit-final.log": "0e674691a73b01a2bee73b8c28f737f3ee8e1978c8d25dd95e721dd0ab760dc7",
  "c25-analysis-before-drain-private.json": "7570e49e8ba7a8d99244dfb4686b496ce8975d7142636fce2c4042608d95788e",
  "c25-analysis-execute-error-private.log": "d2c10a8996e5fc31e2dde319803775de68d66a98c53060b58eeb659da3ba02de",
  "c25-analysis-execute-http-private.jsonl": "d1a0a2d62e15997bf40e781812b539644bc412bd04a68c7dffd27b398af0eed0",
  "c25-analysis-execute-result.json": "bc1f416b391405d83d28633442f9a1b8a706071f7f455ca0ec56ab6517461091",
  "c25-analysis-execute.exit": "4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865",
  "c25-analysis-execute.log": "d51ca2d48bbfd6fcbf9e74dfece20bbabd98d45850776126a173531f6f91d60f",
  "c25-analysis-fixture-private.json": "b382cfde0354bfc4e97d095cc0f39a8adb86348d48549a87aacc0e10c26297ab",
  "c25-analysis-inherit.exit": "9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa",
  "c25-analysis-inherit.log": "123384ee4218381d54ae2491dc96c5c55115c7f80abf20ce499e69d19390c8ac",
  "c25-analysis-material-audit-result.json": "51852425356dcd385f93fb2afbdc77cbfa02102c880b2487ba5b3628858e4013",
  "c25-analysis-material-audit.exit": "9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa",
  "c25-analysis-material-audit.log": "678415c77e598e5602864bc07313a3a2a42290efbffea270330ea562666649dc",
  "c25-analysis-prerequisites.json": "e286da548204fedffece1ed28b63744ad415f8a6739d400ce9f5113f5c72bd02",
  "c25-analysis-protected-rows-private.json": "6fdf758fdc6d0f68335d054111b0f1fa00d35809e7f614bcd445457eec8b62a2",
  "c25-analysis-report-baseline-private.json": "ceddb44f70afc90228e185d2c4463445992cadb2c42fea7d30846c9c65441ee6",
  "c25-analysis-report-child-invocation-private.json": "4ad6469aee2e09636fa59cfd3c804164ddd6dece013b8f1cb482e5bea88f50b7",
  "c25-analysis-report-child-process-private.log": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "c25-analysis-report-child-started-private.json": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "c25-analysis-result.json": "efffe632f5d7f56db83b56dd41cfb10aa00e9903da356baf31af9a3b38530394",
  "c25-analysis-scale-prewrite-private.json": "8eb796825fd90cd0f6308b197c0a54e00e8a9031e0ca1e65ce79169b113d54ee",
  "c25-launcher-error-private.log": "e18949cdd1468d627cefc9ef9bace19d20d738c2b867cc499d40758817106f95",
  "frozen-inputs.json": "cc3d0a5605d80d9494fe24e37037479153df6ba554b49663343856d41916a57c",
  "postgres-readiness.json": "8d0207f9c577fdab5587837a8d1774e35ae2ab2308f095cf0fd74888d99ff5ec",
  "postgres.log": "6096a7a1d78fe68274acd4d12929d472aedde2eaa12bf8c0df9b0b168ba12d28",
  "redis.log": "9a9e55d4cd55fee3635922bb710479780421af9effd0795c23a23e4f3df06793",
  "runtime-private.json": "d4cf029fea478760e7e3c37d0b4cd374b553812a9ad1f66ae2d6981a7d81062b",
  "source-byte-manifest-after.json": "975e0fb5780bc9b16b43e0fb4d2c8da8bfc40adb48bca5b47cc54e27a0ae7368",
  "source-byte-manifest-before.json": "975e0fb5780bc9b16b43e0fb4d2c8da8bfc40adb48bca5b47cc54e27a0ae7368",
  "status.json": "af0346d2ceeb90190ca86f560caf298fcbef563a0ccad72ffa32bcdd1f5b51f5"
})
export const FAILURE_RECEIPT_SHA=FAILED_FILES['c25-analysis-result.json']
export function validateAnalysisFailure({receipt,phase,status,fixture,before,baseline}){
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.passed,false)
 assert.equal(receipt.scope,originalQualification.scope)
 assert.deepEqual(receipt.executedPhases,[]);assert.deepEqual(receipt.phases,{})
 assert.equal(receipt.finalSnapshotVerified,false);assert.equal(receipt.newDatabaseRestoreExecuted,false)
 for(const name of ['cleanupVerified','sourceUnchanged','inputsUnchanged','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','coreEvidenceUnchanged','recoveryArchiveVerified','oldMaterialFilesPreserved'])assert.equal(receipt[name],true,name)
 assert.equal(receipt.processExits['c25-analysis-execute'],1);assert.equal(receipt.processExits['c25-analysis-audit-final'],1)
 assert.equal(receipt.apiLifetime.stopped,true);assert.equal(receipt.apiLifetime.expired,false)
 assert.equal(status.state,'stopped');assert.equal(status.cleanupVerified,true);assert.deepEqual(status.cleanupErrors,[])
 assert.equal(phase.passed,false);assert.equal(phase.phase,'analysis-execute');assert.deepEqual(phase.checks,[])
 assert.equal(phase.requests.length,31);for(const request of phase.requests)assert.equal(request.status,200)
 assert.deepEqual(Object.keys(fixture.cases),['MA','SA','MB'])
 assert.equal(fixture.schemaVersion,1);assert.equal(before.cases.length,3)
 assert.deepEqual(baseline.queue,{id:'reports',pending:0});assert.deepEqual(before.queue,{id:'reports',pending:3})
 assert.equal(baseline.otherJobs.length,148);assert.deepEqual(before.otherJobs,baseline.otherJobs)
 let snapshots=0,finals=0
 for(const [i,key]of ['MA','SA','MB'].entries()){
  const row=before.cases[i],expected=fixture.cases[key]
  assert.equal(row.parent.id,expected.attemptId);assert.equal(row.parent.attemptEpoch,expected.attemptEpoch)
  assert.equal(row.parent.status,'IN_PROGRESS');assert.equal(row.parent.runtimeGeneration,'UNIFIED_V1')
  assert.equal(row.job.attemptId,expected.attemptId);assert.equal(row.job.attemptEpoch,expected.attemptEpoch)
  assert.equal(row.job.status,'PENDING');assert.equal(row.job.attemptCount,0);assert.equal(row.job.budgetHeld,true)
  assert.equal(row.job.requestedRevision,i===0?2:1);assert.equal(row.job.reportEncrypted,null)
  for(const field of ['leaseToken','leaseExpiresAt','completedAt'])assert.equal(row.job[field],null)
  assert.equal(row.snapshots.length,i===0?2:1);snapshots+=row.snapshots.length
  assert.equal(row.checkpoints.length,0);assert.equal(row.cognitive.length,0);assert.equal(row.sjt.length,0)
  assert.equal(row.forms.length,i===2?0:1);assert.equal(row.scales.length,i===1?0:1)
  assert.equal(expected.finals.length,i===0?2:1);finals+=expected.finals.length
 }
 assert.equal(snapshots,4);assert.equal(finals,4)
 return {failedReceiptPassed:false,failedFinalSnapshotVerified:false,successfulHttpResponses:31,observedBeforeDrain:{parents:3,pendingJobs:3,heldBudget:3,attemptCount:0,acceptedSnapshots:4,oldJobs:148},currentDatabaseStateNotYetObserved:true,inheritedAttempts:3,inheritedFinals:4}
}
export function captureAnalysisFailure(){
 assert.deepEqual(fs.readdirSync(failedAnalysisState).sort(),Object.keys(FAILED_FILES).sort(),'Frozen failed evidence path set changed')
 const references={},values={}
 for(const [name,expected]of Object.entries(FAILED_FILES)){
  const file=path.join(failedAnalysisState,name),binding=privateBinding(file)
  assert.equal(binding.sha256,expected,'Frozen analysis failure changed: '+name);references[file]=binding
  if(['c25-analysis-result.json','c25-analysis-execute-result.json','status.json','c25-analysis-fixture-private.json','c25-analysis-before-drain-private.json','c25-analysis-report-baseline-private.json'].includes(name))values[name]=JSON.parse(fs.readFileSync(file))
 }
 const inheritedFailure=validateAnalysisFailure({receipt:values['c25-analysis-result.json'],phase:values['c25-analysis-execute-result.json'],status:values['status.json'],fixture:values['c25-analysis-fixture-private.json'],before:values['c25-analysis-before-drain-private.json'],baseline:values['c25-analysis-report-baseline-private.json']})
 const originalCore=captureCore();assert.deepEqual(values['c25-analysis-result.json'].inheritedCore,originalCore)
 Object.assign(references,originalCore.references)
 for(const [file,binding]of Object.entries(references))assert.deepEqual(privateBinding(file),binding,'Evidence changed during parsing')
 return {schemaVersion:1,...qualification,sourceRows:6667,sourceCheckpoints:21,sourceSnapshotSha256:originalCore.sourceSnapshotSha256,accepted:originalCore.accepted,originalCore,inheritedCore:originalCore,inheritedFailure,references,failureReceiptSha256:FAILURE_RECEIPT_SHA}
}
export function readAnalysisResumePrerequisites(state){
 assert.equal(path.resolve(state),analysisResumeState)
 const file=path.join(state,'c25-analysis-resume-prerequisites.json'),before=privateBinding(file),value=JSON.parse(fs.readFileSync(file))
 assert.deepEqual(value,captureAnalysisFailure());assert.deepEqual(privateBinding(file),before);return value
}
export function issueAnalysisResumePrerequisites(state){
 assert.equal(path.resolve(state),analysisResumeState);const value=captureAnalysisFailure(),file=path.join(state,'c25-analysis-resume-prerequisites.json')
 const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 return readAnalysisResumePrerequisites(state)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[action,state,...rest]=process.argv.slice(2);assert.equal(rest.length,0);assert.ok(['--issue-prerequisites','--validate-prerequisites'].includes(action))
 const value=action==='--issue-prerequisites'?issueAnalysisResumePrerequisites(state):readAnalysisResumePrerequisites(state)
 console.log(JSON.stringify({valid:true,scope:value.scope,sourceRows:value.sourceRows,sourceSnapshotSha256:value.sourceSnapshotSha256}))
}
