import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seal,admit,binding,recipe,adapterOnly} from './local-validation.mjs';
import {toolingOnly} from '../../server-version/scripts/release/policy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const script=path.join(root,'.github/scripts/local-validation.mjs');
const pair=crypto.generateKeyPairSync('ed25519'),pub=pair.publicKey.export({type:'spki',format:'pem'});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(fn) {
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hui-adapter-'));
 try {
  process.chdir(dir);git('init','-b','ci/fixture');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.mkdirSync('.github/workflows',{recursive:true});fs.mkdirSync('server-version/scripts/release',{recursive:true});
  fs.writeFileSync('AGENTS.md','a\n');fs.writeFileSync('server-version/scripts/release/policy.mjs','export const authority=1;\n');
  fs.writeFileSync('.github/workflows/ci-release-tools.yml','name: old\n');git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
  fs.writeFileSync('.github/workflows/ci-release-tools.yml','name: new\n');git('add','.');git('commit','-m','candidate');const head=git('rev-parse','HEAD');
  fn({base,head});
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true})}
}
function proof(check,base,head) {
 return seal({schema:1,repository:'caohuibj/eduK12-new-version',branch:'ci/fixture',base,head,checks:[{check,status:'success',binding:binding(check,base,head),logSha256:'a'.repeat(64),commands:recipe(check,base,head).map(argv=>({argv,exitCode:0,seconds:0.1}))}]},pair.privateKey);
}
const invoke=(check,base,envelope)=>spawnSync(process.execPath,[script,'ci',check],{encoding:'utf8',env:{...process.env,CI_BASE_SHA:base,HUI_EVIDENCE_BRANCH:'ci/fixture',HUI_LOCAL_VALIDATION_PUBLIC_KEY:pub,HUI_LOCAL_VALIDATION_EVIDENCE:JSON.stringify(envelope)}});
test('workflows admit only docs/tool evidence and do not change application qualification',()=>{
 const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'),tools=fs.readFileSync(path.join(root,'.github/workflows/ci-release-tools.yml'),'utf8');
 assert.match(ci,/local-validation\.mjs ci documentation/);assert.match(tools,/local-validation\.mjs ci release-tools/);
 for(const v of ['HUI_EVIDENCE_BRANCH','HUI_LOCAL_VALIDATION_PUBLIC_KEY','HUI_LOCAL_VALIDATION_EVIDENCE']){assert.ok(ci.includes(v));assert.ok(tools.includes(v))}
 assert.match(tools,/if: steps\.local\.outputs\.reused != 'true'/);assert.ok(!tools.includes('unittest discover'));assert.ok(!tools.includes('node --test'));
 assert.ok(!fs.readFileSync(path.join(root,'.github/workflows/ci-scoped-release.yml'),'utf8').includes('local-validation'));
 const base=process.env.CI_BASE_SHA||execFileSync('git',['merge-base','origin/main','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const before=execFileSync('git',['show',base+':.github/workflows/ci.yml'],{cwd:root,encoding:'utf8'});
 for(const job of ['backend','backend-regression','frontend','browser','docker','codeql','scoped-release']) {
  const block=text=>text.match(new RegExp('^  '+job+':[\\s\\S]*?(?=^  [a-z][a-z-]*:|$(?![\\s\\S]))','m'))?.[0];
  assert.equal(block(ci),block(before),'Unrelated job changed: '+job);
 }
});
test('adapter-only diff selects new integration checks, not prior contracts or Python suites',()=>{
 const base=process.env.CI_BASE_SHA||git('merge-base','origin/main','HEAD');
 assert.equal(adapterOnly(base,git('rev-parse','HEAD')),true,'Real frozen scope must not expand checks');
 fixture(({base,head})=>{
 assert.equal(adapterOnly(base,head),true);assert.deepEqual(recipe('release-tools',base,head),[['node','--test','.github/scripts/local-validation.integration.test.mjs']]);
 fs.writeFileSync('server-version/scripts/release/policy.mjs','export const authority=2;\n');git('add','.');git('commit','-m','authority changed');
 assert.equal(adapterOnly(base,git('rev-parse','HEAD')),false);assert.ok(recipe('release-tools',base,git('rev-parse','HEAD'))[0].includes('server-version/scripts/release/policy.test.mjs'));
 });
});
test('same-branch CI consumes local tool evidence without spawning tests; stale proof stops',()=>fixture(({base,head})=>{
 const signed=proof('release-tools',base,head);const accepted=invoke('release-tools',base,signed);
 assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/REUSED local check/);
 // The fixture contains no executable tests; passing proves no retest occurred.
 fs.writeFileSync('.github/workflows/ci-release-tools.yml','name: changed\n');git('add','.');git('commit','-m','consumed workflow changed');
 const stale=invoke('release-tools',base,signed);assert.notEqual(stale.status,0);assert.match(stale.stderr,/inputs changed/);assert.ok(!stale.stdout.includes('TAP version'));
}));
test('documentation evidence is accepted on merge-equivalent source, and missing output cannot issue proof',()=>fixture(({head})=>{
 const base=head;fs.writeFileSync('AGENTS.md','b\n');git('add','.');git('commit','-m','documentation');const candidate=git('rev-parse','HEAD');
 const signed=proof('documentation',base,candidate);git('commit','--allow-empty','-m','same tree admission');const accepted=invoke('documentation',base,signed);
 assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/REUSED local check/);
 const bad=structuredClone(signed.payload);bad.checks[0].commands=[];assert.throws(()=>admit(seal(bad,pair.privateKey),pub,base,git('rev-parse','HEAD')));
}));
test('new adapter paths stay tooling-only; mixed UI/backend and nonregular modes cannot hide',()=>{
 const regular=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
 const files=['local-validation.mjs','local-validation.test.mjs','local-validation.integration.test.mjs'].map(n=>regular('.github/scripts/'+n));
 assert.equal(toolingOnly(files),true);
 for(const extra of [regular('server-version/frontend/src/training/training-home-brand.css'),regular('server-version/backend/src/controllers/authController.ts'),{...files[0],newMode:'120000'}])assert.equal(toolingOnly([...files,extra]),false);
});
