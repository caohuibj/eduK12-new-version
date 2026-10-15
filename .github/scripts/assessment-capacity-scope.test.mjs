import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {admitsAssessmentCapacity,assessmentCapacitySources,assessmentCapacityRequired,assessmentCapacityPlan,isolatedCognitiveEnvironmentOnly} from './assessment-capacity-scope.mjs';
import {changedEntries} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const sources=[...assessmentCapacitySources],approved={schema:1,files:Object.fromEntries(sources.map(file=>[file,{before:'1'.repeat(40),after:'2'.repeat(40)}]))};
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const entries=sources.map(entry);const read=(ref,file)=>approved.files[file][ref==='base'?'before':'after'];
test('complete immutable source boundary rejects unknown, dependencies, schema, homepage and deletion changes',()=>{
 assert.equal(admitsAssessmentCapacity(entries,read,approved),true);
 assert.equal(admitsAssessmentCapacity(entries.slice(1),read,approved),false);
 for(const file of ['server-version/backend/prisma/migrations/unreviewed/migration.sql','server-version/backend/package-lock.json','server-version/backend/Dockerfile.unknown','server-version/backend/src/controllers/authController.ts','server-version/frontend/src/survey/SurveyLanding.tsx','server-version/frontend/src/huiteacher/HuiteacherLanding.tsx','server-version/backend/src/index.ts','server-version/backend/src/modules/scale/unknown.ts','unknown'])
  assert.equal(admitsAssessmentCapacity([...entries,entry(file)],read,approved),false,file);
 for(const update of [{status:'D',newMode:'000000'},{status:'T'},{oldMode:'120000'},{newMode:'100755'}])assert.equal(admitsAssessmentCapacity([{...entries[0],...update},...entries.slice(1)],read,approved),false);
 for(const ref of ['base','head'])assert.equal(admitsAssessmentCapacity(entries,(r,f)=>r===ref&&f===sources[0]?'3'.repeat(40):read(r,f),approved),false);
});
const plan={schema:1,route:'assessment-capacity',base:'a'.repeat(40),head:'b'.repeat(40),changed:['frontend','backend'],components:{frontend:'c'.repeat(40),backend:'d'.repeat(40)},tests:['test'],frontendTests:['test'],focusedTests:['test'],required:assessmentCapacityRequired,assessmentCapacityPlan,isolatedCognitiveEnvironmentOnly};
const outputs={application_route:plan.route,scenario:plan.route,assessment_capacity_plan:JSON.stringify(plan),codeql:'true',frontend_build:'true',ui_required:'false',media_selection:'[]',media_groups:'[]',
 ...Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
const needs={scope:{result:'success',outputs},'assessment-capacity':{result:'success'},codeql:{result:'success'}};
test('all selected checks must actually succeed; draft or arbitrary green metadata is insufficient',()=>{
 assert.deepEqual(requiredChecks(needs,false),['scope','assessment-capacity','codeql']);assert.deepEqual(requiredChecks(needs,true),['scope']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const name of requiredChecks(needs,false))for(const result of ['failure','cancelled','skipped',undefined])assert.ok(failedChecks({...needs,[name]:{...needs[name],result}},false).includes(name));
 for(const change of [{assessment_capacity_plan:'{}'},{frontend_build:'false'},{codeql:'false'},{media_selection:'["media2"]'},{ops:'true'}])assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,...change}}},false).includes('scope'));
 const missing={...plan,required:plan.required.filter(key=>key!=='runtime-scans')};assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,assessment_capacity_plan:JSON.stringify(missing)}}},false).includes('scope'));
});
test('exact candidate preserves old homepage routes and full-platform isolation with real scans',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const route of ['teacher-home','survey-home','backend-security-efficiency','assessment-capacity'])assert.ok(ci.includes("application_route == '"+route+"'"));
 for(const job of ['backend','backend-regression','frontend-build','frontend','browser','docker','accept-media','accept-ui','accept-visual','accept-perf','accept-ops','miniprogram']){
  const block=ci.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]+:\n/)[0];assert.ok(block?.includes("application_route == 'legacy'"),job);
 }
 const candidate=readFileSync(new URL('./assessment-capacity-candidate.py',import.meta.url),'utf8');
 for(const text of ['--exit-code','HIGH,CRITICAL','--no-file-parallelism','capture_tests','require_tests','--target','images.tar.zst','Isolated PostgreSQL readiness timeout'])assert.ok(candidate.includes(text),text);
 const workflow=readFileSync(new URL('../workflows/ci-assessment-capacity.yml',import.meta.url),'utf8');
 for(const text of ["c['recovery']['status']=='success'",'assert.deepEqual(p,assessmentCapacityPlan','assessment-capacity-browser.mjs',"c['runtime'][component]['status']=='success'",'failure()'])assert.ok(workflow.includes(text),text);
});

test('actual merge gate CLI recomputes the frozen plan and rejects a different head',()=>{
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const event=process.env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):null;
 // Scope intentionally fetches only this exact object, without a main ref.
 const base=event?.pull_request?.base?.sha||process.env.CI_BASE_SHA||execFileSync('git',['merge-base','HEAD','origin/main'],{encoding:'utf8'}).trim();
 const actual=assessmentCapacityPlan(changedEntries(base,head),base,head);
 assert.ok(actual,'The current frozen PR must produce a real plan');
 const classified=spawnSync(process.execPath,['.github/scripts/content-scope.mjs'],{encoding:'utf8',env:{...process.env,GITHUB_OUTPUT:'',CI_BASE_SHA:base,CI_EVENT:'pull_request',CI_FORCE_FULL:'false',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version'}});
 assert.equal(classified.status,0,classified.stderr);
 const projection=JSON.parse(classified.stdout);
 assert.equal(projection.application_route,'assessment-capacity');
 assert.equal(projection.frontend_build,true,'The real classifier and merge gate must agree');
 assert.deepEqual(JSON.parse(projection.assessment_capacity_plan),actual);
 const realOutputs=Object.fromEntries(Object.entries(projection).map(([key,value])=>[key,typeof value==='boolean'?String(value):value]));
 const invoke=p=>spawnSync(process.execPath,['.github/scripts/merge-gate.mjs'],{encoding:'utf8',env:{...process.env,IS_DRAFT:'false',NEEDS_JSON:JSON.stringify({...needs,scope:{result:'success',outputs:{...realOutputs,assessment_capacity_plan:JSON.stringify(p)}}})}});
 const valid=invoke(actual);assert.equal(valid.status,0,valid.stderr);
 assert.deepEqual(JSON.parse(valid.stdout),{required:['scope','assessment-capacity','codeql'],failed:[]});
 const stale=invoke({...actual,head:'0'.repeat(40)});assert.equal(stale.status,1,stale.stderr);
 assert.ok(JSON.parse(stale.stdout).failed.includes('recomputed-assessment-capacity-plan'));
});

test('compiler reuse admits only the frozen isolated cognitive test flag correction',()=>{
 const b=JSON.parse(readFileSync(new URL('./assessment-capacity-bindings.json',import.meta.url),'utf8')).compilationReuseTransition;
 const after=readFileSync(new URL('./assessment-capacity-candidate.py',import.meta.url),'utf8');
 assert.equal(isolatedCognitiveEnvironmentOnly(after,b.candidateBefore),true);
 for(const modified of [after+'unknown',after.replace('RUN npx tsc','RUN true'),after.replace("'HIGH,CRITICAL'","'CRITICAL'")])assert.equal(isolatedCognitiveEnvironmentOnly(modified,b.candidateBefore),false);
});
