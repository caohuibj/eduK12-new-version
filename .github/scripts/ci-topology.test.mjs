import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runnerPlan } from './content-scope.mjs';
import { treeDigest, verifyManifest } from './ci-artifact.mjs';
import { mediaPlan, validateMediaPlan } from './ci-media-plan.mjs';
import { assertRunnerTemp } from './mac-ci-cleanup.mjs';
import { assertMediaServices } from './ci-reset-media-services.mjs';
const capacity={macEnabled:true,os:'darwin',freeBytes:10*1024**3};
test('local single-step dispatch cannot retain a hard-coded hosted runner',()=>{
  const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const probes=workflow.slice(workflow.indexOf('  probe-frontend-build:'),workflow.indexOf('  scope:'));
  for(const [lineNo,line] of probes.split('\n').entries()) {
    if(!/runner_labels:/.test(line)||!line.includes('ubuntu-24.04'))continue;
    assert.match(line,/inputs\.runner_profile == '(local|speed)'/,`hosted probe runner at line ${lineNo}`);
    assert.match(line,/self-hosted/);
  }
  for(const name of ['probe-backend-regression','probe-browser','probe-media','probe-ui-hosted','probe-maintenance']) {
    const block=probes.split(`  ${name}:\n`)[1]?.split(/\n  [a-z-]+:/)[0];
    assert.match(block??'',/inputs\.runner_profile == 'local'.*self-hosted.*eduk12-win-ci/);
  }
  assert.match(probes,/inputs\.step_probe == 'assessment-repair' && 'assessment-repair'/);
  const regression=readFileSync(new URL('../workflows/ci-backend-regression.yml',import.meta.url),'utf8');
  assert.match(regression,/if: inputs\.focus == 'assessment-repair'[\s\S]*CI_POSTGRES_SERVICE_ID:.*\$\{\{ job\.services\.postgres\.id \}\}[\s\S]*run: node scripts\/r5-regression\.mjs/);
});
test('speed profile assigns independent heavy consumers to hosted Linux and preserves Windows resource exclusivity',()=>{
  const plan=runnerPlan({...capacity,profile:'speed',scenario:'platform'});
  for(const lane of ['regression_runner','browser_runner','media_runner','codeql_runner']) assert.deepEqual(plan[lane],['ubuntu-24.04']);
  assert.deepEqual(plan.frontend_runner,['self-hosted','macOS','eduk12-mac-ci']);
  assert.deepEqual(plan.heavy_runner,['self-hosted','Linux','X64','eduk12-win-ci']);
  assert.deepEqual(plan.docker_runner,plan.heavy_runner);assert.equal(plan.visual_hosted,true);
});
test('light and medium scenarios do not spend hosted heavy acceleration minutes',()=>{
  for(const scenario of ['content','content-frontend','frontend','presentation','documentation']) {
    const plan=runnerPlan({...capacity,profile:'speed',scenario});
    for(const lane of ['regression_runner','browser_runner','media_runner']) assert.deepEqual(plan[lane],plan.heavy_runner);
    assert.equal(plan.visual_hosted,false);
  }
  const economy=runnerPlan({...capacity,profile:'economy'});
  assert.deepEqual(economy.regression_runner,['ubuntu-24.04']);
  assert.deepEqual(economy.media_runner,economy.heavy_runner);assert.equal(economy.visual_hosted,false);
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
