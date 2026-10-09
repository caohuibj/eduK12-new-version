import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seal,authenticate,admit,binding,recipe} from './local-validation.mjs';
import {classifyChanges} from './content-scope.mjs';
import {classify} from '../../server-version/scripts/release/policy.mjs';
import {requiredChecks} from './merge-gate.mjs';
const script=fileURLToPath(new URL('local-validation.mjs',import.meta.url));
const keys=crypto.generateKeyPairSync('ed25519');
const pub=keys.publicKey.export({type:'spki',format:'pem'});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(fn) {
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hui-local-proof-'));
 try {
  process.chdir(dir);git('init');git('config','user.name','Local validation fixture');git('config','user.email','fixture@example.invalid');
  fs.mkdirSync('.github/scripts',{recursive:true});fs.writeFileSync('.github/scripts/contract.mjs','export const v=1;\n');fs.writeFileSync('AGENTS.md','rules\n');
  git('add','.');git('commit','-m','isolated base');const base=git('rev-parse','HEAD');
  fs.writeFileSync('.github/scripts/contract.mjs','export const v=2;\n');git('add','.');git('commit','-m','isolated candidate');const head=git('rev-parse','HEAD');
  const record={check:'release-tools',status:'success',binding:binding('release-tools',base,head),logSha256:'a'.repeat(64),commands:recipe('release-tools',base,head).map(argv=>({argv,exitCode:0,seconds:0.01}))};
  const payload={schema:1,repository:'caohuibj/eduK12-new-version',base,head,checks:[record]};
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
const regular=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
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
