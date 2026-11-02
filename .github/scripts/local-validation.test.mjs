import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seal,authenticate,admit,binding,recipe,toolingBackendTests,fromEnvironment} from './local-validation.mjs';
import {classifyChanges} from './content-scope.mjs';
import {classify} from '../../server-version/scripts/release/policy.mjs';
import {requiredChecks} from './merge-gate.mjs';
const script=fileURLToPath(new URL('local-validation.mjs',import.meta.url));
const keys=crypto.generateKeyPairSync('ed25519');
const pub=keys.publicKey.export({type:'spki',format:'pem'});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(fn,file='.github/scripts/contract.mjs') {
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hui-local-proof-'));
 try {
  process.chdir(dir);git('init');git('config','user.name','Local validation fixture');git('config','user.email','fixture@example.invalid');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export const v=1;\n');fs.writeFileSync('AGENTS.md','rules\n');
  git('add','.');git('commit','-m','isolated base');const base=git('rev-parse','HEAD');
  fs.writeFileSync(file,'export const v=2;\n');git('add','.');git('commit','-m','isolated candidate');const head=git('rev-parse','HEAD');
  const record={check:'release-tools',status:'success',binding:binding('release-tools',base,head),logSha256:'a'.repeat(64),commands:recipe('release-tools',base,head).map(argv=>({argv,exitCode:0,seconds:0.01}))};
  const payload={schema:1,repository:'caohuibj/eduK12-new-version',base,head,branch:git('branch','--show-current'),checks:[record]};
  fn({base,head,payload,record});
 } finally {process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true})}
}
test('valid signed local success is admitted, not re-executed',()=>fixture(({base,head,payload})=>{
 const envelope=seal(payload,keys.privateKey);assert.equal(admit(envelope,pub,base,head).checks.length,1);
 const r=spawnSync(process.execPath,[script,'ci','release-tools'],{encoding:'utf8',env:{...process.env,CI_BASE_SHA:base,HUI_LOCAL_VALIDATION_PUBLIC_KEY:pub,HUI_LOCAL_VALIDATION_EVIDENCE:JSON.stringify(envelope)}});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/REUSED local check/);
 // Fixture has none of the real test scripts: success proves no test command ran.
}));
test('missing key, tampering, failure, missing command and wrong identity are rejected',()=>fixture(({base,head,payload})=>{
 const signed=seal(payload,keys.privateKey);assert.throws(()=>authenticate(signed,''));
 const tampered=structuredClone(signed);tampered.payload.head='0'.repeat(40);assert.throws(()=>authenticate(tampered,pub));
 for(const change of [p=>p.checks[0].status='failure',p=>p.checks[0].commands[0].exitCode=1,p=>p.checks[0].commands.pop(),p=>p.repository='other/repo']) {
  const p=structuredClone(payload);change(p);assert.throws(()=>admit(seal(p,keys.privateKey),pub,base,head));
 }
}));
test('consumed code or configuration change fails without automatic retest',()=>fixture(({base,head,payload})=>{
 const signed=seal(payload,keys.privateKey);
 fs.writeFileSync('.github/scripts/contract.mjs','export const v=3;\n');git('add','.');git('commit','-m','changed consumed input');const next=git('rev-parse','HEAD');
 assert.throws(()=>admit(signed,pub,base,next),/inputs changed/);
 const r=spawnSync(process.execPath,[script,'ci','release-tools'],{encoding:'utf8',env:{...process.env,CI_BASE_SHA:base,HUI_LOCAL_VALIDATION_PUBLIC_KEY:pub,HUI_LOCAL_VALIDATION_EVIDENCE:JSON.stringify(signed)}});
 assert.notEqual(r.status,0);assert.match(r.stderr,/inputs changed/);assert.doesNotMatch(r.stdout,/TAP version/);
}));
test('unrelated documentation does not invalidate tooling evidence',()=>fixture(({base,payload})=>{
 const signed=seal(payload,keys.privateKey);fs.writeFileSync('AGENTS.md','reworded guidance\n');git('add','.');git('commit','-m','docs only');
 assert.equal(admit(signed,pub,base,git('rev-parse','HEAD')).checks[0].check,'release-tools');
}));

test('an old merged receipt does not claim a new branch merely through ancestry',()=>fixture(({base,head,payload})=>{
 git('checkout','-b','new-maintenance');fs.writeFileSync('.github/scripts/contract.mjs','export const v=3;\n');git('add','.');git('commit','-m','new tooling inputs');
 const next=git('rev-parse','HEAD');assert.equal(spawnSync('git',['merge-base','--is-ancestor',head,next]).status,0);
 const saved={...process.env};
 try {
  process.env.HUI_LOCAL_VALIDATION_PUBLIC_KEY=pub;process.env.HUI_LOCAL_VALIDATION_EVIDENCE=JSON.stringify(seal(payload,keys.privateKey));process.env.HUI_EVIDENCE_BRANCH='new-maintenance';
  assert.deepEqual(fromEnvironment(base,next),{checks:[]});
  process.env.HUI_LOCAL_VALIDATION_EVIDENCE=JSON.stringify({...seal(payload,keys.privateKey),signature:'tampered'});
  assert.throws(()=>fromEnvironment(base,next),/Untrusted\/tampered/);
 } finally {process.env=saved}
}));

test('exact head and nonancestor equivalent tree remain reusable across branches',()=>fixture(({base,head,payload})=>{
 const saved={...process.env};
 try {
  process.env.HUI_LOCAL_VALIDATION_PUBLIC_KEY=pub;process.env.HUI_LOCAL_VALIDATION_EVIDENCE=JSON.stringify(seal(payload,keys.privateKey));process.env.HUI_EVIDENCE_BRANCH='different-branch';
  assert.equal(fromEnvironment(base,head).checks.length,1);
  const equivalent=git('commit-tree',git('rev-parse',head+'^{tree}'),'-p',base,'-m','independent equivalent tree');
  assert.notEqual(spawnSync('git',['merge-base','--is-ancestor',head,equivalent]).status,0);
  assert.equal(fromEnvironment(base,equivalent).checks.length,1);
 } finally {process.env=saved}
}));
const regular=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
test('image selection and Dockerfile-only changes use the existing tools recipe without Docker execution',()=>{
 for(const file of ['.github/scripts/ci-image-plan.mjs','server-version/frontend/Dockerfile','server-version/backend/Dockerfile'])fixture(({base,head,payload})=>{
  const commands=recipe('release-tools',base,head);
  assert(commands.some(argv=>argv.includes('.github/scripts/ci-image-plan.test.mjs')),file);
  assert(commands.every(argv=>argv[0]==='node'&&argv.includes('--test')));
  const signed=seal(payload,keys.privateKey);
  fs.mkdirSync('server-version/frontend',{recursive:true});fs.writeFileSync('server-version/frontend/Dockerfile','FROM changed-input\n');git('add','.');git('commit','-m','changed frontend build input');
  assert.throws(()=>admit(signed,pub,base,git('rev-parse','HEAD')),/inputs changed/);
 },file);
});
test('dependency routing controls use their existing bounded tools contract',()=>fixture(({base,head})=>{
 const commands=recipe('release-tools',base,head);
 assert(commands.some(argv=>argv.includes('.github/scripts/dependency-routing.test.mjs')));
 assert(commands.every(argv=>argv[0]==='node'&&argv.includes('--test')));
},'.github/scripts/dependency-scope.mjs'));
test('development CLI recipe selects API catalog and subprocess consumers plus compiler without app builds',()=>{
 const cli='server-version/backend/src/scripts/cognitive-onboarding-check.ts';
 const tests=['assignment-api','onboarding-cli','product-eligibility'].map(name=>'server-version/backend/src/__tests__/cognitive/'+name+'.test.ts');
 assert.deepEqual(toolingBackendTests([cli,...tests]),tests.map(file=>file.slice('server-version/backend/'.length)));
 fixture(({base,head})=>{
  const commands=recipe('release-tools',base,head);
  assert(commands.some(argv=>argv.includes('src/__tests__/cognitive/onboarding-cli.test.ts')));
  assert(commands.some(argv=>argv.includes('server-version/backend/tsconfig.json')&&argv.includes('--noEmit')));
  assert(!commands.flat().some(arg=>/playwright|docker|migrate|^build$/.test(arg)));
 },cli);
});
test('onboarding tooling changes select affected controls without application commands',()=>{
 for(const file of ['.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-controls.test.mjs'])fixture(({base,head})=>{
  const commands=recipe('release-tools',base,head),selected=commands.find(argv=>argv.includes('.github/scripts/onboarding-controls.test.mjs'));
  assert(selected,'Changed onboarding controls must be checked by the existing tools recipe');
  const pattern=new RegExp(selected.find(arg=>arg.startsWith('--test-name-pattern=')).slice('--test-name-pattern='.length));
  for(const name of ['onboarding accepts unchanged main controls','onboarding still rejects changed control bytes','onboarding needs before snapshots','onboarding scope binds exact source','stable gate still requires admission','Task1 scope refuses incomplete inventories'])assert(pattern.test(name),name);
  assert(!pattern.test('Task1 exact candidate remains disabled'));
  assert(commands.every(argv=>argv[0]==='node'&&argv.includes('--test')));
  assert(!commands.flat().some(arg=>/vitest|playwright|prisma|(?:^|\/)tsc$/.test(arg)));
 },file);
});
test('guidance docs select documentation only; no backend or recovery jobs',()=>{
 const s=classifyChanges(['AGENTS.md','docs/release/README.md','.github/PULL_REQUEST_TEMPLATE.md'].map(regular));
 assert.equal(s.documentation,true);
 const needs={scope:{outputs:{documentation:'true',scenario:'documentation'}}};assert.deepEqual(requiredChecks(needs,false),['scope','documentation']);
});
test('known UI CSS never selects backend, DB, lifecycle or attachment recovery',()=>{
 const entry=regular('server-version/frontend/src/training/training-home-brand.css');
 assert.equal(classify([entry],()=>['a{color:red}','a{color:green}']).route,'A');
 const needs={scope:{outputs:{application_route:'A',release_plan:JSON.stringify({required:[]})}}};
 assert.deepEqual(requiredChecks(needs,false),['scope','scoped-release']);
});
test('mixed/unknown metadata cannot enter the documentation shortcut; login retains authority gate',()=>{
 assert.equal(classifyChanges([regular('AGENTS.md'),regular('server-version/backend/prisma/schema.prisma')]).documentation,false);
 assert.equal(classifyChanges([{...regular('AGENTS.md'),newMode:'120000'}]).documentation,false);
 const b={scope:{outputs:{application_route:'B',release_plan:JSON.stringify({required:['login-contracts','sast']})}}};
 assert.deepEqual(requiredChecks(b,false),['scope','scoped-release','codeql']);
});

test('SJT CLI tooling uses the bounded Git regression without full content or app checks',()=>{
 for(const file of ['server-version/backend/src/scripts/situational-onboarding-check.ts','.github/scripts/sjt-onboarding-git-buffer.test.mjs','.github/workflows/situational-publication.yml'])fixture(({base,head})=>{
  const commands=recipe('release-tools',base,head);
  assert(commands.some(argv=>argv.includes('.github/scripts/sjt-onboarding-git-buffer.test.mjs')));
  assert(commands.every(argv=>argv[0]==='node'&&argv.includes('--test')));
  assert(!commands.flat().some(arg=>/vitest|playwright|prisma|tsc|situational:contracts|onboarding-check\.ts|^build$/.test(arg)));
 },file);
});
