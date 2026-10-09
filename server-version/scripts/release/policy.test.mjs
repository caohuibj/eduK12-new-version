import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {classify,portalBoundary,loginBoundary,toolingOnly} from './policy.mjs';
const regular=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const css='server-version/frontend/src/training/training-workspace-refresh.css';
const auth='server-version/backend/src/controllers/authController.ts';
const root=new URL('../../',import.meta.url);
const source=fs.readFileSync(new URL('backend/src/controllers/authController.ts',root),'utf8');
test('CSS admits A; no DB or attachment surface implied',()=>{const p=classify([regular(css)],()=>['.x{color:red}', '.x{color:green}']);assert.equal(p.route,'A');assert.deepEqual(p.surfaces,['workspace'])});
test('login entrance is B with auth surface, byte exact surrounding authority',()=>{const changed=source.replace('此账号不是学员账号','请使用学员账号');assert.ok(loginBoundary(source,changed));assert.equal(classify([regular(auth)],()=>[source,changed]).route,'B');assert.ok(!loginBoundary(source,source.replace('current.isActive','true')))});
test('mixed known A+B retains auth and workspace requirements',()=>{const p=classify([regular(css),regular(auth)],e=>e.file===css?['a','b']:[source,source]);assert.equal(p.route,'B');assert.deepEqual(p.surfaces,['auth','workspace'])});
test('unknown, delete, rename sides, executable and symlink escalate C',()=>{for(const changes of [[regular(css),regular('server-version/backend/prisma/schema.prisma')],[{...regular(css),status:'D',newMode:'000000'}],[{...regular(css),newMode:'100755'}],[{...regular(css),newMode:'120000'}],[regular(css),regular(css+'.renamed')]])assert.equal(classify(changes,()=>['','x']).route,'C')});
test('broad frontend prefix cannot admit API or persistent code',()=>{for(const path of ['src/api/auth.ts','src/contexts/AuthContext.tsx','src/pages/NewPage.tsx'])assert.equal(classify([regular('server-version/frontend/'+path)],()=>['','']).route,'C')});
test('public portal local state is admitted, new calls/imports/authority access is not',()=>{const s=fs.readFileSync(new URL('frontend/src/training/TrainingPortal.tsx',root),'utf8');assert.ok(portalBoundary(s,s.replace('让学习，','学习启程，')));for(const unsafe of [s.replace('const authLink = useAuthLinks()','const authLink = fetch("/api")'),s.replace("useAuthLinks()","localStorage.getItem('token')"),s.replace("'/student/login'","'/admin/login'")])assert.ok(!portalBoundary(s,unsafe))});
test('new external CSS fetch is not silently admitted',()=>assert.equal(classify([regular(css)],()=>['','a{background:url(https://external.test)}']).route,'C'));

import {requiredChecks,failedChecks} from '../../../.github/scripts/merge-gate.mjs';
test('selected route is exact success, not a job count; login keeps SAST boundary',()=>{
 const make=route=>({scope:{result:'success',outputs:{application_route:route,release_plan:JSON.stringify({route,changed:['frontend'],required:['compatibility','rollback','readiness',...(route==='B'?['login-contracts','sast']:[])]})}},'scoped-release':{result:'success'},codeql:{result:'success'}});
 const a=make('A');assert.deepEqual(requiredChecks(a,false),['scope','scoped-release']);assert.deepEqual(failedChecks(a,false),[]);
 for(const result of [undefined,'failure','cancelled','skipped','neutral']){const n=make('A');n['scoped-release']={result};assert.ok(failedChecks(n,false).includes('scoped-release'))}
 const b=make('B');assert.ok(requiredChecks(b,false).includes('codeql'));b.codeql.result='skipped';assert.ok(failedChecks(b,false).includes('codeql'));
});

test('tooling-only C never implies application builds or data recovery; mixed files/modes are rejected',()=>{
 const files=[regular('server-version/scripts/release/executor.py'),regular('.github/workflows/ci.yml')];assert.equal(toolingOnly(files),true);
 for(const extra of [regular(css),regular('server-version/backend/prisma/schema.prisma'),regular('server-version/scripts/release/unknown.py'),{...files[0],status:'D',newMode:'000000'},{...files[0],newMode:'100755'}])assert.equal(toolingOnly([...files,extra]),false);
 const needs={scope:{result:'success',outputs:{scenario:'release-tooling'}}};assert.deepEqual(requiredChecks(needs,true),['scope','release-tools']);assert.deepEqual(requiredChecks(needs,false),['scope','release-tools','codeql']);
});
