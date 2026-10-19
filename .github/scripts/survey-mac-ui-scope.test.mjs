import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsSurveyMac,surveyMacTools,surveyMacRequired,validSurveyMacPlan,surveyMacPlan,knownSurveyManual,rejectSurveyManual} from './survey-mac-ui-scope.mjs';
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
    return f?(ref===b.base?f.before:f.after):(b.affectedFrontendTests.find(t=>'server-version/frontend/'+t.file===path)?.blob??sha);
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
  assert.equal(plan.frontendTests.length,21);
  const unchanged=b.affectedFrontendTests.find(t=>!b.files.some(f=>f.path==='server-version/frontend/'+t.file));
  assert.ok(unchanged);
  assert.throws(()=>surveyMacPlan(full,b.base,head,env,{...io,object:(ref,path)=>ref===head&&path==='server-version/frontend/'+unchanged.file?other:object(ref,path)}),/affected test input/);
  const push=surveyMacPlan(full,b.base,head,{...env,CI_EVENT:'push',CI_SURVEY_MAC_SOURCE_HEAD:undefined},io);assert.equal(push.sourceHead,reviewed);
});
const fixed=JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url)));
const p={schema:1,route:'survey-mac-ui',base:fixed.base,head:sha,sourceHead:sha,reviewedHead:sha,tree:sha,productHead:fixed.productHead,frontendTree:fixed.frontendTree,
  changed:['frontend'],changes:[...fixed.files.map(f=>({...f,file:f.path})),...surveyMacTools.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644',before:other,after:sha}))],
  inputs:{'.github':sha,'server-version/frontend':fixed.frontendTree,'server-version/scripts/release':fixed.protected['server-version/scripts/release'],...fixed.externalFixtures},
  frontendTests:fixed.affectedFrontendTests.map(f=>f.file),required:surveyMacRequired};
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
test('browser fixture binds the export wave to its real heading panel and exact project-detail DTO',()=>{
  const browser=readFileSync(new URL('./survey-mac-ui-browser.mjs',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../server-version/frontend/src/survey/SurveyAnalyticsWorkspace.tsx',import.meta.url),'utf8');
  const studio=readFileSync(new URL('../../server-version/frontend/src/survey/SurveyWaveStudio.tsx',import.meta.url),'utf8');
  assert.match(workspace,/<h3[^>]*>匿名科研数据导出<\/h3>/);
  assert.match(browser,/const exportPanel=v\.page\.getByRole\('heading',\{name:'匿名科研数据导出',exact:true\}\)\.locator\('\.\.'\)/);
  assert.match(browser,/await exportPanel\.waitFor\(\{state:'visible'\}\);\n assert\.equal\(await exportPanel\.count\(\),1/);
  assert.match(browser,/exportPanel\.getByLabel\('波次',\{exact:true\}\)\.count\(\),1/);
  assert.match(browser,/await exportPanel\.getByLabel\('波次',\{exact:true\}\)\.selectOption\(waveId\)/);
  assert.doesNotMatch(browser,/v\.page\.getByLabel\('波次'/);
  assert.match(studio,/surveyApi<Project>\(path\)/);
  assert.match(browser,/if\(key==='GET '\+prefix\)\{emptyBody\(method,body\);return response\(project\);\}/);
  assert.match(browser,/const project=\{id,title:'合成研究',description:'合成测试，不含真实被试',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:7\}/);
});
test('browser initialization has exact admin capability DTO and scopes a whole-second clock to recovery only',()=>{
  const browser=readFileSync(new URL('./survey-mac-ui-browser.mjs',import.meta.url),'utf8');
  const capabilities=readFileSync(new URL('../../server-version/frontend/src/contexts/CapabilitiesContext.tsx',import.meta.url),'utf8');
  assert.match(capabilities,/typeof response\.data\?\.cognitive !== 'boolean'/);
  assert.match(capabilities,/typeof response\.data\?\.parentPortal !== 'boolean'/);
  assert.match(browser,/if\(key==='GET \/api\/capabilities'\)\{emptyBody\(method,body\);return response\(\{cognitive:true,parentPortal:false\}\);\}/);
  const scene=browser.slice(browser.indexOf('async function scene('),browser.indexOf('async function checkLayout('));
  assert.match(scene,/async function scene\(mode,width=1440,\{recovery=false\}=\{\}\)/);
  assert.match(scene,/if\(recovery\)await page\.clock\.install/);
  assert.doesNotMatch(scene,/clock\.pauseAt|\.goto\(/);
  assert.equal((browser.match(/clock\.install\(/g)??[]).length,1);
  const research=browser.slice(browser.indexOf('async function openResearch('),browser.indexOf('async function openRecovery('));
  assert.match(research,/const v=await scene\('researcher',width,\{recovery\}\);await v\.page\.goto/);
  assert.ok(research.indexOf("exportPanel.waitFor({state:'visible'})")<research.indexOf('return v;'));
  const recovery=browser.slice(browser.indexOf('async function openRecovery('),browser.indexOf('const click='));
  assert.match(recovery,/const v=await openResearch\(1440,\{recovery:true\}\)/);
  assert.doesNotMatch(recovery,/clock\.install/);
  assert.ok(recovery.indexOf('await openResearch(')<recovery.indexOf('clock.pauseAt'));
  assert.match(recovery,/await v\.page\.clock\.pauseAt\(new Date\(Math\.ceil\(\(now\+1000\)\/1000\)\*1000\)\)/);
  assert.match(browser,/async function secondPage\(\)\{\n const v=await openRecovery\(\)/);
  const contracts=browser.slice(browser.indexOf('// Both engines exercise'));
  assert.doesNotMatch(contracts,/await openResearch\(/);
  assert.doesNotMatch(contracts,/checkLayout\(/);
  assert.match(browser,/noAutomatic\(v,900001\)/);assert.match(browser,/noAutomatic\(v,120001\)/);
});
test('known Survey PR remains eligible but every manual full/probe entry refuses before heavy jobs',()=>{
  const ref='refs/heads/survey/mac-visual-s01-20261019';
  for(const event of ['pull_request','push'])assert.equal(knownSurveyManual(event,ref),false);
  for(const inputs of [{full_acceptance:'true',step_probe:'none'},...['images','frontend','backend','browser','maintenance','cognitive'].map(step_probe=>({step_probe}))]) {
    assert.equal(knownSurveyManual('workflow_dispatch',ref),true);
    assert.throws(()=>rejectSurveyManual({CI_EVENT:'workflow_dispatch',GITHUB_REF:ref,...inputs}),/refuses every manual full\/probe/);
    assert.doesNotThrow(()=>rejectSurveyManual({CI_EVENT:'workflow_dispatch',GITHUB_REF:'refs/heads/other',...inputs}));
  }
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  assert.match(ci,/known-survey-manual-refusal:\n    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/survey\/mac-visual-s01-20261019'/);
  const jobs=[...ci.matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|$(?![\s\S]))/gm)];
  const protectedJobs=jobs.filter(j=>j[1].startsWith('probe-')||['scope','merge-gate'].includes(j[1]));
  assert.equal(protectedJobs.length,17);
  for(const [,name,body] of protectedJobs) {
    const condition=body.split('\n').find(line=>line.startsWith('    if:'));
    assert.ok(condition?.includes("!(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/survey/mac-visual-s01-20261019')"),name);
  }
});
