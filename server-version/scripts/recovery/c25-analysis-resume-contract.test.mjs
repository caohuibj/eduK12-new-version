import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAnalysisFailure,qualification,FAILED_FILES,analysisResumeState,failedAnalysisState} from './c25-analysis-resume-contract.mjs'
function fixture(){
 const inherited={receipt:{schemaVersion:1,passed:false,scope:'C25_C19_SUPPRESSED_ANALYSIS_AND_DOWNLOADED_LONG_CSV_ONLY',executedPhases:[],phases:{},finalSnapshotVerified:false,newDatabaseRestoreExecuted:false,processExits:{'c25-analysis-execute':1,'c25-analysis-audit-final':1},apiLifetime:{stopped:true,expired:false}},phase:{passed:false,phase:'analysis-execute',checks:[],requests:Array.from({length:31},()=>({status:200}))},status:{state:'stopped',cleanupVerified:true,cleanupErrors:[]},fixture:{schemaVersion:1,cases:{}},before:{queue:{id:'reports',pending:3},cases:[],otherJobs:[]},baseline:{queue:{id:'reports',pending:0},otherJobs:Array.from({length:148},(_,i)=>({id:'old-'+i}))}}
 for(const k of ['cleanupVerified','sourceUnchanged','inputsUnchanged','failureEvidenceUnchanged','priorContinuationEvidenceUnchanged','coreEvidenceUnchanged','recoveryArchiveVerified','oldMaterialFilesPreserved'])inherited.receipt[k]=true
 inherited.before.otherJobs=structuredClone(inherited.baseline.otherJobs)
 for(const [i,key]of ['MA','SA','MB'].entries()){
  const id='attempt-'+key,epoch='epoch-'+key,count=i===0?2:1
  inherited.fixture.cases[key]={attemptId:id,attemptEpoch:epoch,finals:Array(count).fill({accepted:true})}
  inherited.before.cases.push({parent:{id,attemptEpoch:epoch,status:'IN_PROGRESS',runtimeGeneration:'UNIFIED_V1'},job:{attemptId:id,attemptEpoch:epoch,status:'PENDING',attemptCount:0,budgetHeld:true,requestedRevision:count,reportEncrypted:null,leaseToken:null,leaseExpiresAt:null,completedAt:null},snapshots:Array(count).fill({accepted:true}),forms:Array(i===2?0:1).fill({}),scales:Array(i===1?0:1).fill({}),cognitive:[],sjt:[],checkpoints:[]})
 }
 return inherited
}
test('frozen failure is inherited as failed with unknown current DB, never promoted',()=>{
 const result=validateAnalysisFailure(fixture());assert.equal(result.failedReceiptPassed,false);assert.equal(result.failedFinalSnapshotVerified,false);assert.equal(result.currentDatabaseStateNotYetObserved,true)
 assert.equal(qualification.finalsSubmittedThisRun,0);assert.equal(qualification.attemptsCreatedThisRun,0)
 assert.equal(Object.keys(FAILED_FILES).length,37);assert.notEqual(analysisResumeState,failedAnalysisState)
})
test('failure contract rejects promotion, altered budget/jobs and lost accepted facts',()=>{
 const changes=[x=>x.receipt.passed=true,x=>x.receipt.finalSnapshotVerified=true,x=>x.receipt.executedPhases.push('analysis-execute'),x=>x.before.queue.pending=2,x=>x.before.cases[0].job.attemptCount=1,x=>x.before.cases[0].job.budgetHeld=false,x=>x.before.cases[0].snapshots.pop(),x=>x.before.otherJobs[0].id='changed',x=>x.phase.requests.pop(),x=>x.status.cleanupErrors.push('failed')]
 for(const mutate of changes){const value=fixture();mutate(value);assert.throws(()=>validateAnalysisFailure(value))}
})
