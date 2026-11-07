import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleTestDelta,validateFailureReport,validateSourceEvidence,unchangedCiControl} from './ci-frontend-retest.mjs';
import {classifyChanges,frontendTestOnly} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
import {mediaPlan} from './ci-media-plan.mjs';
import {acceptanceFor} from './content-scope.mjs';

const testPath='server-version/frontend/src/survey/SurveyQuestionnaireSelection.test.tsx';
const other='server-version/backend/src/modules/campus/activity.tasks.ts';
const f=(path,sha='a'.repeat(40),mode='100644',type='blob')=>({path,sha,mode,type});
const before=[f(testPath),f(other)],after=[f(testPath,'b'.repeat(40)),f(other)];
const report={
  success:false,numFailedTests:1,numPassedTests:4,
  testResults:[
    {name:'/home/runner/work/repo/server-version/frontend/src/survey/SurveyQuestionnaireSelection.test.tsx',
      assertionResults:[{status:'passed'},{status:'failed'}]},
    {name:'/home/runner/work/repo/server-version/frontend/src/pages/student/Something.test.tsx',
      assertionResults:[{status:'passed'},{status:'passed'}]}
  ]
};

test('retest admits only an existing 100644 frontend test file, with every other Git blob unchanged',()=>{
  assert.equal(eligibleTestDelta(before,after),'src/survey/SurveyQuestionnaireSelection.test.tsx');
  assert.equal(eligibleTestDelta(before,before),null);
  assert.equal(eligibleTestDelta(before,[...after,f('server-version/frontend/src/pages/student/extra.test.tsx')]),null);
  assert.equal(eligibleTestDelta(before,after.map(x=>x.path===other?{...x,sha:'c'.repeat(40)}:x)),null);
  assert.equal(eligibleTestDelta(before,[f(testPath,'b'.repeat(40),'100755'),f(other)]),null);
  assert.equal(eligibleTestDelta(before,[f('server-version/frontend/src/pages/student/new.tsx','b'.repeat(40)),f(other)]),null);
  assert.equal(eligibleTestDelta(before,[f(testPath),f(other,'b'.repeat(40))]),null);
  assert.equal(eligibleTestDelta(before,[f('server-version/frontend/src/pages/student/new.test.tsx','b'.repeat(40)),f(other)]),null);
  assert.throws(()=>eligibleTestDelta(before,[...after,after[0]]),/duplicate/);
});
test('safe reuse requires original CI, dependencies, Prisma and runtime controls identical to main',()=>{
  const main=[f('.github/workflows/ci.yml'),f('server-version/frontend/package-lock.json'),
    f('server-version/backend/prisma/schema.prisma'),f(other)];
  assert.equal(unchangedCiControl(main,[...main.slice(0,3),f(other,'b'.repeat(40))]),true,
    'A completed first full run can validate ordinary backend source changes');
  for(const changed of [0,1,2]){
    const source=[...main];source[changed]={...source[changed],sha:'b'.repeat(40)};
    assert.equal(unchangedCiControl(main,source),false,'Cannot trust modified control '+changed);
  }
  assert.equal(unchangedCiControl(main,[...main,f('.github/scripts/custom.mjs')]),false);
  assert.equal(unchangedCiControl(main,main.slice(1)),false);
});
test('single failing Vitest report must identify exactly the corrected file and every failed assertion',()=>{
  assert.equal(validateFailureReport(report,testPath.slice('server-version/frontend/'.length)),true);
  for(const change of [
    r=>{r.success=true},r=>{r.numFailedTests=2},
    r=>{r.numPassedTests=0},r=>{r.testResults=[]},
    r=>{r.testResults[0].name='/runner/other.test.tsx'},
    r=>{r.testResults[1].assertionResults[0].status='failed'},
    r=>{r.testResults[1].assertionResults=[]},
    r=>{r.testResults.push(r.testResults[0])},
  ]){const changed=structuredClone(report);change(changed);assert.throws(()=>validateFailureReport(changed,testPath.slice('server-version/frontend/'.length)));}
});

const accepted=[{file:'server-version/frontend/src/pages/student/LocalPage.tsx',status:'M',oldMode:'100644',newMode:'100644'}];
test('existing lightweight frontend, frontend-test and content categories do not become platform',()=>{
  const local=classifyChanges(accepted,false);
  assert.equal(local.frontend,true);
  assert.equal(local.documentation,false);
  assert.equal(frontendTestOnly([testPath]),true);
  const testOnly=classifyChanges([{...accepted[0],file:testPath}],false);
  assert.equal(testOnly.frontend_test,true);
  const content=classifyChanges([{...accepted[0],file:'docs/scale-instruments/catalog.md'}],false);
  assert.equal(content.content,true);
  assert.equal(content.frontend,false);
  assert.equal(content.documentation,false);
  assert.equal(classifyChanges([{...accepted[0],file:other},accepted[0]],false).frontend,false);
});

const selected=['media2','video_core','media7','situational_video','situational_branching'];
const acceptance=Object.fromEntries(Object.keys(acceptanceFor([])).map(key=>[key,'true']));
const outputs={...acceptance,application_route:'legacy',scenario:'platform',
    frontend:'false',content:'false',presentation:'false',documentation:'false',
    maintenance:'false',frontend_test:'false',frontend_build:'true',ui_required:'true',
    visual_hosted:'true',codeql:'true',runner_profile:'hosted',
    frontend_affected:'false',dependencies_frontend_only:'false',image_build:'false',
    scale_intake_light:'false',cognitive_intake_light:'false',
    media_selection:JSON.stringify(selected),media_groups:JSON.stringify(mediaPlan(selected)),
    diff_base:'d'.repeat(40),frontend_retest:'false'};
const base={scope:{result:'success',outputs},
  'backend-regression-reuse':{result:'success',outputs:{reuse_backend_regression:'false'}}};
for(const key of requiredChecks(base,false)){
  if(key!=='scope'&&key!=='backend-regression-reuse')base[key]={result:'success'};
}
base.frontend={result:'failure'};
const runs={
 id:48,run_attempt:1,head_sha:'a'.repeat(40),path:'.github/workflows/ci.yml',
 event:'pull_request',status:'completed',conclusion:'failure',
 repository:{full_name:'example/edu'},pull_requests:[{number:7}],
 updated_at:new Date().toISOString()
};
const jobs=[
 {name:'frontend (lint + types + selected tests) / frontend checks',status:'completed',conclusion:'failure',run_attempt:1},
 {name:'merge gate / ready PR',status:'completed',conclusion:'failure',run_attempt:1},
 ...['classify changed content','backend checks','docker checks'].map(name=>({name,status:'completed',conclusion:'success',run_attempt:1}))
];
const context=()=>({run:runs,jobs,needs:base,report,
  baseSha:outputs.diff_base,pr:7,repo:'example/edu',testFile:testPath.slice('server-version/frontend/'.length)});
test('prior platform full gate may have exactly one failed frontend dependency',()=>{
  assert.deepEqual(failedChecks(base,false),['frontend']);
  assert.doesNotThrow(()=>validateSourceEvidence(context()));
  for(const [k,mutate] of [
    ['cancelled',o=>{o.run.conclusion='cancelled'}],
    ['foreign-base',o=>{o.baseSha='b'.repeat(40)}],
    ['other-failure',o=>{o.jobs[2].conclusion='failure'}],
    ['missing-gate',o=>{o.jobs=o.jobs.filter(j=>j.name!=='merge gate / ready PR')}],
    ['incomplete-gate',o=>{o.needs['backend-regression'].result='skipped'}],
    ['second-frontend-failure',o=>{o.report.numFailedTests=2}],
    ['source-was-retest',o=>{o.needs.scope.outputs.frontend_retest='true'}],
    ['source-was-lightweight',o=>{o.needs.scope.outputs.scenario='frontend-test'}]
  ]){
    const o=structuredClone(context());mutate(o);
    assert.throws(()=>validateSourceEvidence(o),k);
  }
});
test('new merge-gate evidence fields cannot be set without a verified targeted run',()=>{
  const lightweight={scope:{result:'success',outputs:{
    ...outputs,scenario:'frontend-test',frontend_test:'true',frontend_build:'false',
    visual_hosted:'false',codeql:'false',ui_required:'false',
    ...Object.fromEntries(Object.keys(acceptance).map(k=>[k,'false'])),
    media_selection:'[]',media_groups:'[]',frontend_retest:'true',
    frontend_retest_file:'src/survey/SurveyQuestionnaireSelection.test.tsx',
    frontend_retest_source_run:'48',frontend_retest_source_sha:'a'.repeat(40),
    frontend_retest_gate_digest:'d'.repeat(64),frontend_retest_report_digest:'e'.repeat(64)
  }},frontend:{result:'success'}};
  assert.deepEqual(failedChecks(lightweight,false),[]);
  assert(failedChecks({...lightweight,scope:{...lightweight.scope,outputs:{
    ...lightweight.scope.outputs,frontend_retest_source_run:'wrong'
  }}},false).includes('frontend-retest-proof'));
  assert(failedChecks({...lightweight,scope:{...lightweight.scope,outputs:{
    ...lightweight.scope.outputs,frontend_retest:'false'
  }}},false).includes('frontend-retest-proof'));
});
