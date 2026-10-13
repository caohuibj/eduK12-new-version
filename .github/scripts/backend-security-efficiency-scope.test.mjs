import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsBackendSecurityEfficiency,backendSecurityEfficiencyTests} from './backend-security-efficiency-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const root='server-version/backend/src/';
const entry=(file,status='M')=>({file,status,oldMode:status==='A'?'000000':'100644',newMode:'100644'});
const first=root+'controllers/authController.ts',second=root+'services/assetStorage.ts';
const approved={schema:1,files:{[first]:{before:'1'.repeat(40),after:'2'.repeat(40)},[second]:{before:null,after:'3'.repeat(40)}}};
const entries=[entry(first),entry(second,'A'),entry('.github/scripts/merge-gate.mjs')];
const read=(ref,file)=>approved.files[file][ref==='base'?'before':'after'];
test('only the complete frozen production patch and exact ordinary files are admitted',()=>{
 assert.equal(admitsBackendSecurityEfficiency(entries,read,approved),true);
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/Dockerfile','server-version/docker-compose.yml','server-version/frontend/src/training/TrainingPortal.tsx',root+'controllers/userController.ts','.github/workflows/ci-backend.yml','unknown']){
  assert.equal(admitsBackendSecurityEfficiency([...entries,entry(file)],read,approved),false,file);
 }
 assert.equal(admitsBackendSecurityEfficiency(entries.slice(1),read,approved),false);
 assert.equal(admitsBackendSecurityEfficiency([],read,approved),false);
 assert.equal(admitsBackendSecurityEfficiency(entries,read,{schema:1,files:{}}),false);
 for(const change of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{oldMode:'120000'},{newMode:'100755'}])
  assert.equal(admitsBackendSecurityEfficiency([{...entries[0],...change},...entries.slice(1)],read,approved),false);
});
test('before and after source bytes are immutable and new helpers cannot mask existing files',()=>{
 for(const ref of ['base','head'])
  assert.equal(admitsBackendSecurityEfficiency(entries,(r,f)=>r===ref&&f===first?'4'.repeat(40):read(r,f),approved),false);
 assert.equal(admitsBackendSecurityEfficiency([entries[0],entry(second),entries[2]],read,approved),false);
 assert.equal(admitsBackendSecurityEfficiency(entries,read,{...approved,schema:2}),false);
});
const plan={schema:1,route:'backend-security-efficiency',base:'a'.repeat(40),head:'b'.repeat(40),changed:['backend'],
 tests:backendSecurityEfficiencyTests,required:['frozen-boundary','backend-compile','focused-security-efficiency-contracts','runtime-scan','sast']};
const outputs={application_route:plan.route,scenario:plan.route,backend_security_efficiency_plan:JSON.stringify(plan),codeql:'true',
 frontend_build:'false',ui_required:'false',media_selection:'[]',media_groups:'[]',
 ...Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
const needs={scope:{result:'success',outputs},'backend-security-efficiency':{result:'success'},codeql:{result:'success'}};
test('ready merge requires actual scope, candidate and CodeQL success; draft does not qualify',()=>{
 assert.deepEqual(requiredChecks(needs,false),['scope','backend-security-efficiency','codeql']);
 assert.deepEqual(requiredChecks(needs,true),['scope']);
 assert.deepEqual(failedChecks(needs,false),[]);
 for(const job of requiredChecks(needs,false))for(const result of ['failure','cancelled','skipped',undefined])
  assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},false).includes(job));
 for(const changed of [{backend_security_efficiency_plan:'{}'},{scenario:'platform'},{codeql:'false'},{frontend_build:'true'},{media_selection:'["media2"]'},{ops:'true'}])
  assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,...changed}}},false).includes('scope'));
});
test('unknown legacy platform changes retain all existing required gates',()=>{
 const scope={application_route:'legacy',scenario:'platform',codeql:'true',frontend_build:'true',content:'false',frontend:'false',presentation:'false',documentation:'false',maintenance:'false',
 ...Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'true']))};
 const required=requiredChecks({scope:{outputs:scope}},false);
 for(const job of ['maintenance','miniprogram','backend','backend-regression','frontend','frontend-build','browser','docker','codeql','accept-media','accept-ui','accept-perf','accept-ops'])
  assert.ok(required.includes(job),job);
});
test('backend candidate is mutually exclusive with unchanged components and full platform consumers',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const job of ['pr-light-backend','pr-light-frontend','post-merge-smoke','backend','backend-regression','frontend-build','frontend','browser','docker','accept-media','accept-ui','accept-visual','accept-perf','accept-ops','miniprogram']){
  const block=workflow.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]+:\n/)[0];
  assert.ok(block?.includes("application_route == 'legacy'"),job);
 }
 assert.match(workflow,/backend-security-efficiency, release-tools, campus, teacher-home, survey-home\]/);
 for(const route of ['teacher-home','survey-home']){
  assert.ok(workflow.includes("application_route == '"+route+"'"));
  assert.ok(workflow.includes(route+'.test.mjs'));
 }
 assert.ok(workflow.includes("needs.scope.outputs.application_route == 'backend-security-efficiency'"));
 assert.ok(workflow.includes('backend-security-efficiency-scope.test.mjs'));
});
test('candidate reuses the existing single-stage compiler and fail-closed runtime scan',()=>{
 const workflow=readFileSync(new URL('../workflows/ci-backend-security-efficiency.yml',import.meta.url),'utf8');
 for(const text of ['campus-candidate.py','assert.deepEqual(p,backendSecurityEfficiencyPlan','HIGH,CRITICAL','--exit-code 1','failure()','BACKEND_SECURITY_EFFICIENCY_CANDIDATE'])
  assert.ok(workflow.includes(text),text);
 for(const text of ['playwright','frontend','db:seed','full_acceptance'])assert.ok(!workflow.includes(text),text);
 const candidate=readFileSync(new URL('./campus-candidate.py',import.meta.url),'utf8');
 assert.match(candidate,/if component=='backend' and line=='RUN npm run build':line='RUN npx tsc'/);
 assert.match(candidate,/if backend_repair: backend_tests=p\['tests'\]/);
 assert.ok(candidate.includes('--no-file-parallelism'));
 assert.ok(candidate.includes('assert-release-test-report.mjs'));
 assert.ok(candidate.includes("results['images'][component]=output"));
});
