import{execFileSync}from'node:child_process';import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{nativeBinding,NATIVE_BRANCH,PACKAGE_BRANCH,PACKAGE_MARKER,requireNativeQualification,validateNativeBoundary,requireNativeEvidence,nativePlan,observeNativeMain}from'./school-teacher-native.mjs';
import{binding}from'./school-teacher-scope.mjs';import{inspectHistoricalCase,requireReviewedCase}from'./school-teacher-checks.mjs';
import{verifyNativeEvidence,readNativeEvidenceBytes}from'./school-teacher-native-evidence.mjs';
function fixture(){const b=structuredClone(nativeBinding(PACKAGE_BRANCH)),entries=Object.entries({...b.source,...b.controls}).map(([file,e])=>({file,oldBlob:e.before||'0'.repeat(40),newBlob:e.after||'c'.repeat(40),oldMode:e.before?'100644':'000000',newMode:'100644',status:e.before?'M':'A'}));return{b,o:{event:'pull_request',repository:b.repository,branch:PACKAGE_BRANCH,draft:true,forceFull:false,base:b.base,sourceHead:'a'.repeat(40),checkoutHead:'b'.repeat(40),sourceTree:'d'.repeat(40),checkoutTree:'d'.repeat(40),productTree:b.productTree,frontendTree:b.frontendTree,backendTree:b.backendTree,protectedInputs:structuredClone(b.protectedInputs),entries}}}
test('PR392 is independent of388, closed over the complete patch and cannot activate without new control review',()=>{
 assert.equal(binding({CI_HEAD_REF:PACKAGE_BRANCH}).branch,PACKAGE_BRANCH);assert.equal(binding({CI_HEAD_REF:NATIVE_BRANCH}).branch,NATIVE_BRANCH);assert.equal(binding({PLAN:JSON.stringify({candidate:'native-bundle',publicPackage:true})}).branch,PACKAGE_BRANCH);
 const{b,o}=fixture();assert.equal(b.enabled,false);assert.throws(()=>requireNativeQualification(b));assert.notEqual(b.evidence.reviewSha256,nativeBinding().evidence.reviewSha256);
 const plan=validateNativeBoundary(b,o,{draftPreflight:true});assert.equal(plan.publicPackage,true);assert.deepEqual(plan.requiredJobs,['admission']);
 for(const patch of [{branch:NATIVE_BRANCH},{base:'0'.repeat(40)},{entries:o.entries.slice(1)},{entries:[...o.entries,{file:'unexpected',status:'A'}]},{frontendTree:'0'.repeat(40)}])assert.throws(()=>validateNativeBoundary(b,{...o,...patch},{draftPreflight:true}));
 assert.throws(()=>nativePlan([],b.base,o.checkoutHead,()=>'',{CI_HEAD_REF:PACKAGE_BRANCH,CI_EVENT:'workflow_dispatch'},b));
 assert(b.controls[PACKAGE_MARKER]);
});
test('only26 approved original passed rows are consumed, with original failures and filtering preserved',()=>{
 const b=nativeBinding(PACKAGE_BRANCH),bytes=readNativeEvidenceBytes(b),helpers={inspectHistoricalCase,requireReviewedCase};
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();const result=verifyNativeEvidence(bytes,b,helpers,git);assert.equal(result.admittedCases.length,26);assert.equal(result.applicationTestsExecutedInCI,false);assert(result.observations.some(o=>o.wholeInvocationSuccess===false));const changed=JSON.parse(bytes);changed.reports[0].selected.push(0);assert.throws(()=>verifyNativeEvidence(Buffer.from(JSON.stringify(changed)),b,helpers,git));
});
test('single new browser consumer uses same compiled contexts and never replaces sandbox or replays FINAL',()=>{
 const runtime=readFileSync(new URL('./school-teacher-native-runtime.py',import.meta.url),'utf8'),browser=readFileSync(new URL('../../server-version/e2e/school-teacher-package-browser.cjs',import.meta.url),'utf8'),factory=readFileSync(new URL('../../server-version/e2e/school-teacher-package-fixture.cjs',import.meta.url),'utf8');
 assert(runtime.includes("if plan.get('publicPackage')"));assert(runtime.includes("'SCANNED_BROWSER_PENDING'"));assert(browser.includes('chromium.launch(CHROME_LAUNCH_OPTIONS)'));assert(browser.includes("runtime.baseImages.node"));assert(browser.includes('backend.imageId'));assert(!browser.includes('--no-sandbox'));assert(factory.includes('Only the isolated browser fixture database is allowed'));for(const forbidden of ['submitScaleAssessmentFinal','submitSituationalAttemptFinal','finalizeCompositeAttemptIfReady','computeProfile'])assert(!factory.includes(forbidden));
 const workflow=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');assert(workflow.includes('fromJSON(inputs.plan).publicPackage == true'));assert(!workflow.includes('school-teacher-package.yml'));
});
test('old388/391 main observation still selects only388; package main can never borrow its green',async()=>{
 let first;await assert.rejects(observeNativeMain({candidate:'native-bundle',postMerge:true,requiredJobs:nativeBinding().requiredJobs},async path=>{first=path;throw Error('stop')}));assert.equal(first,'/pulls/388');
 await assert.rejects(observeNativeMain({candidate:'native-bundle',postMerge:true,publicPackage:true,requiredJobs:nativeBinding().requiredJobs},async path=>{first=path;throw Error('stop')}));assert.equal(first,'/pulls/392');
});
