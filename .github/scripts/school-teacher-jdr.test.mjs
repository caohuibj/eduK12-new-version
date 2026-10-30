import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeBinding,validateNativeBoundary,requireNativeQualification,requireNativeEvidence,nativePlan,nativeSastConfig,observeNativeMain,JDR_BRANCH,JDR_MARKER,PACKAGE_MARKER,NATIVE_BRANCH,PACKAGE_BRANCH,NATIVE_JOBS} from './school-teacher-native.mjs';
import {binding} from './school-teacher-scope.mjs';
import {inspectHistoricalCase,requireReviewedCase} from './school-teacher-checks.mjs';
import {verifyNativeEvidence,readNativeEvidenceBytes} from './school-teacher-native-evidence.mjs';
function fixture(){
 const b=nativeBinding(JDR_BRANCH),entries=Object.entries({...b.source,...b.controls}).map(([file,v])=>({file,status:v.before?'M':'A',oldMode:v.before?'100644':'000000',newMode:'100644',oldBlob:v.before??'0'.repeat(40),newBlob:v.after??'c'.repeat(40)}));
 const o={repository:b.repository,event:'pull_request',branch:JDR_BRANCH,draft:true,forceFull:false,base:b.base,sourceHead:'a'.repeat(40),checkoutHead:'b'.repeat(40),sourceTree:'d'.repeat(40),checkoutTree:'d'.repeat(40),productTree:b.productTree,frontendTree:b.frontendTree,backendTree:b.backendTree,protectedInputs:b.protectedInputs,entries};return {b,o};
}
test('JD-R Draft admits only its exact closed inputs; altered, missing and mixed inputs refuse',()=>{
 const {b,o}=fixture(),plan=validateNativeBoundary(b,o,{draftPreflight:true});assert.equal(plan.jdrDemo,true);assert.equal(plan.preflightOnly,true);assert.deepEqual(plan.requiredJobs,['admission']);
 const changed=structuredClone(o);changed.entries.find(e=>e.file!==JDR_MARKER).newBlob='f'.repeat(40);assert.throws(()=>validateNativeBoundary(b,changed,{draftPreflight:true}));
 const missing=structuredClone(o);missing.entries.pop();assert.throws(()=>validateNativeBoundary(b,missing,{draftPreflight:true}));
 const executable=structuredClone(o);executable.entries[0].newMode='100755';assert.throws(()=>validateNativeBoundary(b,executable,{draftPreflight:true}));
 assert.throws(()=>nativePlan([{file:JDR_MARKER},{file:PACKAGE_MARKER}],b.base,o.checkoutHead,()=>assert.fail('No reads for mixed candidates'),{CI_HEAD_REF:JDR_BRANCH},b),/Mixed native/);
 assert.throws(()=>requireNativeQualification(b),/pending independent review/);
})
test('JD-R originals retain failures and stay supplements until actual independent activation',()=>{
 const b=nativeBinding(JDR_BRANCH),r=verifyNativeEvidence(readNativeEvidenceBytes(b),b,{inspectHistoricalCase,requireReviewedCase});
 assert.equal(r.pendingFinalReview,true);assert.equal(r.admittedCases.length,0);assert.equal(r.recordedSupplements.length,23);assert.equal(r.observations.length,3);
 assert.throws(()=>requireNativeEvidence(b,{inspectHistoricalCase,requireReviewedCase}),/not admitted/);
 const d=JSON.parse(readNativeEvidenceBytes(b));assert(d.reports.some(r=>r.report.cases.some(c=>c.status==='failed')));assert(d.reports.some(r=>r.report.cases.some(c=>c.status==='skipped')));
})
test('explicit native plan selects JD-R application SAST while historical branches retain their identities',()=>{
 const b=binding({PLAN:JSON.stringify({candidate:'native-bundle',jdrDemo:true})});assert.equal(b.branch,JDR_BRANCH);
 assert.equal(nativeBinding(NATIVE_BRANCH).branch,NATIVE_BRANCH);assert.equal(nativeBinding(PACKAGE_BRANCH).branch,PACKAGE_BRANCH);
 const paths=['.github/scripts/school-teacher-package-bindings.json','.github/scripts/school-teacher-native-runtime.py','.github/scripts/school-teacher-native-runtime.test.py','.github/scripts/exact-candidate-runtime.py'];
 const config=nativeSastConfig(paths,b);assert(config.paths.includes('server-version/backend/src'));assert(config.paths.includes('server-version/frontend/src'));
 assert(!nativeSastConfig(paths,{execution:{sastContinuation:40980640181}}).paths.includes('server-version/backend/src'));
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');assert(workflow.includes('nativeSastConfig(paths,binding())'));assert(workflow.includes('feat/teacher-jdr-bundle-20261030'));
})
test('JD-R main observation reads exact PR405 successful qualifications and refuses any failed gate',async()=>{
 const {b}=fixture(),plan={candidate:'native-bundle',jdrDemo:true,postMerge:true,requiredJobs:NATIVE_JOBS,sourceHead:'a'.repeat(40),head:'b'.repeat(40)};
 const names=['classify changed content',...NATIVE_JOBS.map(x=>'school-teacher / '+x),'school-teacher / qualified','codeql (javascript/typescript SAST)','merge gate / ready PR'];let failed=false;const calls=[];
 const api=async p=>{calls.push(p);if(p==='/pulls/405')return {number:405,merged:true,state:'closed',draft:false,head:{ref:JDR_BRANCH,sha:plan.sourceHead,repo:{full_name:b.repository}},base:{ref:'main',repo:{full_name:b.repository}},merge_commit_sha:plan.head};
 if(p.startsWith('/actions/workflows/ci.yml/runs?'))return {total_count:1,workflow_runs:[{id:40501,head_sha:plan.sourceHead,head_branch:JDR_BRANCH,event:'pull_request',path:'.github/workflows/ci.yml',repository:{full_name:b.repository},status:'completed',conclusion:'success',run_attempt:1}]};
 if(p.includes('/jobs?'))return {total_count:names.length,jobs:names.map((name,i)=>({id:i+1,run_id:40501,run_attempt:1,head_sha:plan.sourceHead,name,status:'completed',conclusion:failed&&name==='school-teacher / native-runtime'?'failure':'success'}))};assert.fail(p)};
 await observeNativeMain(plan,api);assert(calls.every(p=>p==='/pulls/405'||p.startsWith('/actions/')));failed=true;await assert.rejects(observeNativeMain(plan,api));
})
