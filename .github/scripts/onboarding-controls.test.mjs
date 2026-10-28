import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRANCHES,CONTROLS,MARKER,onboardingPlan,onboardingOutputs} from './onboarding-scope.mjs';
import {verifyOriginalReport,verifyTypeReceipt} from './onboarding-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=c=>c.repeat(40),base=h('a'),head=h('b'),source=h('c'),tree=h('d'),blob=h('e');
function fixture(){
 const file='server-version/backend/src/modules/cognitive/onboarding/install.ts';
 const b={pr:366,enabled:true,base,product:h('f'),controlCheckpoint:h('1'),source:{[file]:{before:null,after:blob}},controlBefore:Object.fromEntries(CONTROLS.map(path=>[path,null])),components:{backend:h('2'),frontend:h('3')}};
 const entries=[file,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 const env={GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_EVENT:'pull_request',CI_PR_NUMBER:'366',CI_HEAD_REF:BRANCHES[366],CI_SOURCE_HEAD:source,CI_IS_DRAFT:'false'};
 const read=(cmd,a,...rest)=>{if(cmd==='ls-tree')return a===base?'':`100644 blob ${blob}\t${rest.at(-1)}`;if(cmd==='rev-parse'){if(a.endsWith('^{tree}'))return tree;if(a.endsWith(':server-version/backend'))return h('2');if(a.endsWith(':server-version/frontend'))return h('3');return blob;}throw Error('Unexpected mocked Git command');};
 return {b,entries,env,read};
}
test('onboarding scope binds exact source, modes, reviewed controls and the supported PR only',()=>{
 const f=fixture();assert.equal(onboardingPlan(f.entries,base,head,f.read,f.env,f.b).pr,366);
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_HEAD_REF:'other'},{CI_PR_NUMBER:'365'},{CI_FORCE_FULL:'true'},{CI_PR_REPOSITORY:'other/repo'}])assert.throws(()=>onboardingPlan(f.entries,base,head,f.read,{...f.env,...patch},f.b));
 for(const patch of [{enabled:false},{base:h('9')},{pr:999}])assert.throws(()=>onboardingPlan(f.entries,base,head,f.read,f.env,{...f.b,...patch}));
 for(const entries of [f.entries.slice(1),[...f.entries,{file:'unknown'}],f.entries.map(e=>e.file===MARKER?{...e,newMode:'120000'}:e)])assert.throws(()=>onboardingPlan(entries,base,head,f.read,f.env,f.b));
 assert.throws(()=>onboardingPlan(f.entries,base,head,(cmd,a,...r)=>a===source+'^{tree}'?h('9'):f.read(cmd,a,...r),f.env,f.b));
});
test('original reports retain filtered rows and cannot substitute empty, failed or altered case outcomes',()=>{
 const report={success:true,numPassedTests:1,numFailedTests:0,numPendingTests:1,testResults:[{assertionResults:[{fullName:'selected',status:'passed'},{fullName:'old filtered',status:'pending'}]}]};
 const review={summary:Object.fromEntries(['success','numPassedTests','numFailedTests','numPendingTests'].map(key=>[key,report[key]])),cases:report.testResults[0].assertionResults};
 assert.deepEqual(verifyOriginalReport(report,review),['selected']);
 assert.deepEqual(verifyOriginalReport(report,{...review,selectedCases:['selected']}),['selected']);
 for(const selectedCases of [[],['old filtered'],['unknown'],['selected','selected']])assert.throws(()=>verifyOriginalReport(report,{...review,selectedCases}));
 for(const bad of [{...report,success:false},{...report,testResults:[]},{...report,numPassedTests:2},{...report,testResults:[{assertionResults:[{fullName:'selected',status:'skipped'}]}]}])assert.throws(()=>verifyOriginalReport(bad,review));
 const receipt={argv:['node','node_modules/typescript/bin/tsc','--noEmit'],exitCode:0,backendTree:h('2')},typeReview={exitField:'exitCode',backendTree:h('2')};
 assert.equal(verifyTypeReceipt(receipt,typeReview,()=>Buffer.from(''),h('2')).originalExitCode,0);
 assert.throws(()=>verifyTypeReceipt({...receipt,exitCode:1},typeReview,()=>Buffer.from(''),h('2')));
 assert.throws(()=>verifyTypeReceipt(receipt,typeReview,()=>Buffer.from(''),h('9')));
});
test('stable gate still requires admission and SAST success and rejects Draft or missing outcomes',()=>{
 const f=fixture(),p=onboardingPlan(f.entries,base,head,f.read,f.env,f.b),outputs=Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(needs,false),[]);assert(failedChecks(needs,true).length);
 for(const result of ['skipped','failure','cancelled',undefined])assert(failedChecks({...needs,'onboarding-structure':{result}},false).length);
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes('    - onboarding-structure\n'));assert(yaml.includes('      onboarding_plan:'));assert(yaml.includes('node .github/scripts/onboarding-checks.mjs admit'));
});
