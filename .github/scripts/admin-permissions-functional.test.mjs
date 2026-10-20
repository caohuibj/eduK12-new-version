import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateAdminFunctional,validAdminFunctionalPlan,ADMIN_FUNCTIONAL_CONFIG,ADMIN_FUNCTIONAL_BASE,
  ADMIN_FUNCTIONAL_MODE,ADMIN_FUNCTIONAL_TOOLS,ADMIN_FUNCTIONAL_OMISSIONS} from './admin-permissions-functional.mjs';
import {failedChecks,requiredChecks} from './merge-gate.mjs';
import {mediaPlan} from './ci-media-plan.mjs';

const config=JSON.parse(readFileSync(new URL('../config/admin-permissions-functional-ci.json',import.meta.url),'utf8'));
const context={base:ADMIN_FUNCTIONAL_BASE,head:'a'.repeat(40),event:'pull_request'};
const added=file=>({file,status:'A',oldMode:'000000',newMode:'100644'});
const entries=()=>[...new Set([...ADMIN_FUNCTIONAL_TOOLS,...config.sourcePaths])].map(added);
const plan=()=>validateAdminFunctional(entries(),config,context);
const workflow=name=>readFileSync(new URL(`../workflows/${name}.yml`,import.meta.url),'utf8');
const job=(source,name)=>source.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:/)[0]||'';
const acceptance=['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'];
const functionalChecks=['scope','maintenance','miniprogram','backend','backend-regression','frontend','browser','docker',
  'frontend-build','accept-visual','codeql','accept-media','accept-ui','accept-ops'];
function needsFor(){
  const selected=['media2','video_core','media7','situational_video','situational_branching'];
  const outputs={...Object.fromEntries(acceptance.map(key=>[key,key==='perf_smoke'?'false':'true'])),
    ...Object.fromEntries(['maintenance','content','presentation','frontend','frontend_test','documentation'].map(key=>[key,'false'])),
    application_route:'legacy',scenario:'platform',codeql:'true',runner_profile:'hosted',frontend_build:'true',ui_required:'true',visual_hosted:'true',
    media_selection:JSON.stringify(selected),media_groups:JSON.stringify(mediaPlan(selected)),
    training_functional_only:'false',training_functional_plan:'null',run_performance_tests:'false',
    admin_permissions_functional_only:'true',admin_permissions_functional_plan:JSON.stringify(plan())};
  const needs={scope:{outputs,result:'success'},'accept-perf':{result:'skipped'}};
  for(const name of functionalChecks.filter(name=>name!=='scope'))needs[name]={result:'success'};
  return needs;
}

test('administrator integration declares its own exact main base, complete reviewed source paths and only two omissions',()=>{
  assert.equal(config.base,'c3f9a7e77447c706f4a83a93c7429a7bcb164e94');
  assert.equal(config.mode,'admin-permissions-functional-only');assert.equal(config.sourcePaths.length,153);
  assert.deepEqual(ADMIN_FUNCTIONAL_OMISSIONS,['aggregate-report-200-completion','perf-phase0-smoke']);
  assert.equal(validAdminFunctionalPlan(plan()),true);
  assert.equal(plan().mode,ADMIN_FUNCTIONAL_MODE);
});
test('branch names, arbitrary booleans and the historical Training marker cannot grant administrator functional mode',()=>{
  assert.equal(validateAdminFunctional([added('server-version/backend/src/index.ts')],config,
    {...context,branch:'admin-permissions/a01-a07-20261020',adminFunctional:true}),null);
  assert.equal(validateAdminFunctional([added('.github/config/training-functional-ci.json')],config,context),null);
  for(const change of [{base:'b'.repeat(40)},{head:'HEAD'},{event:'workflow_dispatch'},{forceFull:true}])
    assert.throws(()=>validateAdminFunctional(entries(),config,{...context,...change}));
  assert.throws(()=>validateAdminFunctional(entries(),{...config,mode:'training-functional-only'},context));
});
test('scope rejects marker edits, unknown, missing, duplicate, renamed, deleted, executable and symbolic-link changes',()=>{
  for(const changes of [
    [...entries(),added('server-version/backend/src/unreviewed.ts')],
    [...entries(),entries()[0]],
    entries().filter(entry=>entry.file!=='server-version/frontend/src/App.tsx'),
    entries().filter(entry=>entry.file!=='docs/admin-permissions/README.md'),
    ...['D','R100'].map(status=>entries().map((entry,index)=>index===1?{...entry,status}:entry)),
    ...['100755','120000'].map(newMode=>entries().map((entry,index)=>index===1?{...entry,newMode}:entry)),
    entries().map(entry=>entry.file===ADMIN_FUNCTIONAL_CONFIG?{...entry,status:'M',oldMode:'100644'}:entry),
  ])assert.throws(()=>validateAdminFunctional(changes,config,context));
  for(const sourcePaths of [[...config.sourcePaths,'../outside.ts'],[...config.sourcePaths,config.sourcePaths[0]],['.github/workflows/unreviewed.yml']])
    assert.throws(()=>validateAdminFunctional(entries(),{...config,sourcePaths},context));
});
test('all original functional, browser, migration, image and security jobs remain required and must actually succeed',()=>{
  const needs=needsFor();assert.deepEqual(failedChecks(needs,false),[]);
  assert.deepEqual(requiredChecks(needs,false).sort(),[...functionalChecks].sort());
  for(const name of functionalChecks)for(const result of ['failure','cancelled','skipped',undefined]){
    const changed=structuredClone(needs);changed[name]={result};assert.ok(failedChecks(changed,false).includes(name),name+' '+result);
  }
  assert.ok(failedChecks(needs,true).includes('scope'),'draft cannot claim a ready administrator gate');
});
test('gate refuses Training impersonation, performance execution, changed plans and silently narrowed functional flags',()=>{
  const mutations=[
    n=>{n.scope.outputs.admin_permissions_functional_only='maybe';},
    n=>{n.scope.outputs.admin_permissions_functional_plan='null';},
    n=>{n.scope.outputs.admin_permissions_functional_plan=JSON.stringify({...plan(),mode:'training-functional-only'});},
    n=>{n.scope.outputs.training_functional_only='true';},
    n=>{n.scope.outputs.run_performance_tests='true';},
    n=>{n.scope.outputs.perf_smoke='true';},n=>{n['accept-perf'].result='success';},
    ...['codeql','frontend_build','ui_required','visual_hosted',...acceptance.filter(key=>key!=='perf_smoke')]
      .map(key=>n=>{n.scope.outputs[key]='false';}),
  ];
  for(const mutate of mutations){const needs=needsFor();mutate(needs);assert.ok(failedChecks(needs,false).includes('scope'));}
  assert.equal(validAdminFunctionalPlan({...plan(),omittedPerformance:['all-security']}),false);
});
test('workflows preserve ordinary jobs, refuse manual fallback and pass the distinct administrator plan',()=>{
  const ci=workflow('ci'),backend=workflow('ci-backend'),browser=workflow('ci-browser');
  for(const name of ['scope','probe-backend','probe-perf','probe-browser','merge-gate'])
    assert.match(job(ci,name),/!\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/admin-permissions\/a01-a07-20261020'\)/,name);
  assert.match(job(ci,'known-admin-functional-manual-refusal'),/throw new Error/);
  assert.match(job(ci,'scope'),/CI_ADMIN_FUNCTIONAL_REQUIRED:/);
  assert.match(job(ci,'scope'),/admin_permissions_functional_plan: \$\{\{ steps\.scope\.outputs\.admin_permissions_functional_plan \}\}/);
  for(const name of ['backend','browser'])assert.match(job(ci,name),/admin_permissions_functional: \$\{\{ needs\.scope\.outputs\.admin_permissions_functional_only == 'true' \}\}/);
  assert.match(backend,/test "\$RUN_PERFORMANCE_TESTS" = false[\s\S]*admin-permissions-functional\.mjs verify-backend/);
  assert.match(browser,/admin-permissions-functional\.mjs verify-browser/);
  assert.match(backend,/training-functional-report\.mjs.*eduk12-backend-functional-vitest\.json/);
  assert.match(browser,/default: '\["foundation","products","security"\]'/);
});
test('administrator CI runs its actual isolated PG/API and both real virtual-key browser phases with no skips or secret uploads',()=>{
  const backend=workflow('ci-backend'),browser=workflow('ci-browser');
  assert.match(backend,/ADMIN_PERMISSIONS_ISOLATED_TEST: '1'/);
  assert.match(backend,/eduk12_admin_permissions_ci_backend/);
  assert.match(backend,/node dist\/index\.js[\s\S]*127\.0\.0\.1:3100\/ready/);
  assert.match(backend,/files=\(src\/__tests__\/admin-permissions\/\*\.postgres\.integration\.test\.ts\)/);
  assert.match(backend,/test "\$\{#files\[@\]\}" -eq 10/);
  assert.match(backend,/assert-release-test-report\.mjs.*vitest\.json.*files\[@\]/);
  assert.match(backend,/admin-permissions-rehearsal\.mjs/);
  assert.match(backend,/\(cd "\$GITHUB_WORKSPACE" && node server-version\/backend\/scripts\/admin-permissions-rollback-preflight\.mjs/);
  assert.match(backend,/assert\.equal\(tests\.numPendingTests,0\)/);
  assert.match(browser,/if: inputs\.admin_permissions_functional && matrix\.group == 'security'/);
  assert.match(browser,/eduk12_admin_permissions_ci_browser/);
  assert.match(browser,/PHASE=business-overlaps node e2e\/admin-permissions-browser\.cjs/);
  assert.match(browser,/PHASE=workspaces-resume node e2e\/admin-permissions-browser\.cjs/);
  assert.match(browser,/result\('business\.log','P2-business-and-governance',42\)/);
  assert.match(browser,/result\('workspaces\.log','A05-workspaces',198\)/);
  for(const source of [backend,browser]){
    assert.match(source,/trap cleanup_admin.* EXIT/);
    assert.match(source,/path: \$\{\{ runner\.temp \}\}\/admin-permissions-(functional|browser)-summary\.json/);
    assert.doesNotMatch(source,/path:.*admin-permissions-private/);
  }
});
test('portable test paths retain loopback, dedicated database, private mode and real restore restrictions',()=>{
  const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
  const fixture=read('server-version/backend/scripts/admin-permissions-fixture.ts');
  const browser=read('server-version/e2e/admin-permissions-browser.cjs');
  const rehearsal=read('server-version/backend/scripts/admin-permissions-rehearsal.mjs');
  for(const source of [fixture,rehearsal]){
    assert.match(source,/\['localhost','127\.0\.0\.1'\]\.includes/);
    assert.match(source,/startsWith\('\/eduk12_admin_permissions_'\)/);
  }
  for(const source of [fixture,browser,rehearsal]){
    assert.match(source,/realpathSync\(privateRoot\)!==privateRoot/);assert.match(source,/mode&0o077/);
    assert.match(source,/RUNNER_TEMP/);assert.match(source,/ADMIN_PERMISSIONS_ISOLATED_TEST/);
  }
  assert.match(browser,/\['http:\/\/localhost:5174','http:\/\/localhost:5175','http:\/\/localhost:5176','http:\/\/localhost:5177'\]\.includes\(origin\)/);
  for(const command of ['pg_dump','pg_restore','psql'])assert.match(rehearsal,new RegExp("pgContainer,'"+command+"'"));
  assert.match(rehearsal,/source\.port!==port/);
});
test('real administrator verification and merge CLIs re-read Git and reject tampered scope instead of trusting emitted booleans',()=>{
  const directory=mkdtempSync(join(tmpdir(),'admin-functional-cli-'));
  try{
    const fixtureFile=join(directory,'git-fixture.json');
    writeFileSync(join(directory,'git'),`#!/usr/bin/env node
const fs=require('node:fs'),fixture=JSON.parse(fs.readFileSync(process.env.ADMIN_CLI_GIT_FIXTURE,'utf8')),args=process.argv.slice(2);
if(JSON.stringify(args)===JSON.stringify(['rev-parse','HEAD']))process.stdout.write(fixture.head+'\\n');
else if(JSON.stringify(args)===JSON.stringify(['diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40','-z',fixture.base,fixture.head,'--']))process.stdout.write(fixture.raw);
else if(JSON.stringify(args)===JSON.stringify(['show',fixture.head+':'+fixture.configPath]))process.stdout.write(JSON.stringify(fixture.config));
else process.exit(1);
`,{mode:0o700});
    const raw=rows=>rows.map(entry=>`:${entry.oldMode} ${entry.newMode} ${'0'.repeat(40)} ${'b'.repeat(40)} ${entry.status}\0${entry.file}\0`).join('');
    const fixture={base:context.base,head:context.head,configPath:ADMIN_FUNCTIONAL_CONFIG,config,raw:raw(entries())};
    writeFileSync(fixtureFile,JSON.stringify(fixture));
    const execute=(script,command,needs=needsFor())=>spawnSync(process.execPath,
      [fileURLToPath(new URL('./'+script,import.meta.url)),...(command?[command]:[])],{
        cwd:directory,encoding:'utf8',timeout:10000,env:{...process.env,PATH:directory+delimiter+process.env.PATH,
          ADMIN_CLI_GIT_FIXTURE:fixtureFile,CI_EVENT:'pull_request',CI_BASE_SHA:context.base,CI_FORCE_FULL:'false',IS_DRAFT:'false',NEEDS_JSON:JSON.stringify(needs)}});
    for(const command of ['verify-backend','verify-browser']){
      const result=execute('admin-permissions-functional.mjs',command);assert.ifError(result.error);
      assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).mode,ADMIN_FUNCTIONAL_MODE);
    }
    const merged=execute('merge-gate.mjs');assert.ifError(merged.error);assert.equal(merged.status,0,merged.stdout+merged.stderr);
    assert.deepEqual(JSON.parse(merged.stdout).failed,[]);
    fixture.raw=raw([...entries(),added('server-version/backend/src/unreviewed.ts')]);writeFileSync(fixtureFile,JSON.stringify(fixture));
    for(const [script,command]of [['admin-permissions-functional.mjs','verify-backend'],['admin-permissions-functional.mjs','verify-browser'],['merge-gate.mjs',undefined]]){
      const result=execute(script,command);assert.ifError(result.error);assert.equal(result.status,1,result.stdout+result.stderr);
      if(script==='merge-gate.mjs')assert.ok(JSON.parse(result.stdout).failed.includes('recomputed-admin-functional-plan'));
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
