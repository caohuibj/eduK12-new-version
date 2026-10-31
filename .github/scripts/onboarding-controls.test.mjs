import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRANCHES,CONTROLS,GROUP_REPORT_CONTROLS,MARKER,onboardingPlan,onboardingOutputs} from './onboarding-scope.mjs';
import {verifyTrainingStandaloneCognitiveObservation,verifyPr420OfficialMetadata,pr420BuildOrigin,verifyTrainingBundleGroupObservation,verifyTeacherSubgroupObservation,verifyTeacherReadingObservation,verifySchoolGroupObservation,verifyGroupReportNativeBaseReuse,verifyOriginalReport,decodeOriginal,verifyCloudComponentTypeReceipt,verifyTypeReceipt,verifyReportPlanningObservation,verifyFailureContinuations,verifyRunStartPlanningObservation,verifyPr381CommandRecords,verifyPr395LocalTypes,verifyPr395SastMetadata,task1SastConfig} from './onboarding-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=c=>c.repeat(40),base=h('a'),head=h('b'),source=h('c'),tree=h('d'),blob=h('e');
test('Training choice pagination uses the existing exact family and refuses unrelated files or guessed PR identities',()=>{
 const f=fixture(),backend='server-version/backend/src/modules/measurement-content/standard-combination-use.ts',frontend='server-version/frontend/src/pages/questionnaire/QuestionnaireProducts.tsx';
 f.b.pr='choice-page';f.b.source=Object.fromEntries([backend,frontend].map(path=>[path,{before:null,after:blob}]));f.entries=[backend,frontend,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));f.env={...f.env,CI_PR_NUMBER:'9002',CI_HEAD_REF:BRANCHES['choice-page']};
 const call=(b=f.b,entries=f.entries,env=f.env)=>onboardingPlan(entries,base,head,f.read,env,b),p=call();assert.equal(p.pr,'choice-page');assert.equal(onboardingOutputs(p).application_route,'onboarding-structure');assert(task1SastConfig(p,f.b).paths.includes(frontend));
 for(const patch of [{CI_HEAD_REF:'other'},{CI_PR_NUMBER:'choice-page'},{CI_PR_NUMBER:'0'},{CI_FORCE_FULL:'true'}])assert.throws(()=>call(f.b,f.entries,{...f.env,...patch}));
 assert.throws(()=>call({...f.b,enabled:false}));const unknown='server-version/backend/src/unrelated.ts';assert.throws(()=>call({...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}},[...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}]));
});
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
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes('node .github/scripts/pr376-browser.mjs'));assert(yaml.includes("contains(fromJSON('[374,376,378,380,381,395]')"));
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

test('PR378 keeps frontend-only scope, exact npm type receipt and compiled loading consumers mandatory',()=>{
 const f=fixture(),path='server-version/frontend/src/huiteacher/HuiteacherApp.tsx',b={...f.b,pr:378,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'378',CI_HEAD_REF:BRANCHES[378]};
 assert.equal(onboardingPlan(entries,base,head,f.read,env,b).pr,378);
 const outside='server-version/backend/src/modules/assessment-run/startAuthority.ts';assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...rest)=>a===base+':server-version/backend'?h('9'):f.read(cmd,a,...rest),env,b));
 const receipt={argv:['npm','run','typecheck'],exitCode:0,componentTree:h('3')},review={component:'frontend',componentTree:h('3'),exitField:'exitCode'};
 assert.equal(verifyTypeReceipt(receipt,review,()=>Buffer.from(''),h('3')).originalExitCode,0);assert.throws(()=>verifyTypeReceipt({...receipt,argv:['npm','run','build']},review,()=>Buffer.from(''),h('3')));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8'),script=readFileSync('.github/scripts/pr378-browser.mjs','utf8');assert(yaml.includes('node .github/scripts/pr378-browser.mjs'));assert(yaml.includes(".pr == 378 && 'paths: [server-version/frontend/src"));assert(script.includes("['run','build','--','--manifest']"));assert(script.includes('chromiumSandbox:true'));assert(script.includes('verifyChromeSandbox'));assert(!script.includes('--no-sandbox'));assert(script.includes("request.method()!=='GET'"));
 assert.deepEqual(requiredChecks({scope:{outputs:{application_route:'onboarding-structure'}}},false),['scope','onboarding-structure','codeql']);
});


test('PR380 admits only its frontend delta and requires one compiled postlogin consumer',()=>{
 const f=fixture(),path='server-version/frontend/src/survey/TaskForm.tsx',b={...f.b,pr:380,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'380',CI_HEAD_REF:BRANCHES[380]};assert.equal(onboardingPlan(entries,base,head,f.read,env,b).pr,380);
 const outside='server-version/backend/src/modules/campus/auth.routes.ts';assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8'),script=readFileSync('.github/scripts/pr380-browser.mjs','utf8');assert(yaml.includes('node .github/scripts/pr380-browser.mjs'));assert(yaml.includes(".pr == 380 && 'paths: [server-version/frontend/src"));assert(script.includes('chromiumSandbox:true'));assert(script.includes('verifyChromeSandbox'));assert(!script.includes('--no-sandbox'));assert(script.includes("request.method()!=='GET'"));assert(script.includes("cpSync(dist,resolve(out,'dist')"));assert(script.includes("restoreBrowserBuild"));assert(script.includes("executedThisRun:false"));assert(script.includes("assert.equal(result.cases.length,5)"));assert.deepEqual(requiredChecks({scope:{outputs:{application_route:'onboarding-structure'}}},false),['scope','onboarding-structure','codeql']);
});

test('PR381 binds the two frontend files, exact evidence and unchanged backend without a platform fallback',()=>{
 const f=fixture(),path='server-version/frontend/src/components/FormSectionManager.tsx';
 const b={...f.b,pr:381,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e);
 const env={...f.env,CI_PR_NUMBER:'381',CI_HEAD_REF:BRANCHES[381]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);
 assert.equal(p.pr,381);assert.equal(onboardingOutputs(p).application_route,'onboarding-structure');
 assert.equal(onboardingOutputs(p).frontend,false);assert.equal(onboardingOutputs(p).run_performance_tests,false);
 for(const outside of ['server-version/backend/src/controllers/authController.ts','server-version/frontend/package-lock.json','server-version/backend/prisma/schema.prisma','server-version/frontend/src/App.tsx']){
  assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 }
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_HEAD_REF:BRANCHES[380]},{CI_PR_NUMBER:'380'},{CI_FORCE_FULL:'true'},{CI_SOURCE_HEAD:h('9')}]){
  const read=(cmd,a,...rest)=>a===h('9')+'^{tree}'?h('9'):f.read(cmd,a,...rest);
  assert.throws(()=>onboardingPlan(entries,base,head,read,{...env,...patch},b));
 }
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...rest)=>a===base+':server-version/backend'?h('9'):f.read(cmd,a,...rest),env,b));
 assert.throws(()=>onboardingPlan([...entries,{file:'unknown',newMode:'100644'}],base,head,f.read,env,b));
 assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,newMode:'120000'}:e),base,head,f.read,env,b));
 assert.throws(()=>onboardingPlan(entries,base,head,f.read,env,{...b,enabled:false}));
 const outcomes={scope:{result:'success',outputs:Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)]))},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(outcomes,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(outcomes,false),[]);
 for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...outcomes,'onboarding-structure':{result}},false).length);
 assert(failedChecks(outcomes,true).length);
});

test('PR381 reads recorded command exits and exact source without inferring success from empty logs',()=>{
 const root='docs/performance/form-section-reads-20261028/evidence/';
 const json=path=>JSON.parse(readFileSync(root+path,'utf8'));
 const commands=json('commands.json'),inputs=json('candidate/inputs-final.json'),first=json('candidate/inputs-r1.json');
 const component='cf228766bf881fd1a4d9e922fc8171488a27756b';
 const verify=(c=commands,i=inputs,f=first,read=path=>readFileSync(path))=>verifyPr381CommandRecords(c,i,f,component,read);
 const result=verify();assert.equal(result.type.originalExitCode,0);assert.equal(result.originalSigned,false);assert.equal(result.lint.length,2);
 assert.equal(result.type.originalTaskChunk,'278ac1');assert(result.lint.every(row=>row.ciExecuted===false));
 for(const exitCode of [undefined,null,'0',1])for(const index of [5,6,7]){
  const bad=structuredClone(commands);if(exitCode===undefined)delete bad.invocations[index].exitCode;else bad.invocations[index].exitCode=exitCode;
  assert.throws(()=>verify(bad));
 }
 const bad=structuredClone(commands);bad.invocations[5].command='npm run typecheck';assert.throws(()=>verify(bad));
 assert.throws(()=>verify({...commands,invocations:[]}));
 assert.throws(()=>verify(commands,{...inputs,nodeVersion:'v24.19.0'}));
 const missing=structuredClone(inputs);delete missing.fullFrontendTrackedFileSha256['server-version/frontend/package-lock.json'];assert.throws(()=>verify(commands,missing));
 assert.throws(()=>verify(commands,inputs,first,path=>path.endsWith('types-app-final.log')?Buffer.from('changed'):readFileSync(path)));
 assert.throws(()=>verify(commands,inputs,first,path=>path==='server-version/frontend/src/components/FormSectionManager.tsx'?Buffer.from('changed'):readFileSync(path)));
 assert.throws(()=>verify(commands,inputs,{...first,['server-version/frontend/src/components/__tests__/FormSectionManager.http.test.tsx']:'0'.repeat(64)}));
 assert.throws(()=>verifyPr381CommandRecords(commands,inputs,first,h('9'),path=>readFileSync(path)));
});

test('PR381 keeps one compiled GET-only editor and live sandbox verification before the sole build',()=>{
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');
 const job=yaml.slice(yaml.indexOf('  onboarding-structure:\n'),yaml.indexOf('  report-planning:\n'));
 assert(job.includes('node .github/scripts/pr381-browser.mjs'));
 assert(job.includes(".pr == 381 && 10"));assert(job.includes("contains(fromJSON('[374,376,378,380,381,395]')"));
 assert(yaml.includes(".pr == 381 && 'paths: [server-version/frontend/src, .github/scripts]'"));
 const script=readFileSync('.github/scripts/pr381-browser.mjs','utf8');
 assert(script.includes('chromiumSandbox:true'));assert(script.includes('verifyChromeSandbox(browser)'));assert(!script.includes('--no-sandbox'));
 assert(script.indexOf('verifyChromeSandbox(browser)')<script.indexOf("execFileSync('npm',command"));
 assert.equal(script.split("execFileSync('npm',command").length,2);
 assert(script.includes("resolve(out,'build.stdout.log')"));assert(script.includes("resolve(out,'build.stderr.log')"));
 assert(script.includes("stdio:['ignore',...descriptors]"));
 assert(script.includes("request.method()!=='GET'"));assert(script.includes('Unexpected API '));
 assert(script.includes('result.cases.length,1'));assert(script.includes("path:resolve(out,'compiled-ordinary-editor.png')"));
 assert(script.includes("assert.deepEqual(admitted.source,plan)"));assert(script.includes("assert.equal(plan.pr,381)"));
 assert(!script.includes('restoreBrowserBuild'));
});

test('PR393 selects only its appended exact backend candidate and preserves old route boundaries',()=>{
 const f=fixture(),path='server-version/backend/src/modules/assessment-bundle/profile/report.ts';
 const candidate={...f.b,pr:393,source:{[path]:{before:null,after:blob}}};
 const combined={...f.b,candidates:{393:candidate}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e);
 const env={...f.env,CI_PR_NUMBER:'393',CI_HEAD_REF:BRANCHES[393]};
 const p=onboardingPlan(entries,base,head,f.read,env,combined);
 assert.equal(p.pr,393);assert.equal(onboardingOutputs(p).frontend,false);assert.equal(onboardingOutputs(p).bundle,false);
 // The old branch still consumes its root record, never PR393's nested data.
 assert.equal(onboardingPlan(f.entries,base,head,f.read,f.env,combined).pr,366);
 for(const outside of ['server-version/backend/src/middleware/auth.ts','server-version/backend/package-lock.json','server-version/frontend/src/App.tsx','server-version/backend/src/modules/assessment-bundle/profile/match.ts']){
  assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...combined,candidates:{393:{...candidate,source:{[outside]:{before:null,after:blob}}}}}));
 }
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_HEAD_REF:BRANCHES[381]},{CI_PR_NUMBER:'381'},{CI_FORCE_FULL:'true'},{CI_PR_REPOSITORY:'other/repo'}])
  assert.throws(()=>onboardingPlan(entries,base,head,f.read,{...env,...patch},combined));
 assert.throws(()=>onboardingPlan(entries,base,head,f.read,env,{...combined,candidates:{393:{...candidate,enabled:false}}}));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...r)=>a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r),env,combined));
 const postRead=(cmd,a,...r)=>cmd==='fetch'?'':cmd==='cat-file'?`tree ${tree}\nparent ${base}\nparent ${source}`:f.read(cmd,a,...r);
 const pushed=onboardingPlan(entries,base,head,postRead,{...env,CI_EVENT:'push',CI_HEAD_REF:'',CI_PR_NUMBER:'',GITHUB_REF_NAME:'main'},combined);
 assert.equal(pushed.pr,393);assert.equal(pushed.postMerge,true);assert.equal(onboardingOutputs(pushed).codeql,false);
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...r)=>cmd==='cat-file'?`parent ${h('9')}\nparent ${source}`:postRead(cmd,a,...r),{...env,CI_EVENT:'push',GITHUB_REF_NAME:'main'},combined));
});

test('PR393 admits the original 7 plus 7, retains skipped rows and cannot select superseded or withheld cases',async()=>{
 const {createHash}=await import('node:crypto');
 const review=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json')).candidates['393'];
 assert.deepEqual(review.types,[]);assert.equal(review.missingCheck,'CURRENT_COMBINED_BACKEND_TYPES');
 assert.equal(review.originalExecutionSigned,false);assert.equal(review.reports.length,2);
 const selected=[];
 for(const record of review.reports){
  const bytes=readFileSync(record.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  const original=JSON.parse(bytes),names=verifyOriginalReport(original,record);
  assert.equal(names.length,7);selected.push(...names);
  assert.throws(()=>verifyOriginalReport({...original,numPassedTests:100},record));
 }
 assert.equal(new Set(selected).size,14);
 const first=review.reports[0],original=JSON.parse(readFileSync(first.path));
 assert(first.selectedCases.every(n=>!n.includes('matched summaries')&&!n.includes('reopens')&&!n.includes('package hash')));
 const second=review.reports[1],filtered=second.cases.find(c=>c.status==='skipped').fullName;
 assert.equal(second.summary.numPendingTests,7);
 assert.throws(()=>verifyOriginalReport(JSON.parse(readFileSync(second.path)),{...second,selectedCases:[filtered]}));
 // Historical root review and binding are preserved as values.
 const {execFileSync}=await import('node:child_process');
 for(const name of ['onboarding-evidence.json','onboarding-bindings.json']){
  const file='.github/scripts/'+name,current=JSON.parse(readFileSync(file));delete current.candidates;
  const old=JSON.parse(execFileSync('git',['show','4a3aaa2ebbae712002a2d349c5e83368085c437e:'+file],{encoding:'utf8'}));
  assert.deepEqual(current,old);
 }
});

test('PR393 keeps only missing backend types, changed SAST and the existing mandatory gate',()=>{
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');
 const job=yaml.slice(yaml.indexOf('  onboarding-structure:\n'),yaml.indexOf('  report-planning:\n'));
 assert(job.includes("if: fromJSON(needs.scope.outputs.onboarding_plan || '{}').pr == 393\n      working-directory: server-version/backend"));
 assert(job.includes('npm ci --ignore-scripts --no-audit --no-fund'));assert(job.includes('node node_modules/prisma/build/index.js generate'));
 assert(job.includes('https://registry.npmjs.org'));assert(!job.includes('npm run build'));
 assert(yaml.includes(".pr == 393 && 'paths: [server-version/backend/src/modules/assessment-bundle,"));
 assert(job.includes("contains(fromJSON('[374,376,378,380,381,395]')")); // PR393 never selects a browser.
 assert.deepEqual(requiredChecks({scope:{outputs:{application_route:'onboarding-structure'}}},false),['scope','onboarding-structure','codeql']);
 const script=readFileSync('.github/scripts/onboarding-checks.mjs','utf8');
 assert(script.includes("spawnSync(process.execPath,argv,{cwd:'server-version/backend',encoding:'utf8'})"));
 assert(script.includes("assert.equal(execution.status,0,'Current combined backend types failed"));
 assert(script.indexOf("writeFileSync('onboarding-evidence/backend-types.json'")<script.indexOf("assert.equal(execution.status,0"));
});


test('PR395 exact frontend scope refuses drift and preserves the stable required checks',()=>{
 const f=fixture(),path='server-version/frontend/src/components/education-tools/EducationPrivateToolStudio.tsx';
 const b={...f.b,pr:395,source:{[path]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file:path}:e),env={...f.env,CI_PR_NUMBER:'395',CI_HEAD_REF:BRANCHES[395]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,395);
 for(const outside of ['server-version/backend/src/middleware/auth.ts','server-version/frontend/package-lock.json','server-version/frontend/src/school/SchoolApp.tsx'])
  assert.throws(()=>onboardingPlan(entries.map(e=>e.file===path?{...e,file:outside}:e),base,head,f.read,env,{...b,source:{[outside]:{before:null,after:blob}}}));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...r)=>a===base+':server-version/backend'?h('9'):f.read(cmd,a,...r),env,b));
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_HEAD_REF:BRANCHES[381]},{CI_FORCE_FULL:'true'}])assert.throws(()=>onboardingPlan(entries,base,head,f.read,{...env,...patch},b));
 assert.throws(()=>onboardingPlan(entries,base,head,f.read,env,{...b,enabled:false}));
 const needs={scope:{result:'success',outputs:Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)]))},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,'onboarding-structure':{result}},false).length);
 assert(failedChecks(needs,true).length);
});
test('PR395 admits only the original disjoint 21-case union and explicit failed School continuation',()=>{
 const v=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json')).candidates['395'];
 const admitted=v.reports.map(r=>({id:r.id,caseNames:verifyOriginalReport(JSON.parse(readFileSync(r.path)),r)}));
 assert.equal(new Set(admitted.flatMap(r=>r.caseNames)).size,21);assert.equal(admitted.flatMap(r=>r.caseNames).length,21);verifyFailureContinuations(v.reports,admitted);
 const partial=v.reports.find(r=>r.id==='shared-editors-initial');assert.equal(partial.summary.success,false);assert.equal(partial.historicalTestDifference.affectsSelectedCases,false);
 assert(partial.deltaRationale.includes('OLD initial-loading await'));assert.equal(partial.selectedCases.length,2);
 assert.throws(()=>verifyFailureContinuations(v.reports,admitted.filter(r=>r.id!=='school-recheck')));
 const t=v.pr395LocalTypes,receipt=JSON.parse(readFileSync(t.path)),exit=readFileSync(t.exit),log=readFileSync(t.log);
 assert.equal(verifyPr395LocalTypes(receipt,exit,log,receipt.componentTree).indexKind,'RETROSPECTIVE_DOT_OBSERVATION');
 for(const value of ['', '1\n','unknown\n'])assert.throws(()=>verifyPr395LocalTypes(receipt,Buffer.from(value),log,receipt.componentTree));
 assert.throws(()=>verifyPr395LocalTypes({...receipt,exitCode:null},exit,log,receipt.componentTree));
 assert.throws(()=>verifyPr395LocalTypes(receipt,exit,log,h('9')));
});
test('PR395 missing browser consumers run without rebuilding, replaying application tests or starting a backend',()=>{
 const yaml=readFileSync('.github/workflows/ci.yml','utf8'),job=yaml.slice(yaml.indexOf('  onboarding-structure:\n'),yaml.indexOf('  report-planning:\n'));
 assert(job.includes('node .github/scripts/pr395-browser.mjs'));assert(yaml.includes(".pr == 395 && 'paths: [.github/scripts/onboarding-checks.mjs"));
 const script=readFileSync('.github/scripts/pr395-browser.mjs','utf8');assert(script.includes('chromiumSandbox:true'));assert(script.includes('verifyChromeSandbox'));assert(!script.includes('--no-sandbox'));
 assert(script.includes("request.method()!=='GET'"));assert(script.includes("['SCHOOL','TEACHER']"));assert(script.includes('dialog.dismiss()'));assert(script.includes('dialog.accept()'));
 assert(!script.includes("['run','build'"));assert(!script.includes('vitest'));assert(script.includes('Not real login, authorization'));
});

test('PR395 browser interception treats only the actual API prefix as business traffic',()=>{
 const script=readFileSync('.github/scripts/pr395-browser.mjs','utf8');assert(script.includes("context.route(url=>url.pathname.startsWith('/api/'),async route=>"));assert(!script.includes("context.route('**/api/**'"));
 const match=url=>new URL(url).pathname.startsWith('/api/');
 for(const path of ['/api/organizations/synthetic-org/private-tools','/api/unknown'])assert(match('http://127.0.0.1:5187'+path));
 for(const path of ['/src/api/scaleLibraryGovernance.ts','/node_modules/.vite/deps/react.js','/pr395-fixture.jsx'])assert(!match('http://127.0.0.1:5187'+path));
 assert(script.includes("request.method()!=='GET'"));assert(script.includes("row.errors.push('Unexpected '"));
});
test('PR395 SAST continuation requires the exact official successful scan despite parent failure',()=>{
 const root='docs/performance/education-post-p6-20261030/evidence/ci-r1/';
 const run=JSON.parse(readFileSync(root+'run.json')),job=JSON.parse(readFileSync(root+'sast-job.json')),artifact=JSON.parse(readFileSync(root+'sast-artifact.json'));const now=Date.parse(artifact.created_at)+1000;
 assert.equal(verifyPr395SastMetadata(run,job,artifact,now).originalParentConclusion,'failure');
 for(const result of ['failure','skipped','cancelled'])assert.throws(()=>verifyPr395SastMetadata(run,{...job,conclusion:result},artifact,now));
 assert.throws(()=>verifyPr395SastMetadata(run,job,{...artifact,digest:'sha256:'+'0'.repeat(64)},now));assert.throws(()=>verifyPr395SastMetadata(run,job,{...artifact,expired:true},now));assert.throws(()=>verifyPr395SastMetadata(run,job,artifact,now+86400000));
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes('node .github/scripts/onboarding-checks.mjs sast-reuse'));assert(yaml.includes('pr395-original-sast-${{ github.sha }}'));assert(yaml.includes(".pr == 395 && 'paths: [.github/scripts/onboarding-checks.mjs, .github/scripts/onboarding-controls.test.mjs, .github/scripts/pr395-browser.mjs]'"));
});

test('group-report qualification uses the existing exact family and rejects scope or identity drift',()=>{
 const f=fixture(),backend='server-version/backend/src/modules/reporting/group-summary.ts',frontend='server-version/frontend/src/survey/SurveyGroupReports.tsx',controls=[...CONTROLS,...GROUP_REPORT_CONTROLS].sort();
 f.b={...f.b,pr:404,source:Object.fromEntries([backend,frontend].map(path=>[path,{before:null,after:blob}])),controlBefore:Object.fromEntries(controls.map(path=>[path,null]))};
 f.entries=[backend,frontend,...controls].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));f.env={...f.env,CI_PR_NUMBER:'404',CI_HEAD_REF:BRANCHES[404]};
 const call=(b=f.b,entries=f.entries,env=f.env)=>onboardingPlan(entries,base,head,f.read,env,b),p=call();assert.equal(p.pr,404);assert.equal(onboardingOutputs(p).application_route,'onboarding-structure');
 const sast=task1SastConfig(p,f.b);for(const file of [backend,frontend,'.github/scripts/content-scope.mjs','.github/scripts/group-report-draft.mjs'])assert(sast.paths.includes(file));
 const workflow=readFileSync('.github/workflows/ci.yml','utf8'),inline=workflow.slice(workflow.indexOf('name: select dependency-free documentation or tooling classification'),workflow.indexOf('- name: install pinned release classification tools'));assert(inline.includes('const onboarding=onboardingPlan('));assert(inline.indexOf('const onboarding=')<inline.indexOf('const groupDraft='));assert(inline.includes('const groupDraft=onboarding?null:'));assert(inline.includes('CI_PR_REPOSITORY:'));
 const classifier=readFileSync('.github/scripts/content-scope.mjs','utf8');assert(classifier.indexOf('const onboarding=onboardingPlan(')<classifier.indexOf('const groupDraft=groupReportDraftPlan('));
 for(const patch of [{CI_HEAD_REF:'other'},{CI_PR_NUMBER:'408'},{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'}])assert.throws(()=>call(f.b,f.entries,{...f.env,...patch}));
 assert.throws(()=>call({...f.b,enabled:false}));const unknown='server-version/backend/src/unrelated.ts';assert.throws(()=>call({...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}},[...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}]));
 assert.throws(()=>call(f.b,f.entries.map(e=>e.file===backend?{...e,newMode:'120000'}:e)));
});
test('group-report qualification keeps admission and SAST mandatory and rejects Draft or incomplete outcomes',()=>{
 const f=fixture(),file='server-version/backend/src/modules/reporting/group-summary.ts',controls=[...CONTROLS,...GROUP_REPORT_CONTROLS].sort();
 f.b={...f.b,pr:404,source:{[file]:{before:null,after:blob}},controlBefore:Object.fromEntries(controls.map(path=>[path,null]))};f.entries=[file,...controls].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));f.env={...f.env,CI_PR_NUMBER:'404',CI_HEAD_REF:BRANCHES[404]};
 const p=onboardingPlan(f.entries,base,head,f.read,f.env,f.b),outputs=Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)]));const needs={scope:{result:'success',outputs},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(needs,false),[]);assert(failedChecks(needs,true).length);
 for(const name of ['onboarding-structure','codeql'])for(const result of ['skipped','failure','cancelled',undefined])assert(failedChecks({...needs,[name]:{result}},false).length);
});

test('group-report qualification reuses native evidence only for identical baseline and candidate Prisma inputs',()=>{
 const oldBase=h('1'),newBase=h('2'),oldProduct=h('3'),newProduct=h('4'),baseTree=h('5'),candidateTree=h('6');
 const value={base:oldBase},plan={base:newBase,product:newProduct},proof={schemaVersion:1,originalBase:oldBase,currentBase:newBase,originalCandidate:oldProduct,currentCandidate:newProduct,basePrismaTree:baseTree,candidatePrismaTree:candidateTree};
 const trees={[oldBase]:baseTree,[newBase]:baseTree,[oldProduct]:candidateTree,[newProduct]:candidateTree};
 const read=commit=>trees[commit];
 assert.equal(verifyGroupReportNativeBaseReuse(value,plan,proof,oldProduct,read).nativeExecutedThisRun,false);
 assert.throws(()=>verifyGroupReportNativeBaseReuse(value,plan,undefined,oldProduct,read));
 assert.throws(()=>verifyGroupReportNativeBaseReuse(value,plan,proof,oldProduct,c=>c===newBase?h('7'):read(c)));
 assert.throws(()=>verifyGroupReportNativeBaseReuse(value,plan,proof,oldProduct,c=>c===newProduct?h('8'):read(c)));
 assert.throws(()=>verifyGroupReportNativeBaseReuse(value,plan,{...proof,originalBase:newBase},oldProduct,read));
 assert.throws(()=>verifyGroupReportNativeBaseReuse(value,plan,proof,h('9'),read));
});

test('Training group qualification binds the existing shared family and requires admission plus SAST',()=>{
 const f=fixture(),backend='server-version/backend/src/modules/training-analysis/group-report.service.ts',frontend='server-version/frontend/src/training/TrainingGroupReports.tsx';
 f.b={...f.b,pr:408,source:Object.fromEntries([backend,frontend].map(file=>[file,{before:null,after:blob}]))};
 f.entries=[backend,frontend,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 f.env={...f.env,CI_PR_NUMBER:'408',CI_HEAD_REF:BRANCHES[408]};
 const call=(b=f.b,entries=f.entries,env=f.env)=>onboardingPlan(entries,base,head,f.read,env,b),p=call();
 assert.equal(p.pr,408);assert.equal(p.route,'onboarding-structure');
 const sast=task1SastConfig(p,f.b);for(const file of [backend,frontend,'.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-checks.mjs'])assert(sast.paths.includes(file));
 const outputs=Object.fromEntries(Object.entries(onboardingOutputs(p)).map(([k,v])=>[k,String(v)])),needs={scope:{result:'success',outputs},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const name of ['onboarding-structure','codeql'])assert(failedChecks({...needs,[name]:{result:'skipped'}},false).length);
 for(const patch of [{CI_PR_NUMBER:'404'},{CI_HEAD_REF:'other'},{CI_FORCE_FULL:'true'},{CI_EVENT:'workflow_dispatch'}])assert.throws(()=>call(f.b,f.entries,{...f.env,...patch}));
 const unknown='server-version/backend/src/unrelated.ts';assert.throws(()=>call({...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}},[...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}]));
 assert.throws(()=>call(f.b,f.entries.map(e=>e.file===backend?{...e,newMode:'120000'}:e)));
});

test('School group qualification keeps the fixed exact route and validates original School observations',()=>{
 const f=fixture(),file='server-version/backend/src/modules/reporting/discovery.ts';
 const b={...f.b,pr:414,source:{[file]:{before:null,after:blob}}},entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file}:e),env={...f.env,CI_PR_NUMBER:'414',CI_HEAD_REF:BRANCHES[414]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,414);assert(task1SastConfig(p,b).paths.includes(file));
 assert.throws(()=>onboardingPlan(entries,base,head,f.read,{...env,CI_HEAD_REF:BRANCHES[408]},b));
 assert.throws(()=>onboardingPlan(entries.map(e=>e.file===file?{...e,file:'server-version/backend/src/unrelated.ts'}:e),base,head,f.read,env,b));
 for(const [kind,path] of [['browser','browser.json'],['school-service','service-postgres-proof.json']]){
  const original=JSON.parse(readFileSync('docs/evidence/group-report-school-20261030/'+path));assert.equal(verifySchoolGroupObservation(original,kind).testsExecutedInCI,false);
  assert.throws(()=>verifySchoolGroupObservation({...original,passed:false},kind));
 }
});

test('Teacher Form reader qualification stays frontend-only and reuses the original product browser observation',()=>{
 const f=fixture(),file='server-version/frontend/src/huiteacher/TeacherFormGroupReport.tsx',b={...f.b,pr:415,source:{[file]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file}:e),env={...f.env,CI_PR_NUMBER:'415',CI_HEAD_REF:BRANCHES[415]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,415);assert(task1SastConfig(p,b).paths.includes(file));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...rest)=>cmd==='rev-parse'&&a===head+':server-version/backend'?h('9'):f.read(cmd,a,...rest),env,b));
 const original=JSON.parse(readFileSync('docs/evidence/group-report-teacher-reading-20261030/browser.json'));
 assert.equal(verifyTeacherReadingObservation(original,'browser').testsExecutedInCI,false);
 assert.throws(()=>verifyTeacherReadingObservation({...original,readOnlyPublishedProjection:false},'browser'));
});

test('Teacher subgroup qualification keeps native versions and retained stage observations on the fixed route',()=>{
 const f=fixture(),file='server-version/backend/src/modules/huiteacher/groupReport.service.ts',b={...f.b,pr:418,source:{[file]:{before:null,after:blob}}};
 const entries=f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file}:e),env={...f.env,CI_PR_NUMBER:'418',CI_HEAD_REF:BRANCHES[418]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,418);assert(task1SastConfig(p,b).paths.includes(file));
 assert.throws(()=>onboardingPlan(entries.map(e=>e.file===file?{...e,file:'server-version/backend/src/unrelated.ts'}:e),base,head,f.read,env,b));
 const native=JSON.parse(readFileSync('docs/evidence/group-report-teacher-subgroups-20261030/postgres-proof.json')),browser=JSON.parse(readFileSync('docs/evidence/group-report-teacher-subgroups-20261030/browser.json'));
 assert.equal(verifyTeacherSubgroupObservation(native,'teacher-native').testsExecutedInCI,false);assert.equal(verifyTeacherSubgroupObservation(browser,'browser').testsExecutedInCI,false);
 assert.throws(()=>verifyTeacherSubgroupObservation({...native,privateManifestNotReturned:false},'teacher-native'));
 assert.throws(()=>verifyTeacherSubgroupObservation({...browser,snapshotReadsAndOneExplicitGeneration:false},'browser'));
});

test('Training Bundle leaf formal route admits disclosed native proof without replay or frontend changes',()=>{
 const f=fixture(),file='server-version/backend/src/modules/training-analysis/group-source.ts',b={...f.b,pr:419,source:{[file]:{before:null,after:blob}},controlBefore:{...f.b.controlBefore,...Object.fromEntries(GROUP_REPORT_CONTROLS.map(path=>[path,null]))}};
 const entries=[...f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file}:e),...GROUP_REPORT_CONTROLS.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))],env={...f.env,CI_PR_NUMBER:'419',CI_HEAD_REF:BRANCHES[419]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,419);assert(task1SastConfig(p,b).paths.includes(file));assert(task1SastConfig(p,b).paths.includes(GROUP_REPORT_CONTROLS[0]));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...rest)=>cmd==='rev-parse'&&a===head+':server-version/frontend'?h('9'):f.read(cmd,a,...rest),env,b));
 const native=JSON.parse(readFileSync('docs/evidence/group-report-leaf-sources-20261030/bundle-postgres-proof.json')),disclosed=JSON.parse(readFileSync('docs/evidence/group-report-leaf-sources-20261030/mainf674/disclosed-five-person-proof.json'));
 assert.equal(verifyTrainingBundleGroupObservation(native,'bundle-native').testsExecutedInCI,false);assert.equal(verifyTrainingBundleGroupObservation(disclosed,'bundle-disclosed').testsExecutedInCI,false);
 assert.throws(()=>verifyTrainingBundleGroupObservation({...disclosed,validN:1},'bundle-disclosed'));
});


test('PR420 chart loading stays on exact frontend-only admission and rejects drift without unrelated jobs',()=>{
 const f=fixture(),paths=['server-version/frontend/src/modules/reporting/PersonalChangesReport.tsx','server-version/frontend/src/modules/reporting/__tests__/PersonalChangesReport.loading.test.tsx','docs/evidence/personal-chart-loading-20261030/report-tests-results.json'];
 const b={...f.b,pr:420,source:Object.fromEntries(paths.map(path=>[path,{before:null,after:blob}]))};
 const entries=[...paths,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 const env={...f.env,CI_PR_NUMBER:'420',CI_HEAD_REF:BRANCHES[420]};
 const call=(binding=b,changed=entries,read=f.read,environment=env)=>onboardingPlan(changed,base,head,read,environment,binding);
 const p=call(),outputs=onboardingOutputs(p);assert.equal(p.pr,420);assert.equal(outputs.application_route,'onboarding-structure');
 for(const key of ['frontend','frontend_test','frontend_build','ui_required','run_performance_tests','scale','cognitive','situational','bundle','maintenance'])assert.equal(outputs[key],false,key+' must not run');
 assert.throws(()=>call({...b,enabled:false}));
 assert.throws(()=>call(b,entries,(cmd,a,...rest)=>cmd==='rev-parse'&&a===head+':server-version/backend'?h('9'):f.read(cmd,a,...rest)));
 assert.throws(()=>call(b,entries,(cmd,a,...rest)=>cmd==='rev-parse'&&a===head+':'+paths[0]?h('9'):f.read(cmd,a,...rest)));
 assert.throws(()=>call(b,entries,(cmd,a,...rest)=>cmd==='rev-parse'&&a===source+'^{tree}'?h('9'):f.read(cmd,a,...rest)));
 for(const outside of ['server-version/backend/src/unrelated.ts','server-version/frontend/package-lock.json','server-version/frontend/src/App.tsx','docs/evidence/other/tests.json']){
  const changed=entries.map(e=>e.file===paths[0]?{...e,file:outside}:e),{[paths[0]]:removed,...rest}=b.source;
  assert.throws(()=>call({...b,source:{...rest,[outside]:removed}},changed));
 }
 for(const patch of [{CI_HEAD_REF:BRANCHES[415]},{CI_PR_NUMBER:'415'},{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'}])assert.throws(()=>call(b,entries,f.read,{...env,...patch}));
 const outcomes={scope:{result:'success',outputs:Object.fromEntries(Object.entries(outputs).map(([key,value])=>[key,String(value)]))},'onboarding-structure':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(outcomes,false),['scope','onboarding-structure','codeql']);assert.deepEqual(failedChecks(outcomes,false),[]);assert(failedChecks(outcomes,true).length);
 for(const key of ['onboarding-structure','codeql'])for(const result of ['failure','cancelled','skipped',undefined])assert(failedChecks({...outcomes,[key]:{result}},false).length);
});


test('PR420 official reuse accepts only the fixed successful steps and preserves cancelled qualification',()=>{
 const o=pr420BuildOrigin,now=Date.parse('2026-10-30T22:00:00Z');
 const run={id:o.run,run_attempt:1,head_sha:o.source,path:'.github/workflows/ci.yml',event:'pull_request',head_branch:BRANCHES[420],status:'completed',conclusion:'cancelled'};
 const job=(id,name,steps)=>({id,run_id:o.run,run_attempt:1,head_sha:o.source,name,status:'completed',conclusion:'cancelled',steps:steps.map(([number,name])=>({number,name,status:'completed',conclusion:'success'}))});
 const build=job(o.buildJob,'frontend artifacts / release consumers early / build',[[6,'build production frontend'],[9,'Run actions/upload-artifact@v4']]);
 const lint=job(o.lintJob,'frontend (lint + types + full tests + build) / frontend checks',[[9,'lint']]);
 const artifact={id:o.artifact,name:'frontend-dist-'+o.merge,workflow_run:{id:o.run,head_sha:o.source},expired:false,size_in_bytes:o.size,digest:'sha256:'+o.sha256,created_at:'2026-10-30T15:42:34Z',expires_at:'2026-10-31T15:42:32Z'};
 const verify=(r=run,b=build,l=lint,a=artifact,tree=o.frontend,time=now)=>verifyPr420OfficialMetadata(r,b,l,a,tree,time);
 const accepted=verify();assert.equal(accepted.originalWholeJobPassed,false);assert.equal(accepted.originalRunConclusion,'cancelled');assert.equal(accepted.buildExecutedThisRun,false);
 for(const patch of [{id:1},{run_attempt:2},{head_sha:h('9')},{conclusion:'success'}])assert.throws(()=>verify({...run,...patch}));
 for(const original of [build,lint])for(const conclusion of ['failure','cancelled','skipped']){
  const bad={...original,steps:original.steps.map((s,i)=>i===0?{...s,conclusion}:s)};
  assert.throws(()=>original===build?verify(run,bad):verify(run,build,bad));
 }
 for(const patch of [{id:1},{expired:true},{size_in_bytes:o.size+1},{digest:'sha256:'+h('9')},{name:'frontend-ui-lab-dist-'+o.merge},{workflow_run:{id:o.run,head_sha:h('9')}}])assert.throws(()=>verify(run,build,lint,{...artifact,...patch}));
 assert.throws(()=>verify(run,build,lint,artifact,h('9')));assert.throws(()=>verify(run,build,lint,artifact,o.frontend,now+86400000));
});

test('Training standalone Cognitive formal route accepts its four original cases without frontend or fixture replay',()=>{
 const f=fixture(),file='server-version/backend/src/modules/training-analysis/group-source.ts',b={...f.b,pr:422,source:{[file]:{before:null,after:blob}},controlBefore:{...f.b.controlBefore,...Object.fromEntries(GROUP_REPORT_CONTROLS.map(path=>[path,null]))}};
 const entries=[...f.entries.map(e=>Object.hasOwn(f.b.source,e.file)?{...e,file}:e),...GROUP_REPORT_CONTROLS.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))],env={...f.env,CI_PR_NUMBER:'422',CI_HEAD_REF:BRANCHES[422]};
 const p=onboardingPlan(entries,base,head,f.read,env,b);assert.equal(p.pr,422);assert(task1SastConfig(p,b).paths.includes(file));assert(task1SastConfig(p,b).paths.includes(GROUP_REPORT_CONTROLS[0]));
 assert.throws(()=>onboardingPlan(entries,base,head,(cmd,a,...rest)=>cmd==='rev-parse'&&a===head+':server-version/frontend'?h('9'):f.read(cmd,a,...rest),env,b));
 const root='docs/evidence/group-report-training-standalone-20261030/',native=JSON.parse(readFileSync(root+'training-standalone-cognitive-group-proof.json')),archived=JSON.parse(readFileSync(root+'training-standalone-cognitive-group-archived-proof.json'));
 assert.equal(verifyTrainingStandaloneCognitiveObservation(native,'standalone-cognitive').testsExecutedInCI,false);
 assert.equal(verifyTrainingStandaloneCognitiveObservation(archived,'standalone-archived').testsExecutedInCI,false);
 assert.throws(()=>verifyTrainingStandaloneCognitiveObservation({...native,participantN:1},'standalone-cognitive'));
 assert.throws(()=>verifyTrainingStandaloneCognitiveObservation({...archived,oldSnapshotUnchanged:false},'standalone-archived'));
});

test('Training course delivery qualifier binds its backend/frontend and reviewed Legacy compatibility without widening source scope',()=>{
 const f=fixture(),backend='server-version/backend/src/modules/scale/scale-access.ts',frontend='server-version/frontend/src/pages/student/ScaleAssessment.tsx';
 f.b.pr=423;f.b.source=Object.fromEntries([backend,frontend].map(path=>[path,{before:null,after:blob}]));
 f.entries=[backend,frontend,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 f.env={...f.env,CI_PR_NUMBER:'423',CI_HEAD_REF:BRANCHES[423]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 const p=onboardingPlan(f.entries,base,head,read,f.env,f.b);assert.equal(p.pr,423);assert(task1SastConfig(p,f.b).paths.includes(frontend));
 const unknown='server-version/backend/src/modules/scale/unrelated-new-runtime.ts';
 assert.throws(()=>onboardingPlan([...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}],base,head,read,f.env,{...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}}));
});


test('Training standalone Scale reader qualifier uses retained cases and stays within its exact backend source',()=>{
 const f=fixture(),file='server-version/backend/src/modules/training-analysis/source.ts';
 f.b.pr=424;f.b.source={[file]:{before:null,after:blob}};
 f.entries=[file,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 f.env={...f.env,CI_PR_NUMBER:'424',CI_HEAD_REF:BRANCHES[424]};
 const p=onboardingPlan(f.entries,base,head,f.read,f.env,f.b);assert.equal(p.pr,424);assert(task1SastConfig(p,f.b).paths.includes(file));
 assert.throws(()=>onboardingPlan(f.entries,base,head,(cmd,a,...r)=>cmd==='rev-parse'&&a===head+':server-version/frontend'?h('9'):f.read(cmd,a,...r),f.env,f.b));
});


test('Shared SELF GROUP qualifier binds both current components and its two disclosure fixes without a second application engine',()=>{
 const f=fixture(),backend='server-version/backend/src/modules/reporting/respondentSummary.ts',frontend='server-version/frontend/src/components/education-tools/EducationAssessmentRegistrationPanel.tsx';
 f.b.pr=426;f.b.source=Object.fromEntries([backend,frontend].map(path=>[path,{before:null,after:blob}]));f.entries=[backend,frontend,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));f.env={...f.env,CI_PR_NUMBER:'426',CI_HEAD_REF:BRANCHES[426]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 const p=onboardingPlan(f.entries,base,head,read,f.env,f.b);assert.equal(p.pr,426);assert(task1SastConfig(p,f.b).paths.includes(backend));assert(task1SastConfig(p,f.b).paths.includes(frontend));
 const unknown='server-version/backend/src/modules/reporting/unrelated-new-engine.ts';assert.throws(()=>onboardingPlan([...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}],base,head,read,f.env,{...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}}));
});

// PR432 checks only the new routing/receipt glue; retained business cases are not executed.
test('PR432 exact mixed scope and changed-input SAST keep unrelated paths outside the lane',()=>{
 const f=fixture(),paths=['server-version/backend/src/modules/reporting/discovery.ts','server-version/frontend/src/components/FinalQuestionnaireAssessment.tsx'];
 f.b.pr=432;f.b.source=Object.fromEntries(paths.map(path=>[path,{before:null,after:blob}]));
 f.entries=[...paths,...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));f.env={...f.env,CI_PR_NUMBER:'432',CI_HEAD_REF:BRANCHES[432]};
 const read=(cmd,a,...r)=>cmd==='rev-parse'&&a===base+':server-version/frontend'?h('9'):f.read(cmd,a,...r);
 const p=onboardingPlan(f.entries,base,head,read,f.env,f.b);assert.equal(p.pr,432);assert.equal(onboardingOutputs(p).application_route,'onboarding-structure');
 assert.deepEqual(task1SastConfig(p,f.b).paths.filter(path=>path.startsWith('server-version/')),paths.sort());
 for(const patch of [{CI_HEAD_REF:'other'},{CI_PR_NUMBER:'433'},{CI_FORCE_FULL:'true'}])assert.throws(()=>onboardingPlan(f.entries,base,head,read,{...f.env,...patch},f.b));
 const unknown='server-version/backend/src/unrelated.ts';assert.throws(()=>onboardingPlan([...f.entries,{file:unknown,status:'A',oldMode:'000000',newMode:'100644'}],base,head,read,f.env,{...f.b,source:{...f.b.source,[unknown]:{before:null,after:blob}}}));
});
test('PR432 admits exactly the retained 14-case union and rejects either original-byte hash drift',()=>{
 const review=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json')).candidates['432'];
 const names=review.reports.flatMap(proof=>verifyOriginalReport(decodeOriginal(proof,readFileSync(proof.path)),proof));assert.equal(names.length,14);assert.equal(new Set(names).size,14);
 const proof=review.reports[0],bytes=readFileSync(proof.path);
 assert.throws(()=>decodeOriginal({...proof,sha256:'0'.repeat(64)},bytes));assert.throws(()=>decodeOriginal({...proof,originalJSONSHA256:'0'.repeat(64)},bytes));
});
test('PR432 admits actual final-tree cloud compiler argv and exit records without inferring success from logs',()=>{
 const review=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json')).candidates['432'];
 for(const proof of review.types){const receipt=decodeOriginal(proof,readFileSync(proof.path)),call=value=>verifyCloudComponentTypeReceipt(value,proof,path=>readFileSync(path),proof.componentTree);
  assert.equal(call(receipt).originalExitCode,0);assert.throws(()=>call({...receipt,exitCode:1}));assert.throws(()=>call({...receipt,componentTree:h('9')}));assert.throws(()=>call({...receipt,argv:['node','--version']}));
 }
});
