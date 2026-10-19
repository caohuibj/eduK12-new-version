import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsSurveyMac,surveyMacTools,surveyMacRequired,validSurveyMacPlan,surveyMacPlan} from './survey-mac-ui-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const sha='a'.repeat(40), other='b'.repeat(40);
const bindings={schema:1,files:[{path:'docs/synthetic-evidence.py.txt',status:'A',oldMode:'000000',newMode:'100644',before:'0'.repeat(40),after:sha},
  {path:'server-version/frontend/src/survey/Synthetic.tsx',status:'M',oldMode:'100644',newMode:'100644',before:other,after:sha}]};
const entries=[...bindings.files.map(f=>({...f,file:f.path})),...surveyMacTools.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
const read=(ref)=>ref==='base'?other:sha;
test('exact product data and exact tools; evidence is only hashed, never executed',()=>assert.equal(admitsSurveyMac(entries,bindings,read),true));
test('unknown/add/delete/rename/mode/link/path/blob and incomplete inventory refuse',()=>{
  const variants=[entries.slice(1),[...entries,{file:'unreviewed.sh',status:'A',oldMode:'000000',newMode:'100644'}],
    [...entries,entries[0]],...['D','R100','T'].map(status=>[{...entries[0],status},...entries.slice(1)]),
    ...['100755','120000','160000'].map(newMode=>[{...entries[0],newMode},...entries.slice(1)]),
    ...['docs/../unsafe','docs/evil\nname','docs\\evil','/absolute'].map(file=>[{...entries[0],file},...entries.slice(1)])];
  for(const value of variants) assert.equal(admitsSurveyMac(value,bindings,read),false);
  assert.equal(admitsSurveyMac(entries,bindings,()=>other),false);
});
test('known branch refuses missing independent approval and wrong base; unrelated routes unaffected',()=>{
  const b=JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url)));
  assert.throws(()=>surveyMacPlan([],b.base,b.productHead,{CI_SURVEY_MAC_REQUIRED:'true'}),/reviewed tools HEAD missing/);
  assert.throws(()=>surveyMacPlan([],other,b.productHead,{CI_SURVEY_MAC_REQUIRED:'true'}),/wrong base/);
  assert.equal(surveyMacPlan([],other,b.productHead,{}),null);
  assert.throws(()=>surveyMacPlan([],b.base,b.productHead,{CI_SURVEY_MAC_REQUIRED:'true',SURVEY_MAC_UI_REVIEWED_HEAD:b.productHead,CI_SURVEY_MAC_SOURCE_HEAD:other}),/source differs/);
});
test('full frozen inventory closes protected inputs, checkout/source/tree and all tooling',()=>{
  const b=JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url)));
  const selection=JSON.parse(readFileSync(new URL('./survey-mac-ui-test-selection.json',import.meta.url)));
  const full=[...b.files.map(f=>({...f,file:f.path})),...surveyMacTools.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644',before:other,after:sha}))];
  const head='c'.repeat(40),reviewed='d'.repeat(40),tree='e'.repeat(40);
  const env={CI_SURVEY_MAC_REQUIRED:'true',CI_EVENT:'pull_request',CI_SURVEY_MAC_SOURCE_HEAD:reviewed,SURVEY_MAC_UI_REVIEWED_HEAD:reviewed};
  const object=(ref,path)=>{
    if(!path)return tree;
    if(path==='server-version/frontend')return b.frontendTree;
    if(path in b.protected)return b.protected[path];
    if(path in b.externalFixtures)return b.externalFixtures[path];
    const f=b.files.find(f=>f.path===path);
    return f?(ref===b.base?f.before:f.after):sha;
  };
  const io={bindings:b,selection,object,diff:()=>full};
  const plan=surveyMacPlan(full,b.base,head,env,io);assert.ok(validSurveyMacPlan(plan));
  assert.equal(plan.changes.length,322);assert.equal(Object.keys(plan.inputs).length,5);
  for(const path of [...Object.keys(b.protected),...Object.keys(b.externalFixtures)]) {
    const changed=(ref,file)=>ref===head&&file===path?other:object(ref,file);
    assert.throws(()=>surveyMacPlan(full,b.base,head,env,{...io,object:changed}),/product changed|protected input/);
  }
  assert.throws(()=>surveyMacPlan(full,b.base,head,env,{...io,object:(ref,file)=>ref===head&&!file?other:object(ref,file)}),/checkout\/merge tree/);
  assert.throws(()=>surveyMacPlan(full,b.base,head,env,{...io,object:(ref,file)=>ref===head&&file==='.github'?other:object(ref,file)}),/tools closure/);
  assert.throws(()=>surveyMacPlan(full.slice(1),b.base,head,env,io),/incomplete supplied diff/);
  assert.throws(()=>surveyMacPlan(full,b.base,head,env,{...io,selection:{...selection,frontendTests:[]}}),/test selection/);
  const push=surveyMacPlan(full,b.base,head,{...env,CI_EVENT:'push',CI_SURVEY_MAC_SOURCE_HEAD:undefined},io);assert.equal(push.sourceHead,reviewed);
});
const fixed=JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url)));
const p={schema:1,route:'survey-mac-ui',base:fixed.base,head:sha,sourceHead:sha,reviewedHead:sha,tree:sha,productHead:fixed.productHead,frontendTree:fixed.frontendTree,
  changed:['frontend'],changes:[...fixed.files.map(f=>({...f,file:f.path})),...surveyMacTools.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644',before:other,after:sha}))],
  inputs:{'.github':sha,'server-version/frontend':fixed.frontendTree,'server-version/scripts/release':fixed.protected['server-version/scripts/release'],...fixed.externalFixtures},
  frontendTests:fixed.files.filter(f=>f.category==='test').map(f=>f.path.replace('server-version/frontend/','')),required:surveyMacRequired};
const outputs={application_route:'survey-mac-ui',scenario:'survey-mac-ui',survey_mac_ui_plan:JSON.stringify(p),codeql:'true',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',
  ...Object.fromEntries(['frontend_build','ui_required','visual_hosted','maintenance','content','presentation','frontend','frontend_test','documentation','scale','cognitive','situational','bundle','media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
const needs={scope:{result:'success',outputs},'survey-mac-ui':{result:'success'},codeql:{result:'success'}};
test('all selected checks mandatory, drafts/missing/cancel/skip/failure refuse',()=>{
  assert.deepEqual(requiredChecks(needs,false),['scope','survey-mac-ui','codeql']);
  assert.deepEqual(failedChecks(needs,false),[]);
  assert.ok(failedChecks(needs,true).includes('scope'));
  for(const job of requiredChecks(needs,false)) for(const result of [undefined,'failure','cancelled','skipped']) {
    const n=structuredClone(needs);n[job].result=result;
    assert.ok(failedChecks(n,false).includes(job));
  }
});
test('tampered plan/legacy consumers/malformed flags refuse',()=>{
  for(const [key,value] of [['head','wrong'],['required',[]],['frontendTests',[]],['reviewedHead',other],['changes',[]],['inputs',{}]])assert.equal(validSurveyMacPlan({...p,[key]:value}),false);
  for(const key of ['frontend_build','app_shell','ops','frontend','cognitive','documentation']) {
    const n=structuredClone(needs);n.scope.outputs[key]='true';assert.ok(failedChecks(n,false).includes('scope'));
  }
  const n=structuredClone(needs);n.scope.outputs.survey_mac_ui_plan='{}';assert.ok(failedChecks(n,false).includes('scope'));
});
test('workflow topology preserves main-only pushes and confines exact Survey qualification',()=>{
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const route=readFileSync(new URL('../workflows/ci-survey-mac-ui.yml',import.meta.url),'utf8');
  assert.match(ci,/push:\n    branches:\n      - main\n/);
  assert.match(ci,/CI_SURVEY_MAC_REQUIRED:/);assert.match(ci,/SURVEY_MAC_UI_REVIEWED_HEAD:/);
  assert.match(ci,/survey-mac-ui, release-tools/);assert.match(ci,/survey_mac_ui_plan:/);
  assert.match(route,/workflow_call:/);assert.doesNotMatch(route,/workflow_dispatch:|\n  push:|\n  pull_request:/);
  for(const phase of ['lint','types','tests','audit']) assert.ok(route.includes(phase));
  assert.match(route,/HIGH,CRITICAL/);assert.match(route,/chromium, webkit/);
  assert.match(route,/result !== 'success'/);assert.match(route,/runtime\.tar/);
  assert.doesNotMatch(route,/local-validation|backend-candidate|migrate deploy/);
});
