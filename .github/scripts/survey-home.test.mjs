import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedSurveyFiles,surveyHomePlan,surveyRequired} from './survey-home-scope.mjs';
import {failedChecks,requiredChecks} from './merge-gate.mjs';
const base='a'.repeat(40),head='b'.repeat(40),tree='c'.repeat(40);
const entries=Object.entries(reviewedSurveyFiles).map(([file,s])=>({file,status:s.before?'M':'A',oldMode:s.before?'100644':'000000',newMode:'100644'}));
const read=(_command,ref)=>{
 const [sha,file]=ref.split(':');const s=reviewedSurveyFiles[file];
 return s?(sha===head?s.after:s.before):tree;
};
const plan=()=>surveyHomePlan(entries,base,head,read);
function needs(){
 const outputs={application_route:'survey-home',scenario:'survey-home',codeql:'true',survey_home_plan:JSON.stringify(plan())};
 for(const k of ['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'])outputs[k]='false';
 return {scope:{result:'success',outputs},'survey-home':{result:'success'},codeql:{result:'success'}};
}
test('only the complete reviewed 14-file patch admits the frontend candidate',()=>{
 const p=plan();assert.equal(Object.keys(reviewedSurveyFiles).length,14);
 assert.equal(p.route,'survey-home');assert.deepEqual(p.changed,['frontend']);assert.deepEqual(p.required,[...surveyRequired]);
});
test('unknown files, backend, dependencies and CI-only diffs are not admitted',()=>{
 for(const file of ['server-version/backend/src/routes/auth.ts','server-version/frontend/package-lock.json','server-version/frontend/src/main.tsx','server-version/frontend/src/survey/Unknown.tsx','AGENTS.md'])
  assert.equal(surveyHomePlan([...entries,{file,status:'M',oldMode:'100644',newMode:'100644'}],base,head,read),null,file);
 assert.equal(surveyHomePlan([{file:'.github/workflows/ci.yml',status:'M',oldMode:'100644',newMode:'100644'}],base,head,read),null);
});
test('deletions, executable files, symlinks and unreviewed content fail closed',()=>{
 for(const meta of [{status:'D',newMode:'000000'},{newMode:'100755'},{newMode:'120000'},{status:'T'}])
  assert.equal(surveyHomePlan([{...entries[0],...meta},...entries.slice(1)],base,head,read),null);
 assert.equal(surveyHomePlan(entries,base,head,(command,ref)=>ref.includes('SurveyApp.tsx')?'d'.repeat(40):read(command,ref)),null);
});
test('missing assets, changed original source and changed backend tree are refused',()=>{
 assert.equal(surveyHomePlan(entries.slice(1),base,head,read),null);
 assert.equal(surveyHomePlan(entries,base,head,(cmd,ref)=>ref===base+':server-version/frontend/src/survey/SurveyBuilder.tsx'?'d'.repeat(40):read(cmd,ref)),null);
 assert.equal(surveyHomePlan(entries,base,head,(cmd,ref)=>ref===head+':server-version/backend'?'d'.repeat(40):read(cmd,ref)),null);
 assert.equal(surveyHomePlan(entries,'HEAD',head,read),null);
});
test('aggregate requires scope, actual candidate and SAST; every incomplete status blocks',()=>{
 const n=needs();assert.deepEqual(requiredChecks(n,false),['scope','survey-home','codeql']);assert.deepEqual(failedChecks(n,false),[]);
 for(const key of ['scope','survey-home','codeql'])for(const result of ['failure','cancelled','skipped',undefined]){
  const bad=structuredClone(n);bad[key].result=result;assert.ok(failedChecks(bad,false).includes(key));
 }
 assert.ok(failedChecks(n,true).includes('scope'));
});
test('malformed plans or unexpected platform acceptance cannot authorize merging',()=>{
 for(const update of [{route:'campus'},{changed:['backend']},{required:['survey-browser']},{head:'HEAD'},{changes:[]}]){
  const n=needs();n.scope.outputs.survey_home_plan=JSON.stringify({...plan(),...update});assert.ok(failedChecks(n,false).includes('scope'));
 }
 const n=needs();n.scope.outputs.media2='true';assert.ok(failedChecks(n,false).includes('scope'));
});
test('workflow routes only this ready PR and preserves recomputation and HIGH/CRITICAL scanning',()=>{
 const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const ci=source('../workflows/ci.yml'),workflow=source('../workflows/ci-survey-home.yml');
 assert.match(ci,/survey-home:[\s\S]*?draft == false/);assert.match(ci,/needs: \[scope,.*survey-home\]/);
 assert.match(source('./merge-gate.mjs'),/recomputed-survey-home-plan/);
 assert.match(workflow,/p.head,head/);assert.match(workflow,/surveyHomePlan\(changedEntries/);
 assert.match(workflow,/--severity HIGH,CRITICAL/);assert.doesNotMatch(workflow,/backend|postgres/i);
 assert.match(source('./survey-home-candidate.py'),/--maxWorkers=2/);
});
