import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { manifestDependencyOnly,dependencyScope,dependencyFile,imageMirrorOnly,frontendDependencyFilesOnly } from './dependency-scope.mjs';
import { changedEntries,acceptanceFor,runnerPlan,frontendDependencyScope } from './content-scope.mjs';
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
    maintenance:'false',content:'false',frontend:'false',frontend_test:'false',presentation:'false',documentation:'false',
    codeql:'true',scenario:'dependencies',runner_profile:'hosted',frontend_build:'true',
    ui_required:'false',visual_hosted:'false',media_selection:'[]',media_groups:'[]'};
}
test('frontend lock-only changes select the existing frontend jobs and preserve real failures',()=>fixture(({base,put,commit,git})=>{
  const next=lock(baseManifest);next.packages['node_modules/source-map-js'].version='1.2.2';
  put('server-version/frontend/package-lock.json',next);commit();
  const cli=new URL('./content-scope.mjs',import.meta.url).pathname;
  const env={...process.env,CI_EVENT:'pull_request',CI_PR_REPOSITORY:'example/repo',GITHUB_REPOSITORY:'example/repo',CI_BASE_SHA:base,CI_FORCE_FULL:'',GITHUB_OUTPUT:''};
  const selected=JSON.parse(execFileSync(process.execPath,[cli],{env,encoding:'utf8'}));
  assert.equal(selected.scenario,'dependencies');assert.equal(selected.dependencies_frontend_only,true);
  const outputs=Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,String(v)]));
  for(const draft of [true,false]){
    const needs={scope:{result:'success',outputs}};
    assert.deepEqual(requiredChecks(needs,draft),['scope','frontend-build','frontend','docker','codeql']);
    for(const name of requiredChecks(needs,draft))needs[name]={...needs[name],result:'success'};
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const name of requiredChecks(needs,draft))for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,[name]:{...needs[name],result}},draft).includes(name));
    for(const value of ['TRUE','',true])assert(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,dependencies_frontend_only:value}}},draft).includes('scope'));
  }
  assert.equal(JSON.parse(execFileSync(process.execPath,[cli],{env:{...env,CI_FORCE_FULL:'true'},encoding:'utf8'})).dependencies_frontend_only,false);
  // Real Git classifications for frontend-only, both, then backend-only. Backend
  // qualification stays intact; this small patch only removes the frontend case's
  // unrelated backend/maintenance work.
  for(const kind of ['both','backend']){
    if(kind==='backend')git('reset','--hard',base);
    put('server-version/backend/package-lock.json',next);commit();
    const selected=JSON.parse(execFileSync(process.execPath,[cli],{env,encoding:'utf8'}));
    assert.equal(selected.scenario,'dependencies',kind);assert.equal(selected.dependencies_frontend_only,false,kind);
    assert(requiredChecks({scope:{outputs:Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,String(v)]))}},false).includes('backend-regression'),kind);
  }
}));
test('frontend dependency selector never hides backend, runtime or control companions',()=>{
  const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
  const front=entry('server-version/frontend/package-lock.json');
  assert.equal(frontendDependencyFilesOnly([front,entry('server-version/frontend/src/pages/__tests__/Example.test.tsx')]),true);
  for(const file of ['server-version/backend/package-lock.json','server-version/backend/src/__tests__/api.test.ts','.github/workflows/ci.yml','server-version/frontend/src/api/client.ts','server-version/frontend/Dockerfile'])assert.equal(frontendDependencyFilesOnly([front,entry(file)]),false,file);
  assert.equal(frontendDependencyFilesOnly([]),false);
});
test('frontend version lock source and sibling tests use full frontend checks without narrow evidence',()=>fixture(({base,put,commit,git})=>{
  const front='server-version/frontend/';
  const next=lock(baseManifest);next.packages['node_modules/source-map-js'].version='1.2.2';
  put(front+'package-lock.json',next);
  put(front+'src/school/SchoolStudentTasks.tsx','frontend fixture');
  put(front+'src/school/SchoolTaskReadStates.test.tsx','sibling test fixture');
  put(front+'src/modules/cognitive/Example.test.tsx','existing engine test fixture');
  commit();
  const entries=changedEntries(base);
  assert.equal(frontendDependencyScope(entries,{base}),true);
  const cli=new URL('./content-scope.mjs',import.meta.url).pathname;
  const env={...process.env,CI_EVENT:'pull_request',CI_PR_REPOSITORY:'example/repo',GITHUB_REPOSITORY:'example/repo',CI_BASE_SHA:base,CI_FORCE_FULL:'',GITHUB_OUTPUT:''};
  const selected=JSON.parse(execFileSync(process.execPath,[cli],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(selected.scenario,'dependencies');assert.equal(selected.dependencies_frontend_only,true);assert.equal(selected.frontend_affected,false);
  const outputs=Object.fromEntries(Object.entries(selected).map(([key,value])=>[key,String(value)]));
  for(const draft of [true,false])assert.deepEqual(requiredChecks({scope:{outputs}},draft),['scope','frontend-build','frontend','docker','codeql']);
  for(const file of ['server-version/backend/package-lock.json','server-version/backend/src/modules/campus/group-reports.ts','package-lock.json','.github/workflows/ci.yml',front+'src/api/client.ts',front+'src/modules/cognitive/runner.ts']){
    assert.equal(frontendDependencyScope([...entries,{file,status:'A',oldMode:'000000',newMode:'100644'}],{base}),false,file);
  }
  assert.equal(frontendDependencyScope([{...entries[0],newMode:'120000'},...entries.slice(1)],{base}),false);
  assert.equal(JSON.parse(execFileSync(process.execPath,[cli],{env:{...env,CI_FORCE_FULL:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe']})).scenario,'platform');
  const bad={...baseManifest,scripts:{...baseManifest.scripts,test:'echo skipped'}};
  put(front+'package.json',bad);commit();
  assert.equal(frontendDependencyScope(changedEntries(base),{base}),false,'script changes retain the original route');
}));
test('frontend dependency workflow dispatch agrees with the aggregate and frontend-only image target',()=>{
  const ci=source('ci');
  for(const draft of [true,false]){
    const needs={scope:{result:'success',outputs:{...outputs(),application_route:'legacy',dependencies_frontend_only:'true'}}};
    const github={event_name:'pull_request',ref_name:'feature/dependencies',event:{pull_request:{draft,number:1,head:{ref:'feature/dependencies'}}}};
    for(const name of ['maintenance','backend','backend-regression','frontend','frontend-build','docker']){
      const expr=job(ci,name).match(/^    if: \$\{\{ (.+) \}\}$/m)[1];
      const selected=new Function('needs','github','vars','cancelled','fromJSON',`return (${expr})`)(needs,github,{CI_FORCE_FULL:'false'},()=>false,JSON.parse);
      assert.equal(Boolean(selected),['frontend','frontend-build','docker'].includes(name),name+' draft='+draft);
    }
    const expr=job(ci,'docker').match(/frontend_only: \$\{\{ (.+) \}\}/)[1];
    assert.equal(new Function('needs',`return (${expr})`)(needs),true);
  }
  assert.match(job(ci,'codeql'),/id: deps-codeql\n        if: needs\.scope\.outputs\.dependencies_frontend_only == 'true'/);
  assert.match(job(ci,'codeql'),/paths:\['server-version\/frontend\/src'\]/);
  assert.match(job(ci,'codeql'),/\$\{\{ steps\.deps-codeql\.outputs\.config \|\|/);
});
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

test('exact official source companion is admitted; unrelated build edits cannot use dependencies CI',()=>fixture(({base,put,commit})=>{
  const additions=["    if (name === 'backend' || name === 'worker')\n      plan.target[name].args = { ...plan.target[name].args, DEBIAN_MIRROR: 'deb.debian.org' };\n", "    if (name === 'backend' || name === 'worker')\n      assert.equal(target.args?.DEBIAN_MIRROR, 'deb.debian.org', 'CI official Debian source was lost');\n"];
  const after='original'+additions.join('');
  assert.equal(imageMirrorOnly('original',after),true);
  for(const bad of [after+'changed tag',after.replace("deb.debian.org","untrusted.invalid"),after+additions[0],after.replace(additions[1],'')])
    assert.equal(imageMirrorOnly('original',bad),false);
  put(root+'/package.json',nextManifest());put(root+'/package-lock.json',lock(nextManifest()));
  put('.github/scripts/ci-image-plan.mjs',after);commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),true);
  put('.github/scripts/ci-image-plan.mjs',after+'changed tag');commit();
  assert.equal(dependencyScope(changedEntries(base),{base}),false);
}));
