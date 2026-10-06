import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { manifestDependencyOnly,dependencyScope,dependencyFile,imageMirrorOnly } from './dependency-scope.mjs';
import { changedEntries,acceptanceFor,runnerPlan } from './content-scope.mjs';
import { requiredChecks,failedChecks } from './merge-gate.mjs';
const root='server-version/backend';
const baseManifest={name:'fixture',version:'1.0.0',scripts:{test:'vitest run',build:'tsc'},engines:{node:'>=24.21.0 <25'},dependencies:{'proxy-addr':'^2.0.7'},devDependencies:{vitest:'^3.2.7'}};
const lock=manifest=>({name:'fixture',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'fixture',version:'1.0.0',engines:manifest.engines,dependencies:manifest.dependencies,devDependencies:manifest.devDependencies},'node_modules/source-map-js':{version:'1.2.1'}}});
const nextManifest=()=>({...structuredClone(baseManifest),dependencies:{'proxy-addr':'^2.0.8'},devDependencies:{vitest:'^4.1.11',vite:'7.3.6'},overrides:{'source-map-js':'1.2.2'}});
test('dependency-only manifests admit npm version changes and existing transitive overrides',()=>{
  const next=nextManifest();
  assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),lock(next)),true);
});
test('scripts, engines, exports and arbitrary manifest metadata cannot select the dependency route',()=>{
  for(const field of ['scripts','engines','main','exports','type','name','version','workspaces','packageManager','config']) {
    const next=nextManifest();next[field]={unexpected:'changed'};
    assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),lock(next)),false,field);
  }
});
test('unsafe specs, runtime additions, dependency removal and mismatched root locks fail closed',()=>{
  for(const spec of ['https://example.invalid/a.tgz','file:../../local','git+https://example.invalid/a','workspace:*','latest','*']) {
    const next=nextManifest();next.devDependencies.vitest=spec;
    assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),lock(next)),false,spec);
  }
  for(const mutate of [
    n=>{delete n.dependencies['proxy-addr'];},
    n=>{n.dependencies.newruntime='1.0.0';},
    n=>{n.overrides['never-installed']='1.0.0';},
  ]) {const next=nextManifest();mutate(next);assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),lock(next)),false);}
  const next=nextManifest();
  assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),lock(baseManifest)),false);
  const bad=lock(next);bad.packages[''].scripts={test:'echo skipped'};
  assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),bad),false);
  bad.packages['']=lock(next).packages[''];bad.lockfileVersion=2;
  assert.equal(manifestDependencyOnly(baseManifest,next,lock(baseManifest),bad),false);
});
function fixture(body) {
  const dir=mkdtempSync(join(tmpdir(),'dependency-route-')),cwd=process.cwd();
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  const put=(file,value)=>{mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),typeof value==='string'?value:JSON.stringify(value));};
  const commit=()=>{git('add','.');git('-c','user.name=CI Test','-c','user.email=ci@example.invalid','commit','-qm','fixture');};
  try {
    git('init','-q');
    for(const part of ['backend','frontend']) {
      put('server-version/'+part+'/package.json',baseManifest);
      put('server-version/'+part+'/package-lock.json',lock(baseManifest));
    }
    put(root+'/src/__tests__/utils/cos.test.ts','original');
    put(root+'/src/utils/cos.ts','original');
    put('.github/workflows/ci.yml','original');
    put('.github/scripts/ci-image-plan.mjs','original');
    commit();const base=git('rev-parse','HEAD');process.chdir(dir);
    body({base,put,commit,git});
  } finally {process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
}
test('actual Git changes admit paired dependencies plus existing tests/policy; manifest script changes disqualify',()=>fixture(({base,put,commit,git})=>{
  put(root+'/package.json',nextManifest());put(root+'/package-lock.json',lock(nextManifest()));
  put(root+'/src/__tests__/utils/cos.test.ts','constructible test mock');
  put('.github/workflows/ci.yml','coordinated scope update');commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),true);
  put(root+'/src/utils/cos.ts','business behavior');commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
  git('reset','--hard',base);put(root+'/package.json',nextManifest());commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
  git('reset','--hard',base);const bad=nextManifest();bad.scripts.test='echo skipped';
  put(root+'/package.json',bad);put(root+'/package-lock.json',lock(bad));commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
}));
test('real CLI selects scoped consumers and force-full only strengthens; no changes or CI-only changes cannot qualify',()=>fixture(({base,put,commit,git})=>{
  const cli=new URL('./content-scope.mjs',import.meta.url).pathname;
  const env={...process.env,CI_EVENT:'pull_request',CI_PR_REPOSITORY:'example/repo',GITHUB_REPOSITORY:'example/repo',CI_BASE_SHA:base,CI_FORCE_FULL:'',GITHUB_OUTPUT:''};
  put(root+'/package.json',nextManifest());put(root+'/package-lock.json',lock(nextManifest()));commit();
  const selected=JSON.parse(execFileSync(process.execPath,[cli],{env,encoding:'utf8'}));
  assert.equal(selected.scenario,'dependencies');assert.equal(selected.frontend_build,true);assert.equal(selected.codeql,true);
  for(const key of Object.keys(acceptanceFor([]))) assert.equal(selected[key],false,key);
  assert.deepEqual(selected.platformReasons,[]);
  const full=JSON.parse(execFileSync(process.execPath,[cli],{env:{...env,CI_FORCE_FULL:'true'},encoding:'utf8'}));
  assert.equal(full.scenario,'platform');
  for(const key of Object.keys(acceptanceFor([]))) assert.equal(full[key],true,key);
  git('reset','--hard',base);put('.github/workflows/ci.yml','unscoped policy');commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
  assert.equal(dependencyScope([],{base}),false);
}));
function outputs() {
  return {...Object.fromEntries(Object.keys(acceptanceFor([])).map(key=>[key,'false'])),
    maintenance:'false',content:'false',frontend:'false',presentation:'false',documentation:'false',
    codeql:'true',scenario:'dependencies',runner_profile:'speed',frontend_build:'true',
    ui_required:'false',visual_hosted:'false',media_selection:'[]',media_groups:'[]'};
}
test('draft and ready dependency aggregate require every formal affected component and reject skips or forged selections',()=>{
  for(const draft of [true,false]) {
    const needs={scope:{result:'success',outputs:outputs()}};
    assert.deepEqual(requiredChecks(needs,draft),['scope','maintenance','backend','backend-regression','frontend-build','frontend','docker','codeql']);
    for(const name of requiredChecks(needs,draft)) needs[name]={...needs[name],result:'success'};
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const name of requiredChecks(needs,draft))
      for(const result of ['failure','skipped','cancelled',undefined])
        assert.ok(failedChecks({...needs,[name]:{...needs[name],result}},draft).includes(name));
    for(const patch of [{codeql:'false'},{content:'true'},{maintenance:'true'},
      {ops:'true'},{visual_hosted:'true'},{frontend_build:'false'},{scenario:'unknown'}])
      assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs(),...patch}}},draft).includes('scope'));
  }
});
const source=n=>readFileSync(new URL('../workflows/'+n+'.yml',import.meta.url),'utf8');
const job=(s,n)=>s.split('  '+n+':\n')[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0]??'';
test('automatic dependency route shares unchanged components and cannot start browser, mini or duplicate draft compilation',()=>{
  const ci=source('ci');
  for(const name of ['backend','backend-regression','frontend-build','frontend','docker','codeql'])
    assert.match(job(ci,name),/outputs\.scenario == 'dependencies'/,name);
  for(const name of ['browser','miniprogram','pr-light-backend','pr-light-frontend','backend-browser-build'])
    assert.match(job(ci,name),/outputs\.scenario != 'dependencies'/,name);
  assert.match(job(ci,'maintenance'),/outputs\.scenario == 'dependencies'/);
  assert.match(ci,/dependency-routing\.test\.mjs/);
  assert.match(source('ci-maintenance'),/dependency-routing\.test\.mjs/);
  for(const name of ['ci-backend','ci-frontend']) assert.match(source(name),/npm audit --audit-level=high/);
  assert.match(source('ci-images'),/CRITICAL,HIGH|HIGH,CRITICAL/);
  const plan=runnerPlan({profile:'speed',scenario:'dependencies',os:'darwin',macEnabled:true,freeBytes:10*1024**3});
  assert.deepEqual(plan.regression_runner,['ubuntu-24.04']);assert.equal(plan.visual_hosted,false);
});
test('dependency allowlist rejects unknown files, path traversal, deletions and type/mode changes',()=>{
  for(const file of [root+'/prisma/schema.prisma',root+'/Dockerfile','.github/workflows/ops-prelaunch.yml',
    'server-version/docker-compose.yml','server-version/scripts/backup/restore-db.mjs',
    root+'/src/__tests__/../../utils/cos.test.ts',root+'/package.json\n',root+'//package.json']) assert.equal(dependencyFile(file),false,file);
  const e={file:root+'/package-lock.json',status:'M',oldMode:'100644',newMode:'100644'};
  for(const bad of [{...e,status:'D',newMode:'000000'},{...e,newMode:'120000'},{...e,newMode:'100755'},{...e,status:'T'}])
    assert.equal(dependencyScope([bad],{base:'a'.repeat(40)}),false);
  assert.throws(()=>dependencyScope([e],{base:'$(invalid)'}),/Exact dependency/);
});

test('exact mainland mirror companion is admitted; unrelated build edits cannot use dependencies CI',()=>fixture(({base,put,commit})=>{
  const additions=["    if (name === 'backend' || name === 'worker')\n      plan.target[name].args = { ...plan.target[name].args, DEBIAN_MIRROR: 'mirrors.tuna.tsinghua.edu.cn' };\n", "    if (name === 'backend' || name === 'worker')\n      assert.equal(target.args?.DEBIAN_MIRROR, 'mirrors.tuna.tsinghua.edu.cn', 'CI Debian mirror was lost');\n"];
  const after='original'+additions.join('');
  assert.equal(imageMirrorOnly('original',after),true);
  for(const bad of [after+'changed tag',after.replace("mirrors.tuna.tsinghua.edu.cn","untrusted.invalid"),after+additions[0],after.replace(additions[1],'')])
    assert.equal(imageMirrorOnly('original',bad),false);
  put(root+'/package.json',nextManifest());put(root+'/package-lock.json',lock(nextManifest()));
  put('.github/scripts/ci-image-plan.mjs',after);commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),true);
  put('.github/scripts/ci-image-plan.mjs',after+'changed tag');commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
}));
