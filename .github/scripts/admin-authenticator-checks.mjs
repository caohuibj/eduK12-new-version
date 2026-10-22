import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bindings,authenticatorPlan} from './admin-authenticator-scope.mjs';
import {changedEntries} from './content-scope.mjs';
export function verifyLocalReports(load=name=>readFileSync('.github/evidence/admin-authenticator/'+name)){
 const reports={};
 for(const[name,hash]of Object.entries(bindings.reports)){
  const bytes=load(name);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Historical report tampered: '+name);reports[name]=JSON.parse(bytes);
 }
 const cases=new Set();let total=0;
 for(const[name,count,pending]of [['authenticator-backend-tests.json',40,0],['authenticator-frontend-tests.json',40,0],['authenticator-additional-boundaries.json',3,12]]){
  const r=reports[name];assert.equal(r.success,true);assert.equal(r.numFailedTests,0);assert.equal(r.numPassedTests,count);assert.equal(r.numPendingTests,pending);
  let passed=0;
  for(const suite of r.testResults)for(const test of suite.assertionResults){
   if(test.status==='pending'){assert.equal(pending,12);continue;}
   assert.equal(test.status,'passed');assert.deepEqual(test.failureMessages,[]);
   const file=suite.name.slice(suite.name.indexOf('/server-version/')+1),key=file+'::'+test.fullName;
   assert.ok(!cases.has(key),'Duplicate admitted assertion');cases.add(key);passed++;
  }
  assert.equal(passed,count);total+=passed;
 }
 assert.equal(total,83);assert.equal(reports['authenticator-frontend-lint-status.json'].exitCode,0);
 const storage=reports['authenticator-storage-roundtrip.json'];
 assert.ok(Object.values(storage.steps).every(code=>code===0));assert.equal(storage.credentialCount,14);
 assert.equal(storage.restoredCipherAndReplayStateMatch,true);assert.equal(storage.negativeStepRejectedWithoutChanges,true);
 return {status:'REVIEWED_LOCAL_EVIDENCE',historicalKind:bindings.historicalKind,originalExecutionSigned:false,ciExecuted:false,originalSource:bindings.originalSource,passed:83,skippedAssertionsAdmitted:0,additionalReportFilteredPreviouslyPassed:12,storageScope:'synthetic users and administrator credentials only',productionDeploymentQualified:false};
}
function main(){
 assert.equal(process.version,'v24.21.0');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const plan=authenticatorPlan(changedEntries(bindings.base,head),bindings.base,head);
 assert.deepEqual(plan,JSON.parse(process.env.PLAN));
 mkdirSync('admin-authenticator-evidence',{recursive:true});
 const receipt={...verifyLocalReports(),head,components:plan.components};
 writeFileSync('admin-authenticator-evidence/local-admission.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
