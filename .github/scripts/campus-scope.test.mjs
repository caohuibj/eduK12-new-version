import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {admitsCampus,campusFiles,campusPlan,admitsLocalCampusOriginGuard} from './campus-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const page=entry('server-version/frontend/src/school/SchoolApp.tsx');
test('only exact campus files and ordinary additions/modifications are admitted',()=>{
 assert.equal(admitsCampus([page]),true);
 for(const file of ['server-version/backend/src/middleware/auth.ts','server-version/backend/prisma/schema.prisma','server-version/frontend/package-lock.json','server-version/frontend/src/training/TrainingPortal.tsx','.github/workflows/ci-backend.yml','unknown'])assert.equal(admitsCampus([page,entry(file)]),false);
 for(const bad of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{newMode:'100755'},{oldMode:'120000'}])assert.equal(admitsCampus([{...page,...bad}]),false);
 assert.equal(admitsCampus([]),false);assert.equal(admitsCampus([entry('.github/scripts/merge-gate.mjs')]),false);
 assert.equal(campusFiles.has('server-version/backend/src/modules/campus/mfa.service.ts'),false);
});
test('campus requires contracts and CodeQL even for drafts, never skipped evidence',()=>{
 const outputs={application_route:'campus',scenario:'campus',codeql:'true',campus_plan:JSON.stringify({schema:1,route:'campus',changed:['frontend','backend'],required:['campus-contracts','candidate-browser','runtime-scans','sast']}),...Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']))};
 const needs={scope:{result:'success',outputs},campus:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,true),['scope','campus','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const job of ['campus','codeql','scope'])for(const result of ['failure','cancelled','skipped',undefined])assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},false).includes(job));
 assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,campus_plan:'{}'}}},false).includes('scope'));
});
test('campus is mutually exclusive with unrelated jobs and gates the actual candidate',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 for(const job of ['backend','backend-regression','frontend-build','frontend','browser','docker','accept-media','accept-ui','accept-perf','accept-ops','miniprogram']){
 const block=workflow.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]+:\n/)[0];assert.ok(block?.includes("application_route == 'legacy'"),job);
 }
 assert.match(workflow,/release-tools, campus\]/);assert.match(workflow,/campus_plan: \$\{\{ steps.scope.outputs.campus_plan/);
 const candidate=readFileSync(new URL('../workflows/ci-campus.yml',import.meta.url),'utf8');
 for(const check of ['campus-candidate.py','campus-browser.mjs','HIGH,CRITICAL','--exit-code 1','failure()'])assert.ok(candidate.includes(check),check);
});

const authPath='server-version/backend/src/routes/auth.ts';
const originTest='server-version/backend/src/__tests__/campus/local-auth-origin.test.ts';
const originalGuard="  if(host==='school.eduk12.top'||origin==='https://school.eduk12.top') {";
const expandedGuard=String.raw`  const localSchool=process.env.NODE_ENV!=='production'
    && (host==='school.localhost'||/^https?:\/\/school\.localhost(?::[0-9]+)?$/.test(origin))
  if(host==='school.eduk12.top'||origin==='https://school.eduk12.top'||localSchool) {`;
test('only the exact non-production guard can enter the campus authentication lane',()=>{
 const before='unchanged imports\n'+originalGuard+'\nunchanged authentication handlers';
 const after=before.replace(originalGuard,expandedGuard);
 assert.equal(admitsLocalCampusOriginGuard(before,after),true);
 for(const bad of [after+'\nextra authentication change',after.replace("!=='production'","==='production'"),after.replace('unchanged authentication handlers','changed session authority'),after.replace('school\\.localhost','.*'),after.replace("https://school.eduk12.top","https://other.invalid")])assert.equal(admitsLocalCampusOriginGuard(before,bad),false);
 assert.equal(admitsLocalCampusOriginGuard(before+originalGuard,after),false);
});
test('the source-bound plan requires the guard contract and rejects other auth edits',()=>{
 const cwd=process.cwd(),folder=mkdtempSync(join(tmpdir(),'campus-auth-scope-'));
 const git=(...args)=>execFileSync('git',args,{cwd:folder,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(file,text)=>{mkdirSync(dirname(join(folder,file)),{recursive:true});writeFileSync(join(folder,file),text)};
 const commit=()=>{git('add','.');git('-c','user.name=CI fixture','-c','user.email=ci@fixture.invalid','commit','-qm','fixture');return git('rev-parse','HEAD')};
 try{
  git('init','-q');const before='unchanged imports\n'+originalGuard+'\nunchanged authentication handlers';
  put(page.file,'before');put(authPath,before);const base=commit();
  put(page.file,'after');put(authPath,before.replace(originalGuard,expandedGuard));put(originTest,'contract');const head=commit();
  const entries=[page,entry(authPath),{...entry(originTest),status:'A',oldMode:'000000'}];
  process.chdir(folder);assert.deepEqual(campusPlan(entries,base,head)?.changed,['frontend','backend']);
  assert.equal(campusPlan(entries.filter(e=>e.file!==originTest),base,head),null);
  put(authPath,before.replace(originalGuard,expandedGuard)+'\nchanged session logic');const badHead=commit();
  assert.equal(campusPlan(entries,base,badHead),null);
 }finally{process.chdir(cwd);rmSync(folder,{recursive:true,force:true})}
});
