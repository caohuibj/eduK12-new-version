import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedTeacherFiles,teacherHomePlan,teacherRequired,expertMountBoundary} from './teacher-home-scope.mjs';
import {failedChecks,requiredChecks} from './merge-gate.mjs';
const base='a'.repeat(40),head='b'.repeat(40),tree='c'.repeat(40);
const mount="app.use('/api/huiteacher',huiteacherExpertRegistrationRoutes)\n";
const anchor="app.use('/api/huiteacher',huiteacherStaffInviteRoutes)\n";
const before=anchor+"app.use('/api/huiteacher',huiteacherObserverRoutes)\n"+mount;
const after=anchor+mount+"app.use('/api/huiteacher',huiteacherObserverRoutes)\n";
const entries=Object.entries(reviewedTeacherFiles).map(([file,s])=>({file,status:s.before?'M':'A',oldMode:s.before?'100644':'000000',newMode:'100644'}));
const read=(command,ref)=>{
 const [sha,file]=ref.split(':');
 if(command==='show')return sha===head?after:before;
 const s=reviewedTeacherFiles[file];return s?(sha===head?s.after:s.before):tree;
};
const plan=()=>teacherHomePlan(entries,base,head,read);
function needs(){
 const outputs={application_route:'teacher-home',scenario:'teacher-home',codeql:'true',teacher_home_plan:JSON.stringify(plan())};
 for(const key of ['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'])outputs[key]='false';
 return {scope:{result:'success',outputs},'teacher-home':{result:'success'},codeql:{result:'success'}};
}
test('only the full reviewed 10-file Teacher patch admits the candidate',()=>{
 const p=plan();assert.equal(Object.keys(reviewedTeacherFiles).length,10);
 assert.equal(p.route,'teacher-home');assert.deepEqual(p.changed,['frontend','backend']);assert.deepEqual(p.required,[...teacherRequired]);
});
test('unknown files, dependencies, other backend handlers and CI-only diffs are refused',()=>{
 for(const file of ['server-version/backend/src/routes/auth.ts','server-version/backend/prisma/schema.prisma','server-version/frontend/package-lock.json','server-version/frontend/src/main.tsx','server-version/frontend/src/huiteacher/Unknown.tsx','AGENTS.md'])
  assert.equal(teacherHomePlan([...entries,{file,status:'M',oldMode:'100644',newMode:'100644'}],base,head,read),null,file);
 assert.equal(teacherHomePlan([{file:'.github/workflows/ci.yml',status:'M',oldMode:'100644',newMode:'100644'}],base,head,read),null);
});
test('deletions, executable/symlink/type changes and unreviewed blobs fail closed',()=>{
 for(const meta of [{status:'D',newMode:'000000'},{newMode:'100755'},{newMode:'120000'},{status:'T'}])
  assert.equal(teacherHomePlan([{...entries[0],...meta},...entries.slice(1)],base,head,read),null);
 assert.equal(teacherHomePlan(entries,base,head,(cmd,ref)=>cmd==='rev-parse'&&ref.includes('HuiteacherApp.tsx')?'d'.repeat(40):read(cmd,ref)),null);
 assert.equal(teacherHomePlan(entries.slice(1),base,head,read),null);
 assert.equal(teacherHomePlan(entries,'HEAD',head,read),null);
});
test('expert registration only moves exactly one mount and preserves every other byte',()=>{
 assert.ok(expertMountBoundary(before,after));
 for(const modified of [after+'\n',after.replace('Observer','Unknown'),after+mount])assert.equal(expertMountBoundary(before,modified),false);
 assert.equal(expertMountBoundary(before+mount,after),false);
 assert.equal(teacherHomePlan(entries,base,head,(cmd,ref)=>cmd==='show'&&ref.startsWith(head)?after+'\n':read(cmd,ref)),null);
});
test('aggregate requires classification, real candidate and SAST success; all incomplete statuses block',()=>{
 const n=needs();assert.deepEqual(requiredChecks(n,false),['scope','teacher-home','codeql']);assert.deepEqual(failedChecks(n,false),[]);
 for(const key of ['scope','teacher-home','codeql'])for(const result of ['failure','cancelled','skipped',undefined]){
  const bad=structuredClone(n);bad[key].result=result;assert.ok(failedChecks(bad,false).includes(key));
 }
 assert.ok(failedChecks(n,true).includes('scope'));
});
test('malformed plans and unexpected platform acceptance cannot authorize merge',()=>{
 for(const update of [{route:'campus'},{changed:['frontend']},{required:['teacher-browser']},{head:'HEAD'},{components:{}},{changes:[]}]){
  const n=needs();n.scope.outputs.teacher_home_plan=JSON.stringify({...plan(),...update});assert.ok(failedChecks(n,false).includes('scope'));
 }
 const n=needs();n.scope.outputs.media2='true';assert.ok(failedChecks(n,false).includes('scope'));
});
test('workflow preserves same-head recomputation, runtime scans, existing auth contracts and real API checks',()=>{
 const source=p=>readFileSync(new URL(p,import.meta.url),'utf8'),ci=source('../workflows/ci.yml'),workflow=source('../workflows/ci-teacher-home.yml');
 assert.match(ci,/teacher-home:[\s\S]*?draft == false/);assert.match(ci,/needs: \[scope,.*teacher-home/);
 assert.match(source('./merge-gate.mjs'),/recomputed-teacher-home-plan/);
 assert.match(workflow,/p.head,head/);assert.match(workflow,/teacherHomePlan\(changedEntries/);
 assert.match(workflow,/--severity HIGH,CRITICAL/);
 const candidate=source('./teacher-home-candidate.py');
 for(const file of ['login-admission','authLibrary','auth.test','csrf.test','loginRateLimit','authCookies'])assert.ok(candidate.includes(file));
 const browser=source('./teacher-home-browser.mjs');assert.match(browser,/real-guest-expert-registration/);assert.doesNotMatch(browser,/\/api\/\*\*.*route\.fulfill/);
});
