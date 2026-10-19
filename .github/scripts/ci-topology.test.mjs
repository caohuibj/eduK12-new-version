import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { runnerPlan } from './content-scope.mjs';
import { treeDigest, verifyManifest } from './ci-artifact.mjs';
import { mediaPlan, validateMediaPlan } from './ci-media-plan.mjs';
import { assertRunnerTemp } from './mac-ci-cleanup.mjs';
import { assertMediaServices } from './ci-reset-media-services.mjs';
const capacity={macEnabled:true,os:'darwin',freeBytes:10*1024**3};
test('Draft maintenance and all component probes use hosted Ubuntu',()=>{
  const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const maintenance=workflow.split('  maintenance:\n')[1]?.split('\n  documentation:')[0];
  assert.match(maintenance??'',/runner_labels: '\["ubuntu-24.04"\]'/);
  const probes=workflow.slice(workflow.indexOf('  probe-frontend-build:'),workflow.indexOf('  scope:'));
  for(const line of probes.split('\n')) {
    if(!/runner_labels:/.test(line))continue;
    assert.match(line,/runner_labels: '\["ubuntu-24.04"\]'/);
  }
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
test('hosted platform consumers preserve independent lanes and full visual coverage',()=>{
  const plan=runnerPlan({...capacity,profile:'hosted',scenario:'platform'});
  for(const lane of ['regression_runner','browser_runner','media_runner','codeql_runner','frontend_runner','heavy_runner','docker_runner'])
    assert.deepEqual(plan[lane],['ubuntu-24.04']);
  assert.equal(plan.visual_hosted,true);
});
test('Training PostgreSQL additions execute against the disposable service and cannot silently skip',()=>{
  const regression=readFileSync(new URL('../workflows/ci-backend-regression.yml',import.meta.url),'utf8');
  const database='postgresql://ptool:ptool123@localhost:5432/ptool?schema=public';
  for(const variable of ['TRAINING_MATERIAL_TEST_DATABASE_URL','RELEASE_INTEGRATION_DATABASE_URL','INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL'])
    assert.ok(regression.includes(`${variable}: ${database}`),`${variable} must select the isolated job database`);
  assert.match(regression,/TRAINING_MATERIAL_ISOLATED_DB: '1'/);
  const required=regression.split('name: hosted critical integration suites must not skip')[1]?.split('      - name:')[0]??'';
  assert.match(required,/if: inputs\.focus == 'full'/);
  assert.match(required,/node scripts\/assert-release-test-report\.mjs \/tmp\/eduk12-backend-vitest\.json/);
  for(const file of ['migration/training-material-allocation','integration/sjt-image-retention','scale/scale-import'])
    assert.ok(required.includes(`src/__tests__/${file}.postgres.integration.test.ts`),`${file} must be present and non-skipped`);
});
test('mandatory integration report rejects collected suites without executed assertions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ci-required-suite-'));
  const required='src/__tests__/integration/required.postgres.integration.test.ts';
  const script=new URL('../../server-version/backend/scripts/assert-release-test-report.mjs',import.meta.url).pathname;
  try {
    for(const [assertions,expected] of [[undefined,1],[[],1],[[{status:'skipped'}],1],[[{status:'pending'}],1],[[{status:'passed'}],0]]) {
      const report=join(dir,'report.json');
      writeFileSync(report,JSON.stringify({testResults:[{name:required,assertionResults:assertions}]}));
      const result=spawnSync(process.execPath,[script,report,required],{encoding:'utf8'});
      assert.equal(result.status,expected,result.stderr||result.stdout);
      const receipt=JSON.parse(result.stdout);
      assert.equal(receipt.ok,expected===0);
      if(!assertions?.length)assert.deepEqual(receipt.empty,[required]);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('C20 products acceptance retains tested artifacts, strict HTTPS and private restore scratch',()=>{
  const workflow=readFileSync(new URL('../workflows/ci-browser.yml',import.meta.url),'utf8');
  const step=workflow.split('name: Training material lifecycle and populated restore acceptance')[1]?.split('      - name:')[0]??'';
  assert.match(step,/if: matrix\.group == 'products'/);
  assert.match(step,/CI_POSTGRES_SERVICE_ID: \$\{\{ job\.services\.postgres\.id \}\}/);
  assert.match(step,/TRAINING_HTTPS_SCENARIO: materials/);
  for(const command of ['node e2e/training-materials-fixture.cjs bootstrap','node scripts/runtime-role-contract.mjs verify-current','node backend/dist/index.js','python3 e2e/training-optional-https.py','node e2e/training-materials-restore.mjs'])
    assert.ok(step.includes(command),command);
  assert.doesNotMatch(step,/npm (?:run build|ci)|continue-on-error|scripts\/recovery\//);
  assert.match(workflow,/name: Training optional Form authenticated browser and CSV acceptance/);
  const https=readFileSync(new URL('../../server-version/e2e/training-optional-https.py',import.meta.url),'utf8');
  assert.match(https,/'optional-form': 'e2e\/training-optional-form-browser\.cjs'/);
  assert.match(https,/'materials': 'e2e\/training-materials-browser\.cjs'/);
  assert.match(https,/assert scenario in SCENARIOS/);
  assert.match(https,/get\('TRAINING_HTTPS_SCENARIO', 'optional-form'\)/);
  const browser=readFileSync(new URL('../../server-version/e2e/training-materials-browser.cjs',import.meta.url),'utf8');
  assert.doesNotMatch(https+browser,/ignoreHTTPSErrors|ignore-certificate-errors|NODE_TLS_REJECT_UNAUTHORIZED|route\.fulfill/);
  const upload=workflow.split('name: upload seeded browser evidence')[1]?.split('      - name:')[0]??'';
  assert.match(upload,/\/tmp\/eduk12-training-materials-e2e/);
  assert.doesNotMatch(upload,/PRIVATE_DIR|fixture\.json|populated\.dump|training-materials-private/);
  const fixture=readFileSync(new URL('../../server-version/e2e/training-materials-fixture.cjs',import.meta.url),'utf8');
  assert.match(fixture,/FROM pg_index x/);
  assert.match(fixture,/training_material_claim_reservation_key/);
  assert.match(fixture,/return \{ rows, functions, triggers, constraints, indexes \}/);
  assert.match(fixture,/\['composite_id', 'publication_key', 'config_digest', 'group_key', 'reservation_ordinal'\]/);
});
test('scoped scenarios retain their existing visual topology on hosted Ubuntu',()=>{
  for(const scenario of ['content','content-frontend','frontend','presentation','documentation','dependencies']) {
    const plan=runnerPlan({...capacity,profile:'local',scenario});
    for(const lane of ['regression_runner','browser_runner','media_runner']) assert.deepEqual(plan[lane],['ubuntu-24.04']);
    assert.equal(plan.visual_hosted,false);
  }
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
