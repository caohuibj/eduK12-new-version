import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {classify,portalBoundary,loginBoundary,toolingOnly,imageBuildOnly} from './policy.mjs';
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
test('public portal local state is admitted, new calls/imports/authority access is not',()=>{
 // Fixed classifier input: live homepage copy/navigation must not turn a negative mutation into a no-op.
 const s="import {useAuthLinks} from './links'; export default function Portal(){const authLink = useAuthLinks(); return <a href='/student/login'>让学习，</a>}";
 assert.ok(portalBoundary(s,s.replace('让学习，','学习启程，')));
 for(const unsafe of [s.replace('const authLink = useAuthLinks()','const authLink = fetch(\"/api\")'),s.replace("useAuthLinks()","localStorage.getItem('token')"),s.replace("'/student/login'","'/admin/login'")]){
  assert.notEqual(unsafe,s,'negative fixture mutation must be real');assert.ok(!portalBoundary(s,unsafe));
 }
});
test('new external CSS fetch is not silently admitted',()=>assert.equal(classify([regular(css)],()=>['','a{background:url(https://external.test)}']).route,'C'));

import {requiredChecks,failedChecks} from '../../../.github/scripts/merge-gate.mjs';
test('selected route is exact success, not a job count; login keeps SAST boundary',()=>{
 const make=route=>({scope:{result:'success',outputs:{application_route:route,release_plan:JSON.stringify({route,changed:['frontend'],required:['compatibility','rollback','readiness',...(route==='B'?['login-contracts','sast']:[])]})}},'scoped-release':{result:'success'},codeql:{result:'success'}});
 const a=make('A');assert.deepEqual(requiredChecks(a,false),['scope','scoped-release']);assert.deepEqual(failedChecks(a,false),[]);
 for(const result of [undefined,'failure','cancelled','skipped','neutral']){const n=make('A');n['scoped-release']={result};assert.ok(failedChecks(n,false).includes('scoped-release'))}
 const b=make('B');assert.ok(requiredChecks(b,false).includes('codeql'));b.codeql.result='skipped';assert.ok(failedChecks(b,false).includes('codeql'));
});

test('tooling-only C never implies application builds or data recovery; mixed files/modes are rejected',()=>{
 const files=['server-version/scripts/release/executor.py','.github/workflows/ci.yml','.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-controls.test.mjs','.github/scripts/dependency-scope.mjs','.github/scripts/dependency-routing.test.mjs','docs/development/ci-gate-cleanup-20261031.md'].map(regular);assert.equal(toolingOnly(files),true);
 for(const extra of [regular(css),regular('server-version/backend/prisma/schema.prisma'),regular('server-version/scripts/release/unknown.py'),regular('.github/scripts/onboarding-bindings.json'),regular('.github/scripts/onboarding-new-check.mjs'),{...files[0],status:'D',newMode:'000000'},{...files[0],newMode:'100755'},{...files[0],newMode:'120000'}])assert.equal(toolingOnly([...files,extra]),false);
 const needs={scope:{result:'success',outputs:{scenario:'release-tooling'}}};assert.deepEqual(requiredChecks(needs,true),['scope','release-tools']);assert.deepEqual(requiredChecks(needs,false),['scope','release-tools','codeql']);
});
test('registered development tools retain changed backend tests without admitting runtime source',()=>{
 const cli='server-version/backend/src/scripts/cognitive-onboarding-check.ts';
 const files=[cli,'server-version/backend/src/__tests__/cognitive/assignment-api.test.ts','server-version/backend/src/__tests__/cognitive/product-eligibility.test.ts','docs/evidence/cli/checks.json.gz'].map(regular);
 assert.equal(toolingOnly(files),true);
 assert.equal(toolingOnly(files.slice(1)),false,'tests alone do not claim a registered tool consumer');
 for(const file of ['server-version/backend/src/modules/cognitive/service.ts','server-version/backend/prisma/schema.prisma','docs/evidence/cli/run.ts','server-version/backend/src/__tests__/../runtime.test.ts'])assert.equal(toolingOnly([...files,regular(file)]),false,file);
 for(const newMode of ['120000','100755','000000'])assert.equal(toolingOnly([...files,{...regular(cli),newMode}]),false);
});
test('image tooling preserves the existing executable script without admitting chmod or new executables',()=>{
 const script={...regular('.github/scripts/build-ci-images.sh'),oldMode:'100755',newMode:'100755'};
 const files=[script,...['.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci-images.yml'].map(regular)];
 assert.equal(toolingOnly(files),true);
 for(const extra of [{...script,newMode:'100644'},{...script,status:'A',oldMode:'000000'},{...script,newMode:'120000'},{...script,file:'.github/scripts/unknown-images.sh'}])assert.equal(toolingOnly([...files,extra]),false);
});
test('image build tooling requires the complete bounded diff and unchanged regular modes',()=>{
 const inputs=['.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci-images.yml','server-version/frontend/Dockerfile','server-version/backend/Dockerfile'].map(regular);
 const script={...regular('.github/scripts/build-ci-images.sh'),oldMode:'100755',newMode:'100755'};
 for(const input of [...inputs,script])assert.equal(imageBuildOnly([input]),true,input.file);
 const controls=['AGENTS.md','docs/release/README.md','.github/workflows/ci.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/scripts/local-validation.mjs','server-version/scripts/release/policy.mjs'].map(regular);
 assert.equal(imageBuildOnly([...inputs,script,...controls]),true);
 assert.equal(toolingOnly([...inputs,script,...controls]),true);
 assert.equal(imageBuildOnly(controls),false);
 for(const file of ['server-version/frontend/src/main.tsx','server-version/backend/src/modules/campus/service.ts','server-version/backend/package-lock.json','.github/release-tools/package-lock.json','server-version/backend/prisma/schema.prisma','server-version/backend/prisma/migrations/example/migration.sql','server-version/scripts/release/executor.py','server-version/docker-compose.yml','server-version/ops/nginx/nginx.production.conf','server-version/backend/src/__tests__/cognitive/product.test.ts','.github/scripts/unknown-images.mjs']){
  assert.equal(imageBuildOnly([...inputs,regular(file)]),false,file);
  assert.equal(toolingOnly([...inputs,regular(file)]),false,file);
 }
 for(const change of [{status:'A',oldMode:'000000'},{status:'D',newMode:'000000'},{newMode:'100755'},{newMode:'120000'},{oldMode:'120000'}]){
  const changed={...inputs[0],...change};assert.equal(imageBuildOnly([changed]),false);assert.equal(toolingOnly([changed]),false);
 }
});


test('exact ingress bundle uses tools gate; unknown vhosts, app files, deletions and modes still escalate',()=>{
 const known=['server-version/ops/nginx/nginx.production.conf','server-version/ops/nginx/eduk12-products.conf','server-version/ops/nginx/eduk12-school.conf','server-version/ops/nginx/renew-school.sh','server-version/scripts/release/ingress.py','server-version/scripts/release/test_ingress.py'].map(regular);
 assert.equal(toolingOnly(known),true);
 for(const extra of [regular('server-version/ops/nginx/unknown.conf'),regular('server-version/frontend/src/main.tsx'),{...known[0],newMode:'120000'},{...known[0],status:'D',newMode:'000000'}])assert.equal(toolingOnly([...known,extra]),false);
});

 test('native CodeQL configuration uses existing tooling route, not application acceptance',()=>{
 const files=['.github/workflows/ci.yml','.github/scripts/school-teacher-native.mjs','.github/scripts/school-teacher-native.test.mjs','docs/performance/codeql-analysis-20261030.md','server-version/scripts/release/policy.mjs','server-version/scripts/release/policy.test.mjs'].map(regular);
 assert.equal(toolingOnly(files),true);
 assert.equal(toolingOnly([...files,regular(auth)]),false);
 const needs={scope:{result:'success',outputs:{scenario:'release-tooling'}},'release-tools':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','release-tools','codeql']);
 });

test('deployment entry exact files use existing release tooling for add and normal update',()=>{
 const entry={file:'server-version/scripts/release/update.sh',status:'A',oldMode:'000000',newMode:'100755'};
 const docs={...regular('docs/release/operations.md'),status:'A',oldMode:'000000'};
 const files=[entry,docs,regular('docs/release/README.md')];
 assert.equal(toolingOnly(files),true);
 assert.equal(toolingOnly(files.map(e=>e===entry?{...e,status:'M',oldMode:'100755'}:e)),true);
});
test('deployment entry mixed runtime schema unknown scripts and abnormal modes stay outside tooling',()=>{
 const entry={file:'server-version/scripts/release/update.sh',status:'A',oldMode:'000000',newMode:'100755'};
 const files=[entry,{...regular('docs/release/operations.md'),status:'A',oldMode:'000000'},regular('docs/release/README.md')];
 for(const file of ['server-version/backend/src/modules/campus/service.ts','server-version/backend/prisma/schema.prisma','server-version/scripts/release/unknown.sh']){
  const mixed=[...files,regular(file)];assert.equal(toolingOnly(mixed),false,file);assert.equal(classify(mixed,()=>['','x']).route,'C',file);
 }
 for(const change of [{newMode:'100644'},{newMode:'120000'},{status:'D',newMode:'000000'},{status:'M',oldMode:'100644'}])
  assert.equal(toolingOnly([{...entry,...change},...files.slice(1)]),false,JSON.stringify(change));
});
