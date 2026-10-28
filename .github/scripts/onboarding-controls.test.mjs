import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRANCHES,CONTROLS,MARKER,onboardingPlan,onboardingOutputs} from './onboarding-scope.mjs';
import {verifyOriginalReport,verifyTypeReceipt,verifyReportPlanningObservation,verifyFailureContinuations,verifyRunStartPlanningObservation} from './onboarding-checks.mjs';
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

test('report planner observation admits both actual product checks without inventing a speed threshold',()=>{
 const row=product=>({product,phase:'PLAN_AND_REVOCATION',metricVerified:true,revocationVerified:true,plannerBefore:{pid:10,setting:'8'},plannerAfter:{pid:10,setting:'8'},queryPlan:product==='SCHOOL'?[{limit:8,actualRows:1,planningMs:10,executionMs:1},{limit:1,actualRows:1,planningMs:20,executionMs:2}]:null});
 const observation={scope:'Current real education assessment report service using synthetic accepted FINAL facts; no START/FINAL/browser or capacity claim',rows:[row('SCHOOL'),row('TEACHER')]},execution={exitCode:0,head:h('a')};
 assert.equal(verifyReportPlanningObservation(observation,execution).ciExecuted,false);
 assert.throws(()=>verifyReportPlanningObservation(observation,{...execution,exitCode:1}));
 for(const mutate of [v=>v.rows.pop(),v=>v.rows[0].revocationVerified=false,v=>v.rows[1].plannerAfter.setting='1',v=>v.rows[0].queryPlan[1].actualRows=0]){const bad=structuredClone(observation);mutate(bad);assert.throws(()=>verifyReportPlanningObservation(bad,execution));}
});
test('shared planner branch reuses bounded admission with a distinct exact source namespace',()=>{
 const f=fixture(),path='server-version/backend/src/modules/reporting/education-assessment-personal-report.service.ts';
 const b={...f.b,pr:369,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e);
 const env={...f.env,CI_PR_NUMBER:'369',CI_HEAD_REF:BRANCHES[369]};
 assert.equal(onboardingPlan(entries,base,head,f.read,env,b).pr,369);
 const outside='server-version/backend/src/modules/reporting/other.ts';
 assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 assert.throws(()=>onboardingPlan(entries,base,head,f.read,{...env,CI_HEAD_REF:BRANCHES[365]},b));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes(".pr == 369 && 'paths: [server-version/backend/src/modules/reporting,"));
});

test('partial original failure preserves failed rows and requires a passed continuation',()=>{
 const cases=[{fullName:'kept',status:'passed'},{fullName:'fixed',status:'failed'},{fullName:'old',status:'skipped'}];
 const report={success:false,numPassedTests:1,numFailedTests:1,numPendingTests:1,testResults:[{assertionResults:cases}]};
 const review={id:'original',cases,summary:{success:false,numPassedTests:1,numFailedTests:1,numPendingTests:1},allowPartialFailure:true,selectedCases:['kept'],failureContinuations:[{caseName:'fixed',reportId:'retry'}]};
 assert.deepEqual(verifyOriginalReport(report,review),['kept']);
 verifyFailureContinuations([review],[{id:'original',caseNames:['kept']},{id:'retry',caseNames:['fixed']}]);
 assert.throws(()=>verifyOriginalReport(report,{...review,allowPartialFailure:false}));
 assert.throws(()=>verifyOriginalReport(report,{...review,selectedCases:['fixed']}));
 assert.throws(()=>verifyOriginalReport(report,{...review,failureContinuations:[]}));
 assert.throws(()=>verifyFailureContinuations([review],[{id:'retry',caseNames:[]}]));
});
test('component type receipts bind the selected frontend tree and exact compiler command',()=>{
 const receipt={argv:['node','node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],exitCode:0,componentTree:h('3')};
 const review={component:'frontend',componentTree:h('3'),exitField:'exitCode'};
 assert.equal(verifyTypeReceipt(receipt,review,()=>Buffer.from(''),h('3')).component,'frontend');
 assert.throws(()=>verifyTypeReceipt(receipt,review,()=>Buffer.from(''),h('2')));
 assert.throws(()=>verifyTypeReceipt(receipt,{...review,component:'backend'},()=>Buffer.from(''),h('3')));
 assert.throws(()=>verifyTypeReceipt({...receipt,exitCode:2},review,()=>Buffer.from(''),h('3')));
});
test('first-feedback scope permits only reviewed mixed components and scans both source families',()=>{
 const f=fixture(),path='server-version/frontend/src/survey/SurveyPublicApp.tsx',b={...f.b,pr:372,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'372',CI_HEAD_REF:BRANCHES[372]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 assert.equal(onboardingPlan(entries,base,head,read,env,b).pr,372);
 const outside='server-version/frontend/src/survey/Other.tsx';
 assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 assert.throws(()=>onboardingPlan(f.entries,base,head,read,f.env,f.b));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes(".pr == 372 && 'paths: [server-version/backend/src/modules/survey, server-version/frontend/src/survey,"));
});


test('PR374 binds its own mixed source and keeps browser qualification inside the required admission job',()=>{
 const f=fixture(),path='server-version/backend/src/modules/assessment-run/startExecution.ts',b={...f.b,pr:374,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'374',CI_HEAD_REF:BRANCHES[374]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 assert.equal(onboardingPlan(entries,base,head,read,env,b).pr,374);
 assert.throws(()=>onboardingPlan(entries,base,head,read,{...env,CI_HEAD_REF:BRANCHES[372]},b));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8'),job=yaml.slice(yaml.indexOf('  onboarding-structure:\n'),yaml.indexOf('  report-planning:\n'));
 assert(job.includes('node .github/scripts/pr374-browser.mjs'));assert(job.includes("pr == 374"));assert(job.includes('registry=https://registry.npmjs.org'));
 assert.deepEqual(requiredChecks({scope:{outputs:{application_route:'onboarding-structure'}}},false),['scope','onboarding-structure','codeql']);
 const browser=readFileSync('.github/scripts/pr374-browser.mjs','utf8');assert(browser.includes('chromiumSandbox:true'));assert(browser.includes('verifyChromeSandbox(browser)'));assert(!browser.includes('--no-sandbox'));assert(browser.includes('No simulated FINAL'));
});

test('PR374 reviewed HTTP source refuses an unreviewed original index',async()=>{
 const {verifyPr374Observations}=await import('./pr374-evidence.mjs');assert.throws(()=>verifyPr374Observations({indexSHA256:'0'.repeat(64)}));
});

test('observer follow-up admits only its HTTP test, scoped CSS and evidence; browser qualification stays required',()=>{
 const f=fixture(),path='server-version/frontend/src/modules/reporting/report-ui.css',b={...f.b,pr:376,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'376',CI_HEAD_REF:BRANCHES[376]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 assert.equal(onboardingPlan(entries,base,head,read,env,b).pr,376);
 for(const outside of ['server-version/backend/src/middleware/auth.ts','server-version/backend/prisma/schema.prisma'])assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes('node .github/scripts/pr376-browser.mjs'));assert(yaml.includes("contains(fromJSON('[374,376]')"));
 const script=readFileSync('.github/scripts/pr376-browser.mjs','utf8');assert(script.includes('chromiumSandbox:true'));assert(script.includes('verifyChromeSandbox'));assert(script.includes('results.cases.length,6'));assert(script.includes('row.warning.ratio>=4.5'));assert(script.includes('Display fixture forbids simulated writes'));
});
test('observer display retry keeps failed report and narrows execution without weakening contrast',()=>{
 const script=readFileSync('.github/scripts/pr376-browser.mjs','utf8');assert(script.includes("assert.equal(prior.status,'FAIL')"));assert(script.includes('executedThisRun:false'));assert(script.includes("assert.deepEqual(changed,['server-version/frontend/src/modules/reporting/report-ui.css'])"));assert(script.includes("data-shell-mode={view==='report'?'student':undefined}"));assert(script.includes('row.warnings.length>=2'));assert(script.includes('value.ratio>=4.5'));
});

test('START planner scope and original diagnostic reject unrelated runtime or invented outcomes',()=>{
 const f=fixture(),path='server-version/backend/src/modules/assessment-run/startAuthority.ts',b={...f.b,pr:377,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'377',CI_HEAD_REF:BRANCHES[377]};assert.equal(onboardingPlan(entries,base,head,f.read,env,b).pr,377);
 const outside='server-version/backend/src/middleware/auth.ts';assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 const root='docs/performance/storage-ledger-20261028/start-planner/',read=p=>JSON.parse(readFileSync(root+p));
 const profile=read('authority-profile-summary.json'),validation=read('planner-validation-r1.json'),execution=read('planner-validation-r1-execution.json');assert.equal(verifyRunStartPlanningObservation(profile,validation,execution).ciExecuted,false);
 assert.throws(()=>verifyRunStartPlanningObservation(profile,{...validation,completed:false},execution));assert.throws(()=>verifyRunStartPlanningObservation(profile,validation,{...execution,exitCode:1}));const bad=structuredClone(validation);bad.cases[0].after.value='1';assert.throws(()=>verifyRunStartPlanningObservation(profile,bad,execution));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes(".pr == 377 && 'paths: [server-version/backend/src/modules/assessment-run/startAuthority.ts"));
});
