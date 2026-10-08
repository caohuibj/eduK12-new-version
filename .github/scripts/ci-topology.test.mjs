import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runnerPlan } from './content-scope.mjs';
import { treeDigest, verifyManifest } from './ci-artifact.mjs';
import { mediaPlan, validateMediaPlan } from './ci-media-plan.mjs';
import { assertRunnerTemp } from './mac-ci-cleanup.mjs';
import { assertMediaServices } from './ci-reset-media-services.mjs';
const capacity={macEnabled:true,os:'darwin',freeBytes:10*1024**3};
test('CI workflows use hosted-only labels across every entrypoint',()=>{
  const dir=new URL('../workflows/',import.meta.url);
  for(const name of readdirSync(dir).filter(name=>name.endsWith('.yml')||name.endsWith('.yaml'))) {
    const source=readFileSync(new URL(name,dir),'utf8');
    assert.ok(!/self-hosted|eduk12-(win|mac)-ci/.test(source),name+' has a legacy runner');
    for(const line of source.split('\n').filter(line=>line.trimStart().startsWith('runs-on:'))) {
      assert.ok(line.includes('runs-on: ubuntu-24.04') || line.includes('runs-on: $'+'{{ fromJSON(needs.scope.outputs.'),name+': '+line);
    }
  }
});
test('single-component probes remain hosted and safety assertions remain intact',()=>{
  const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const probes=workflow.slice(workflow.indexOf('  probe-frontend-build:'),workflow.indexOf('  scope:'));
  assert.ok(!probes.includes('self-hosted'));
  for(const line of probes.split('\n').filter(line=>line.trimStart().startsWith('runner_labels:')))
    assert.ok(line.includes('ubuntu-24.04'),line);
  assert.match(probes,/inputs\.step_probe == 'assessment-repair' && 'assessment-repair'/);
  const regression=readFileSync(new URL('../workflows/ci-backend-regression.yml',import.meta.url),'utf8');
  const reportCleanup=regression.indexOf('name: clear reports from previous regression jobs');
  assert.ok(reportCleanup>=0 && reportCleanup<regression.indexOf('uses: actions/setup-node@v4'));
  for(const report of ['backend','parent','r5']) assert.match(regression.slice(reportCleanup,regression.indexOf('uses: actions/setup-node@v4')),new RegExp(`/tmp/eduk12-${report}-vitest\\.json`));
  assert.match(regression,/cache: \$\{\{ runner\.environment == 'github-hosted' && 'npm' \|\| '' \}\}/);
  const backend=readFileSync(new URL('../workflows/ci-backend.yml',import.meta.url),'utf8');
  assert.match(backend,/run: rm -f \/tmp\/eduk12-backend-performance-vitest\.json \/tmp\/eduk12-ci-env\.txt/);
  assert.ok(backend.indexOf('name: clear reports from previous backend jobs')<backend.indexOf('uses: actions/setup-node@v4'));
  assert.match(regression,/QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL: postgresql:\/\/ptool:ptool123@localhost:5432\/ptool\?schema=public/);
  assert.match(regression,/if: inputs\.focus == 'assessment-repair'[\s\S]*CI_POSTGRES_SERVICE_ID:.*\$\{\{ job\.services\.postgres\.id \}\}[\s\S]*run: node scripts\/r5-regression\.mjs/);
  for(const file of ['questionnaire/workbench','integration/registered-resource-catalog','integration/runtime-role']) {
    assert.ok(regression.split('hosted critical integration suites must not skip')[1]?.includes(`src/__tests__/${file}.postgres.integration.test.ts`),`full regression must require ${file}`);
  }
});
test('all runner profiles and change scenarios resolve to hosted Ubuntu',()=>{
  for(const profile of ['hosted','speed','economy','local','balanced','hybrid']) {
    for(const scenario of ['platform','dependencies','frontend','content','maintenance','documentation']) {
      const plan=runnerPlan({...capacity,profile,scenario});
      assert.equal(plan.runner_profile,'hosted');
      for(const lane of ['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'])
        assert.deepEqual(plan[lane],['ubuntu-24.04']);
      assert.equal(plan.visual_hosted,scenario==='platform');
    }
  }
  assert.throws(()=>runnerPlan({profile:'invalid'}));
});
test('artifact provenance rejects another commit, run, build profile, lockfile or modified content',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ci-artifact-'));
  try {
    writeFileSync(join(dir,'index.html'),'built bytes');
    const expected={schemaVersion:1,sha:'a'.repeat(40),runId:'123',kind:'frontend',lockDigest:'lock'};
    const digest=treeDigest(dir), manifest={...expected,contentDigest:digest};
    verifyManifest(manifest,expected,digest);
    for(const key of Object.keys(expected)) assert.throws(()=>verifyManifest({...manifest,[key]:'wrong'},expected,digest),/mismatch/);
    writeFileSync(join(dir,'index.html'),'other bytes');
    assert.throws(()=>verifyManifest(manifest,expected,treeDigest(dir)),/content mismatch/);
    symlinkSync(join(dir,'index.html'),join(dir,'link'));
    assert.throws(()=>treeDigest(dir),/symlinks/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('media grouping retains exact selected coverage and rejects incomplete or duplicated groups',()=>{
  const selected=['media2','video_core','media7','situational_video','situational_branching'];
  assert.deepEqual(mediaPlan(selected),['images-video','cognitive-situational']);
  validateMediaPlan(selected,['images-video','cognitive-situational']);
  for(const groups of [[],['images-video'],['images-video','images-video'],['cognitive-situational','images-video']])
    assert.throws(()=>validateMediaPlan(selected,groups));
  for(const selected of [[],['other'],['media2','media2']]) assert.throws(()=>mediaPlan(selected));
});
function serviceFixture() {
  const pg='a'.repeat(64),redis='b'.repeat(64);
  return {env:{CI:'true',GITHUB_ACTIONS:'true',NODE_ENV:'test',GITHUB_RUN_ID:'123',DATABASE_URL:'postgresql://ptool:ptool123@localhost:5432/ptool?schema=public',REDIS_URL:'redis://localhost:6379',CI_POSTGRES_SERVICE_ID:pg,CI_REDIS_SERVICE_ID:redis},
    services:{postgres:{id:pg},redis:{id:redis}},
    postgres:{Id:pg,Config:{Image:'postgres:16.15-bookworm',Env:['POSTGRES_USER=ptool','POSTGRES_PASSWORD=ptool123','POSTGRES_DB=ptool']},Mounts:[{Type:'volume',Name:'c'.repeat(64)}]},
    redis:{Id:redis,Config:{Image:'redis:7.4.11-bookworm'},Mounts:[]}};
}
test('media isolation reset rejects non-job databases, foreign containers and persistent mounts',()=>{
  const f=serviceFixture(); assertMediaServices(f.env,f.services,f.postgres,f.redis);
  for(const override of [{CI:'false'},{GITHUB_ACTIONS:'false'},{NODE_ENV:'production'},{GITHUB_RUN_ID:''},{DATABASE_URL:'postgresql://prod.example/app'},{REDIS_URL:'redis://prod.example:6379'},{CI_POSTGRES_SERVICE_ID:'d'.repeat(64)}])
    assert.throws(()=>assertMediaServices({...f.env,...override},f.services,f.postgres,f.redis));
  for(const pg of [{...f.postgres,Id:'e'.repeat(64)},{...f.postgres,Config:{...f.postgres.Config,Image:'production-image'}},{...f.postgres,Mounts:[{Type:'bind',Source:'/production'}]},{...f.postgres,Mounts:[{Type:'volume',Name:'retained-production-data'}]}])
    assert.throws(()=>assertMediaServices(f.env,f.services,pg,f.redis));
  assert.throws(()=>assertMediaServices(f.env,{...f.services,postgres:{id:'f'.repeat(64)}},f.postgres,f.redis));
});
test('Mac browser runtime uses the same pinned Playwright build without installing backend packages',()=>{
  const browser=JSON.parse(readFileSync(new URL('../../ci/browser/package-lock.json',import.meta.url)));
  const backend=JSON.parse(readFileSync(new URL('../../server-version/backend/package-lock.json',import.meta.url)));
  assert.equal(browser.packages['node_modules/playwright-core'].version,backend.packages['node_modules/playwright-core'].version);
  assert.equal(browser.packages['node_modules/playwright-core'].integrity,backend.packages['node_modules/playwright-core'].integrity);
  assert.deepEqual(Object.keys(browser.packages),['','node_modules/playwright-core']);
});

test('temporary browser cleanup cannot target a personal directory or another checkout',()=>{
  const home='/Users/eduk12ci';
  assertRunnerTemp(home,home+'/actions-runner/_work/_temp');
  for(const path of ['/Users/Qiang/Library/Caches',home+'/actions-runner/_work/repo/repo',home+'/actions-runner/_work/_temp/..'])
    assert.throws(()=>assertRunnerTemp(home,path));
});
