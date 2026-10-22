import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binding,surveyCloudPlan} from './survey-cloud-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyLocalEvidence(read=file=>readFileSync(file)){
 const file='.github/evidence/survey-cloud/reviewed-local.json',bytes=read(file);
 assert.equal(sha(bytes),binding.evidence[file],'Reviewed local evidence changed');
 const record=JSON.parse(bytes);assert.equal(record.kind,'reviewed-local-evidence');
 assert.equal(record.ciExecuted,false);assert.equal(record.originalExecutionSigned,false);
 assert.equal(record.product,binding.product);assert.equal(record.base,binding.base);
 const reports={};for(const[name,r]of Object.entries(record.reports)){
  const b=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});
  assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256,name);reports[name]=JSON.parse(b);
 }
 const expected={'survey-contracts.json':[109,2],'survey-contracts-retry.json':[2,0],
  'admin-main-integration-contracts.json':[11,0],'survey-clipboard-contract.json':[1,0],
  'survey-mutation-refresh-contract.json':[1,0],'real-findings-contracts.json':[4,0],
  'real-focus-contract.json':[1,0],'local-review-contracts.json':[6,0]};
 const reviewedCases=[];
 for(const[name,[passed,failed]]of Object.entries(expected)){
  const r=reports[name];assert.equal(r.numPassedTests,passed,name);assert.equal(r.numFailedTests,failed,name);
  assert.equal(r.success,failed===0,name);assert.ok(r.testResults.length);
  for(const s of r.testResults)for(const a of s.assertionResults){
   // AppShell's actual imports changed during main integration; fresh CI owns it.
   if(a.status==='passed'&&!s.name.endsWith('/shell.test.tsx'))reviewedCases.push({report:name,name:a.fullName});
  }
 }
 for(const name of ['review-contracts-receipt.json','review-lint-receipt.json','review-types-receipt.json'])assert.equal(reports[name].exitCode,0,name);
 const real=reports['real-flow-summary.json'];assert.equal(real.acceptedRealVisualStateCount,24);
 assert.equal(real.cleanupComplete,true);assert.equal(real.previous122CaseSuiteRepeated,false);
 const final=reports['real-flow-final-state.json'];assert.equal(final.counts.finals,2);assert.equal(final.counts.final_attempts,2);
 assert.deepEqual(final.researcherStatuses,['SUSPENDED','SUSPENDED']);assert.equal(final.testRecruitment,'CLOSED');
 assert.equal(final.temporaryAdministratorEntry.revoked,true);assert.equal(final.newCredentialsFoundInOwnLogsOrTextEvidence,0);
 const current=reports['local-review-summary.json'];assert.equal(current.sourceFiles.length,32);assert.equal(current.changedSinceRealFlowSnapshot.length,4);
 return {status:'REVIEWED_LOCAL_EVIDENCE',originalExecutionSigned:false,ciExecuted:false,countsAreNotAdditive:true,
  reviewedCases,realFormFinals:2,historicalRealVisualStates:24,failedOriginalAssertions:2,
  freshCIRequired:['integrated AppShell contracts','integrated frontend app types','one production compilation','changed AppShell lint','changed JavaScript/TypeScript SAST'],limits:record.limits};
}
function main(){
 assert.equal(process.version,'v24.21.0');const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.deepEqual(surveyCloudPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
 mkdirSync('survey-cloud-evidence',{recursive:true});
 const receipt={...verifyLocalEvidence(),head,components:binding.components};
 writeFileSync('survey-cloud-evidence/local-admission.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
