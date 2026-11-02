import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {compileFunction} from 'node:vm';
import {toolingOnly} from '../../server-version/scripts/release/policy.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';

const cli='server-version/backend/src/scripts/situational-onboarding-check.ts';
const regular=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
// Evaluate the actual CLI helper after removing TypeScript syntax. No alternate
// reader is substituted, and the full content checker is not invoked.
function gitReader(repo){
 const source=readFileSync(cli,'utf8');
 const declarations=source.match(/^const git = .*$/gm);
 assert.equal(declarations?.length,1,'Expected the native CLI Git helper');
 return compileFunction(stripTypeScriptTypes(declarations[0])+';return git',['execFileSync','repo'])(execFileSync,repo);
}
test('native SJT Git reader preserves small and large UTF-8 blobs and rejects overflow',()=>{
 const root=mkdtempSync(join(tmpdir(),'sjt-git-buffer-'));
 try{
  execFileSync('git',['init','--quiet',root]);const read=gitReader(root);
  const put=value=>execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:value,encoding:'utf8'}).trim();
  const small=readFileSync('server-version/backend/src/modules/situational/instruments/sjt-anxiety-golden/1.0.0/publication.json','utf8');
  for(const value of [small,JSON.stringify({text:'教师情景'.repeat(260000)}),'x'.repeat(8*1024*1024-1)])assert.equal(read('show',put(value)),value);
  assert.throws(()=>read('show',put('x'.repeat(8*1024*1024+65536))),{code:'ENOBUFS'});
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('SJT tooling keeps content, review authority, runtime, dependencies and unsafe modes outside its route',()=>{
 const entries=[cli,'.github/scripts/sjt-onboarding-git-buffer.test.mjs','.github/scripts/local-validation.mjs','.github/workflows/situational-publication.yml','docs/development/sjt-onboarding-git-buffer.md'].map(regular);
 assert(toolingOnly(entries));
 for(const file of ['server-version/backend/src/modules/situational/instruments/new/1.0.0/instrument.json','server-version/backend/src/modules/situational/instruments/new/1.0.0/publication.json','server-version/backend/src/modules/situational/instruments/new/1.0.0/scientific.json','server-version/backend/src/modules/situational/onboarding/review-authority.ts','server-version/backend/src/modules/situational/situational-runtime.service.ts','server-version/backend/src/scripts/unknown.ts','server-version/backend/package-lock.json','server-version/backend/prisma/schema.prisma','server-version/frontend/src/App.tsx'])assert(!toolingOnly([...entries,regular(file)]),file);
 for(const change of [{newMode:'120000'},{newMode:'100755'},{status:'D',newMode:'000000'},{status:'R'}])assert(!toolingOnly([{...regular(cli),...change}]));
 const needs={scope:{result:'success',outputs:{scenario:'release-tooling'}},'release-tools':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,true),['scope','release-tools']);
 assert.deepEqual(requiredChecks(needs,false),['scope','release-tools','codeql']);
 for(const result of ['skipped','failure','cancelled',undefined])assert(failedChecks({...needs,'release-tools':{result}},true).includes('release-tools'));
 const workflow=readFileSync('.github/workflows/situational-publication.yml','utf8');
 assert.match(workflow,/toolingOnly\(changedEntries\(process\.env\.BASE_SHA,'HEAD'\)\)/);
 assert.match(workflow,/situational:onboarding-check -- --all --json --verify-reviews/);
 const ci=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(ci,/RELEASE_TOOLING==='true'\?\{paths:\[[^\n]*server-version\/backend\/src\/scripts/);
});
