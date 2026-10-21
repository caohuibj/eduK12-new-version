import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontendPerformanceScope,requireFrontendPerformanceScope,frontendPerformanceFiles,frontendPerformanceTools,acceptanceFor} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const root='server-version/frontend/src/';
const entry=(file,overrides={})=>({file,status:'M',oldMode:'100644',newMode:'100644',...overrides});
const webp=Buffer.alloc(20);webp.write('RIFF');webp.writeUInt32LE(12,4);webp.write('WEBPVP8 ',8);
const read=()=>webp;

test('only complete bounded UI optimization and explicit control edits qualify',()=>{
  const files=[...frontendPerformanceFiles,...frontendPerformanceTools].map(file=>entry(file));
  assert.equal(frontendPerformanceScope(files,read),true);
  assert.equal(frontendPerformanceScope([],read),false);
  assert.equal(frontendPerformanceScope([...frontendPerformanceTools].map(file=>entry(file)),read),false);
  for(const file of ['server-version/backend/src/index.ts','server-version/backend/prisma/schema.prisma',
    'server-version/frontend/package-lock.json','server-version/frontend/vite.config.ts',
    root+'api/client.ts',root+'services/persistence/finalDraftStore.ts',root+'modules/cognitive/scoring.ts',
    root+'school/huischool-campus-sunlight.png',root+'school/unknown.webp','.github/workflows/ci-frontend.yml',
    '.github/workflows/ci-images.yml','.github/scripts/unknown.mjs',root+'../backend.ts'])
    assert.equal(frontendPerformanceScope([entry(root+'main.tsx'),entry(file)],read),false,file);
});
test('deletions, rename sides, symlinks and executable modes are not admitted',()=>{
  for(const overrides of [{status:'D',newMode:'000000'},{status:'R'},{status:'T',newMode:'120000'},
    {newMode:'100755'},{oldMode:'100755'},{status:'A',oldMode:'100644'}])
    assert.equal(frontendPerformanceScope([entry(root+'main.tsx',overrides)],read),false);
  assert.equal(frontendPerformanceScope([entry(root+'product-entry.ts',{status:'A',oldMode:'000000'})],read),true);
});
test('static WebP must have real container and codec signature and exact RIFF size',()=>{
  const files=[entry(root+'school/huischool-campus-sunlight.webp',{status:'A',oldMode:'000000'})];
  assert.equal(frontendPerformanceScope(files,read),true);
  for(const bytes of [Buffer.from('not an image'),Buffer.alloc(20),webp.subarray(0,16),Buffer.concat([webp,Buffer.alloc(1)]),
    Buffer.from(webp.toString('binary').replace('VP8 ','HTML'),'binary')])
    assert.equal(frontendPerformanceScope(files,()=>bytes),false);
});
const outputs={application_route:'legacy',scenario:'frontend-performance',frontend:'true',frontend_build:'true',codeql:'true',
  runner_profile:'hosted',media_selection:'[]',media_groups:'[]',...Object.fromEntries([
  'maintenance','content','presentation','frontend_test','documentation','ui_required','visual_hosted',...Object.keys(acceptanceFor([]))].map(k=>[k,'false']))};
const needs={scope:{result:'success',outputs}};
for(const key of requiredChecks(needs,false)) needs[key]={...needs[key],result:'success'};
test('every existing selected job must genuinely succeed and draft never qualifies',()=>{
  assert.deepEqual(requiredChecks(needs,false),['scope','frontend','frontend-build','docker','codeql']);
  assert.deepEqual(failedChecks(needs,false),[]);
  assert.ok(failedChecks(needs,true).includes('scope'));
  for(const key of requiredChecks(needs,false)) for(const result of ['failure','cancelled','skipped',undefined])
    assert.ok(failedChecks({...needs,[key]:{...needs[key],result}},false).includes(key),`${key}: ${result}`);
  for(const key of Object.keys(outputs).filter(k=>['true','false'].includes(outputs[k])))
    assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,[key]:outputs[key]==='true'?'false':'true'}}},false).includes('scope'),key);
});
test('same frontend-build owns browser smoke; image security and full frontend checks remain',()=>{
  const workflow=readFileSync('.github/workflows/ci.yml','utf8');
  const build=readFileSync('.github/workflows/ci-frontend-build.yml','utf8');
  assert.match(workflow,/performance_smoke: \$\{\{ needs.scope.outputs.scenario == 'frontend-performance' \}\}/);
  assert.match(build,/run: node \.github\/scripts\/frontend-performance-browser\.mjs/);
  assert.ok(build.indexOf('npm run build')<build.indexOf('frontend-performance-browser.mjs'));
  assert.match(workflow,/frontend_only: \$\{\{ needs.scope.outputs.frontend == 'true' \}\}/);
  for(const job of ['browser','backend-browser-build','post-merge-smoke']) {
    const section=workflow.slice(workflow.indexOf('\n  '+job+':')+1).split(/\n  [a-z][a-z-]+:/)[0];
    assert.match(section,/scenario != 'frontend-performance'/,job);
  }
  assert.match(readFileSync('.github/workflows/ci-frontend.yml','utf8'),/run: npm test/);
  assert.match(readFileSync('.github/workflows/ci-images.yml','utf8'),/severity: CRITICAL,HIGH/);
  assert.match(readFileSync('.github/scripts/merge-gate.mjs','utf8'),/frontendPerformanceScope\(changedEntries\(process.env.CI_BASE_SHA\)/);
});

test('known optimization branch refuses full fallback on scope drift',()=>{
  const admitted=frontendPerformanceScope([entry(root+'main.tsx'),entry('server-version/backend/src/index.ts')],read);
  assert.equal(admitted,false);
  assert.throws(()=>requireFrontendPerformanceScope(true,admitted),/scope drift/);
  assert.doesNotThrow(()=>requireFrontendPerformanceScope(true,true));
  assert.doesNotThrow(()=>requireFrontendPerformanceScope(false,false));
  assert.match(readFileSync('.github/workflows/ci.yml','utf8'),/CI_FRONTEND_PERFORMANCE_REQUIRED:.*perf\/frontend-startup-catalog-20261021/);
});
