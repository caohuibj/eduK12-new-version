import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, frontendFile, acceptanceFor, documentationFile, runnerPlan } from './content-scope.mjs';
function scopeOutputs(content='false', presentation='false', frontend='false', extra={}) {
  const scenario = extra.scenario ?? (content === 'true' ? (frontend === 'true' ? 'content-frontend' : 'content') : presentation === 'true' ? 'presentation' : frontend === 'true' ? 'frontend' : 'platform');
  const output = {...Object.fromEntries(Object.keys(acceptanceFor([])).map(key=>[key,scenario === 'platform' ? 'true' : 'false'])),
    content,presentation,frontend,documentation:'false',codeql:frontend === 'true' || (content !== 'true' && presentation !== 'true') ? 'true' : 'false',scenario,runner_profile:'speed',...extra};
  const selected=['media2','video_core','media7','situational_video','situational_branching'].filter(key=>output[key] === 'true');
  const groups=Object.entries({'images-video':['media2','video_core'],'cognitive-situational':['media7','situational_video','situational_branching']}).filter(([,keys])=>keys.some(key=>selected.includes(key))).map(([group])=>group);
  const ui=output.app_shell === 'true' || output.canonical_visual === 'true';
  return {...output,frontend_build:String(frontend === 'true' || scenario === 'platform' || ui || selected.length>0),ui_required:String(ui),visual_hosted:String(output.runner_profile === 'speed' && scenario === 'platform'),media_selection:JSON.stringify(selected),media_groups:JSON.stringify(groups)};
}

const root = 'server-version/backend/src/modules/';
const scale = `${root}scale/instruments/new_scale/1.0.0/instrument.ts`;
const cognitive = `${root}cognitive/tasks/STROOP/seeds.ts`;
const sjt = `${root}situational/instruments/new-sjt/1.0.0/instrument.json`;
test('all three content domains and combined content qualify', () => {
  for (const file of [scale, cognitive, sjt]) assert.equal(classify([file]).content, true);
  assert.deepEqual(classify([scale, cognitive, sjt]), { documentation:false, content: true, frontend: false, presentation: false, domains: ['cognitive', 'scale', 'situational'] });
});
test('empty, core, executable additions and mixed changes require full checks', () => {
  assert.equal(classify([]).content, false);
  assert.equal(classify([]).presentation, false);
  for (const file of ['.github/workflows/ci.yml', 'server-version/backend/package-lock.json',
    `${root}scale/instruments/catalog-defaults.ts`, `${root}scale/scale-scoring.ts`,
    `${root}cognitive/tasks/STROOP/package.ts`, `${root}cognitive/tasks/STROOP/task-package.json`,
    `${root}situational/instruments/new-sjt/1.0.0/scorer.ts`,
    `${root}scale/instruments/../scale-scoring.ts`, 'server-version/backend/prisma/schema.prisma']) {
    assert.equal(classify([scale, file]).content, false, file);
  }
});

import { requiredChecks, failedChecks } from './merge-gate.mjs';
test('aggregate checks only selected jobs, and fails closed for every selected job', () => {
  assert.ok(requiredChecks({ scope: { outputs: scopeOutputs() } }, false).includes('backend-regression'));
  for (const [content, presentation, draft] of [
    ['true', 'false', false],
    ['true', 'false', true],
    ['false', 'true', false],
    ['false', 'true', true],
    ['false', 'false', true],
    ['false', 'false', false],
  ]) {
    const needs = { scope: { outputs: scopeOutputs(content, presentation), result: 'success' } };
    for (const job of requiredChecks(needs, draft)) needs[job] = { ...needs[job], result: 'success' };
    assert.deepEqual(failedChecks(needs, draft), []);
    for (const job of requiredChecks(needs, draft)) {
      for (const result of ['failure', 'skipped', 'cancelled', undefined]) {
        assert.ok(failedChecks({ ...needs, [job]: { ...needs[job], result } }, draft).includes(job));
      }
    }
  }
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedFiles } from './content-scope.mjs';
test('real git diff retains both rename sides and all files beyond API path limits', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-scope-'));
  const cwd = process.cwd();
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    writeFileSync(join(root, 'core.ts'), 'shared code');
    git('add', '.');
    git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(dirname(join(root, scale)), { recursive: true });
    renameSync(join(root, 'core.ts'), join(root, scale));
    for (let i = 0; i < 310; i++) writeFileSync(join(dirname(join(root, scale)), `${i}.json`), '{}');
    git('add', '.');
    git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'move and add');
    process.chdir(root);
    const files = changedFiles(base);
    assert.equal(files.length, 312);
    assert.ok(files.includes('core.ts'));
    assert.ok(files.includes(scale));
    assert.equal(classify(files).content, false);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

import { chmodSync, symlinkSync, unlinkSync } from 'node:fs';
import { classifyChanges, changedEntries, parseChangedEntries } from './content-scope.mjs';
test('malformed classification output never authorizes a passing aggregate', () => {
  for (const bad of [undefined, '', 'TRUE', ' true', true, 'bundle']) {
    for (const outputs of [
      scopeOutputs('false','false','false',{content:bad}),
      scopeOutputs('false','false','false',{presentation:bad}),
    ]) {
      const needs = { scope: { result: 'success', outputs } };
      for (const name of requiredChecks(needs, false)) needs[name] = { ...needs[name], result: 'success' };
      assert.ok(failedChecks(needs, false).includes('scope'));
    }
  }
});
test('Git record parser rejects incomplete, renamed or unsupported records', () => {
  const hash = 'a'.repeat(40);
  for (const raw of ['\0', ':garbage\0file\0', `:100644 100644 ${hash} ${hash} M\0file`,
    `:100644 100644 ${hash} ${hash} R100\0old\0new\0`]) {
    assert.throws(() => parseChangedEntries(raw));
  }
  assert.deepEqual(parseChangedEntries(''), []);
});
test('noncanonical paths stay full', () => {
  for (const file of [scale.replace('/instruments/', '//instruments/'), scale + '\n',
    scale.replace('new_scale', '.'), scale.replace('new_scale', '..'), scale.replace('/', '\\')]) assert.equal(classify([file]).content, false, file);
});
test('actual Git metadata forces deletion, symlink, executable and move changes to platform route', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-modes-'));
  const cwd = process.cwd();
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture'); };
  try {
    git('init', '-q'); git('config', 'core.filemode', 'true');
    mkdirSync(dirname(join(dir, sjt)), { recursive: true });
    writeFileSync(join(dir, sjt), '{}'); commit();
    const base = git('rev-parse', 'HEAD');
    process.chdir(dir);
    const reset = () => git('reset', '--hard', base);
    writeFileSync(join(dir, sjt), '{"updated":true}'); commit();
    assert.equal(classifyChanges(changedEntries(base)).content, true);
    reset(); unlinkSync(join(dir, sjt)); commit();
    assert.equal(classifyChanges(changedEntries(base)).content, false);
    reset(); unlinkSync(join(dir, sjt)); symlinkSync('publication.json', join(dir, sjt)); commit();
    assert.equal(classifyChanges(changedEntries(base)).content, false);
    reset(); chmodSync(join(dir, sjt), 0o755); commit();
    assert.equal(classifyChanges(changedEntries(base)).content, false);
    reset(); renameSync(join(dir, sjt), join(dirname(join(dir, sjt)), 'publication.json')); commit();
    const moved = changedEntries(base);
    assert.equal(moved.length, 2);
    assert.equal(classifyChanges(moved).content, false);
    reset(); writeFileSync(join(dirname(join(dir, sjt)), 'scientific.json'), '{}'); commit();
    assert.equal(classifyChanges(changedEntries(base)).content, true);
    assert.throws(() => changedEntries('bad-base'));
    assert.throws(() => changedEntries('f'.repeat(40)));
    assert.throws(() => changedEntries(base, '--stat'));
  } finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }
});

const bundle = `${root}assessment-bundle/packages/example/1.0.0/manifest.json`;
test('Bundle exact files and cross-domain union qualify; arbitrary package files do not', () => {
  assert.equal(classify([bundle]).content, true);
  assert.deepEqual(classify([bundle, scale, cognitive, sjt]).domains, ['bundle', 'cognitive', 'scale', 'situational']);
  for (const file of ['rules.json', 'report.json', 'context.json', 'fixtures/valid.json', 'fixtures/not-applicable.json'])
    assert.equal(classify([bundle.replace('manifest.json', file)]).content, true);
  for (const file of ['engine.ts', 'rules.js', 'README.md', 'fixtures/extra.json', 'nested/report.json'])
    assert.equal(classify([bundle.replace('manifest.json', file)]).content, false);
  for (const file of ['.github/workflows/ci.yml', 'server-version/backend/package-lock.json', `${root}assessment-bundle/onboarding/contract.ts`])
    assert.equal(classify([bundle, file]).content, false);
  assert.equal(classify([`${root}assessment-bundle/generated/packages.json`]).content, true);
  assert.equal(classify([`${root}assessment-bundle/ci-fixtures/example/1.0.0.json`]).content, true);
});

test('force full can only strengthen the selected route', () => {
  const entry = {file: bundle, status: 'A', oldMode: '000000', newMode: '100644'};
  assert.equal(classifyChanges([entry]).content, true);
  assert.equal(classifyChanges([entry], true).content, false);
  assert.equal(classifyChanges([{...entry, file: 'core.ts'}], true).content, false);
});

test('presentation-only classification is narrow and fail-closed', () => {
  const css = 'server-version/frontend/src/components/student-ui/student-ui.css';
  const scss = 'server-version/frontend/src/styles/mobile.scss';
  const doc = 'server-version/docs/frontend-modern-education.md';
  for (const file of [css, scss, doc]) {
    const result = classify([file]);
    assert.equal(result.presentation, true, file);
    assert.equal(result.content, false, file);
  }
  assert.equal(classify([css, doc]).presentation, true);
  for (const file of [
    'server-version/frontend/src/pages/student/StudentHome.tsx',
    'server-version/frontend/package.json',
    'server-version/frontend/vite.config.ts',
    '.github/workflows/ci.yml',
    'server-version/docs/backend-modern-education.md',
    'server-version/frontend/src/styles/../api.ts',
    'server-version/frontend/src/styles/theme.css\n',
  ]) assert.equal(classify([css, file]).presentation, false, file);

  const regular = { file: css, status: 'M', oldMode: '100644', newMode: '100644' };
  assert.equal(classifyChanges([regular]).presentation, true);
  assert.equal(classifyChanges([regular], true).presentation, false);
  assert.equal(classifyChanges([{ ...regular, status: 'D', newMode: '000000' }]).presentation, false);
});

test('manual dispatch forces platform checks even with no base SHA', () => {
  const output = execFileSync(process.execPath, [new URL('./content-scope.mjs', import.meta.url).pathname], {
    encoding: 'utf8', env: {...process.env, CI_EVENT:'workflow_dispatch', CI_BASE_SHA:'', GITHUB_OUTPUT:''},
  });
  assert.equal(JSON.parse(output).content, false);
});

test('platform mini gate cannot be skipped for draft or ready PR', () => {
  for (const draft of [true, false]) {
    const needs = { scope: { outputs: scopeOutputs(), result: 'success' } };
    assert.ok(requiredChecks(needs, draft).includes('miniprogram'));
    for (const name of requiredChecks(needs, draft)) needs[name] = { ...needs[name], result: 'success' };
    assert.ok(failedChecks({ ...needs, miniprogram: { result: 'skipped' } }, draft).includes('miniprogram'));
  }
});

test('UI-only route saves backend regression but retains real API browser, Docker and SAST', () => {
  const files = ['server-version/frontend/src/pages/student/StudentHome.tsx',
    'server-version/frontend/src/components/student-ui/student-ui.css'];
  const result = classify(files);
  assert.equal(result.frontend, true); assert.equal(result.content, false);
  const needs = {scope: {result:'success', outputs:scopeOutputs('false','false','true')}};
  assert.deepEqual(requiredChecks(needs,false), ['scope','backend-browser-build','frontend','browser','docker','frontend-build','codeql']);
  for (const job of requiredChecks(needs,false)) needs[job] = {...needs[job],result:'success'};
  assert.deepEqual(failedChecks(needs,false),[]);
  for (const job of requiredChecks(needs,false))
    for (const result of ['skipped','cancelled','failure',undefined])
      assert.ok(failedChecks({...needs,[job]:{result}},false).includes(job));
});
test('measurement runtimes, timing/scoring, dependencies, schema and CI cannot use frontend route', () => {
  const ui = 'server-version/frontend/src/pages/Portal.tsx';
  for (const file of ['server-version/frontend/src/modules/cognitive/pages/CognitiveRunner.tsx',
    'server-version/frontend/src/modules/situational/runtime.ts',
    'server-version/frontend/src/modules/composite/scoring.ts',
    'server-version/frontend/src/services/persistence/finalDraftStore.ts',
    'server-version/frontend/src/utils/scoring.ts',
    'server-version/frontend/src/hooks/trial-timing.ts',
    'server-version/frontend/package-lock.json', 'server-version/frontend/vite.config.ts',
    'server-version/backend/prisma/migrations/new/migration.sql',
    'server-version/backend/src/routes/auth.ts', '.github/config/acceptance-scopes.json',
    '.github/scripts/content-scope.mjs']) {
    assert.equal(classify([ui,file]).frontend,false,file);
  }
});
test('mixed declaration content and UI requires union of content, browser and frontend gates', () => {
  const ui = 'server-version/frontend/src/pages/Portal.tsx';
  const result = classify([sjt, ui]);
  assert.equal(result.content,true); assert.equal(result.frontend,true);
  const needs = {scope:{result:'success',outputs:scopeOutputs('true','false','true')}};
  assert.ok(requiredChecks(needs,false).includes('content'));
  assert.ok(requiredChecks(needs,false).includes('browser'));
  assert.ok(!requiredChecks(needs,false).includes('backend-regression'));
  assert.equal(classify([sjt,ui,'server-version/backend/src/routes/auth.ts']).content,false);
  assert.equal(classify([sjt,ui,'server-version/backend/src/routes/auth.ts']).frontend,false);
});
test('selected acceptance failures and malformed flags cannot hide behind a successful main CI', () => {
  const outputs = scopeOutputs('false','false','true',{media7:'true',canonical_visual:'true'});
  const needs = {scope:{result:'success',outputs}};
  for(const name of requiredChecks(needs,false)) needs[name]={...needs[name],result:'success'};
  assert.ok(requiredChecks(needs,false).includes('accept-media'));
  assert.ok(requiredChecks(needs,false).includes('accept-ui'));
  assert.deepEqual(failedChecks(needs,false),[]);
  for (const result of ['failure','skipped','cancelled',undefined])
    assert.ok(failedChecks({...needs,'accept-media':{result}},false).includes('accept-media'));
  assert.ok(!requiredChecks(needs,true).includes('accept-media'));
  for(const extra of [{frontend:undefined},{scenario:'content'},{media7:'TRUE'},{canonical_visual:undefined}])
    assert.ok(failedChecks({...needs,scope:{...needs.scope,outputs:{...outputs,...extra}}},false).includes('scope'));
});
test('deletions, executable UI, empty and forced changes never authorize frontend fast path', () => {
  const file='server-version/frontend/src/pages/Portal.tsx';
  const regular={file,status:'M',oldMode:'100644',newMode:'100644'};
  assert.equal(classifyChanges([regular]).frontend,true);
  assert.equal(classifyChanges([regular],true).frontend,false);
  for(const entry of [{...regular,status:'D',newMode:'000000'},{...regular,newMode:'100755'},{...regular,newMode:'120000'}])
    assert.equal(classifyChanges([entry]).frontend,false);
  assert.equal(classify([]).frontend,false);
  for(const bad of [file.replace('/src/','//src/'), file+'\n', file.replace('pages','..')])
    assert.equal(frontendFile(bad),false,bad);
});
test('content governance closure retains all Bundles and focused acceptance scopes retain negative patterns', () => {
  assert.equal(acceptanceFor(['server-version/backend/src/modules/situational/instruments/new/1.0.0/instrument.json']).situational_video,false);
  assert.equal(acceptanceFor(['server-version/backend/src/modules/situational/situational-final-submit.service.ts']).situational_video,true);
  assert.equal(acceptanceFor(['server-version/backend/prisma/migrations/new/migration.sql']).ops,true);
  assert.equal(acceptanceFor(['server-version/frontend/src/pages/Portal.tsx']).canonical_visual,true);
});

test('CLI emits separate GITHUB_OUTPUT records and JSON runner labels, never literal newline escapes',()=>{
  const root=mkdtempSync(join(tmpdir(),'ci-outputs-'));
  const output=join(root,'outputs');
  try{
    execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{
      env:{...process.env,CI_EVENT:'workflow_dispatch',CI_RUNNER_PROFILE:'hybrid',CI_MAC_LIGHT_ENABLED:'',GITHUB_OUTPUT:output},encoding:'utf8'});
    const rows=readFileSync(output,'utf8').trim().split('\n');
    assert.ok(rows.length>=19);
    const fields=Object.fromEntries(rows.map(row=>[row.slice(0,row.indexOf('=')),row.slice(row.indexOf('=')+1)]));
    assert.equal(fields.scenario,'platform'); assert.equal(fields.frontend,'false');
    assert.deepEqual(JSON.parse(fields.heavy_runner),['self-hosted','Linux','X64','eduk12-win-ci']);
    assert.deepEqual(JSON.parse(fields.codeql_runner),['ubuntu-24.04']);
    assert.throws(()=>execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{
      env:{...process.env,CI_EVENT:'workflow_dispatch',CI_RUNNER_PROFILE:'typo',GITHUB_OUTPUT:''},stdio:'pipe'}));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('API contracts, persistence and measurement inputs never use the UI shortcut',()=>{
  for(const path of ['api/materialGrants.ts','types/index.ts','services/completionRetry.ts',
    'modules/assessment-context/options.ts','components/reference-data.json','utils/scoring.ts'])
    assert.equal(frontendFile('server-version/frontend/src/'+path),false,path);
});

test('runner profiles preserve Mac disk fallback and Windows images',()=>{
  const GiB=1024**3;
  for(const profile of ['speed','economy','local','balanced','hybrid']) {
    const ready=runnerPlan({profile,macEnabled:true,os:'darwin',freeBytes:9*GiB});
    assert.deepEqual(ready.frontend_runner,['self-hosted','macOS','eduk12-mac-ci']);
    assert.deepEqual(ready.light_runner,ready.frontend_runner);
    assert.deepEqual(ready.docker_runner,['self-hosted','Linux','X64','eduk12-win-ci']);
    assert.deepEqual(ready.codeql_runner,['ubuntu-24.04']);
    for(const overrides of [{freeBytes:7*GiB},{macEnabled:false},{os:'linux'}]) {
      const fallback=runnerPlan({profile,macEnabled:true,os:'darwin',freeBytes:9*GiB,...overrides});
      assert.deepEqual(fallback.frontend_runner,fallback.heavy_runner);
    }
  }
  assert.throws(()=>runnerPlan({profile:'hosted'}),/Unsupported CI_RUNNER_PROFILE/);
  assert.throws(()=>runnerPlan({profile:'typo'}));
});
test('only ordinary documentation qualifies and cannot hide scientific, runbook or executable changes',()=>{
  for(const file of ['README.md','docs/ci-runner-policy.md','docs/development/architecture.md'])
    assert.equal(classifyChanges([{file,oldMode:'100644',newMode:'100644',status:'M'}]).documentation,true);
  for(const file of ['docs/scale-instruments/scientific.md','server-version/DEPLOYMENT-CHECKLIST.md',
    'docs/miniprogram-v2/release-runbook.md','docs/development/scorer.ts','docs/development/../secret.md'])
    assert.equal(documentationFile(file),false,file);
  assert.equal(classify(['README.md',scale]).documentation,false);
  assert.equal(classifyChanges([{file:'README.md',oldMode:'100644',newMode:'000000',status:'D'}]).documentation,false);
});
test('documentation and codeql selections remain explicit and fail closed',()=>{
  const outputs=scopeOutputs('false','false','false',{documentation:'true',codeql:'false',scenario:'documentation'});
  const needs={scope:{result:'success',outputs},documentation:{result:'success'}};
  assert.deepEqual(requiredChecks(needs,false),['scope','documentation']);
  assert.deepEqual(failedChecks(needs,false),[]);
  assert.ok(failedChecks({...needs,documentation:{result:'skipped'}},false).includes('documentation'));
  for(const key of ['documentation','codeql'])
    assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,[key]:undefined}}},false).includes('scope'));
  const platform={scope:{outputs:scopeOutputs('false','false','false',{codeql:'false'}),result:'success'}};
  for(const name of requiredChecks(platform,false)) platform[name]={...platform[name],result:'success'};
  assert.ok(failedChecks(platform,false).includes('scope'));
  const content={scope:{outputs:scopeOutputs('true','false','false',{codeql:'true'}),result:'success'},content:{result:'success'}};
  assert.ok(failedChecks(content,false).includes('codeql'));
});

test('actual Git diffs select different documentation, presentation, content, frontend and heavy execution paths',()=>{
  const fixture=mkdtempSync(join(tmpdir(),'ci-scenarios-'));
  const git=(...args)=>execFileSync('git',args,{cwd:fixture,encoding:'utf8'}).trim();
  try {
    git('init','-q');writeFileSync(join(fixture,'base.txt'),'base\n');git('add','.');
    git('-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-qm','base');
    const base=git('rev-parse','HEAD');
    for(const [file,scenario,codeql] of [
      ['README.md','documentation',false],
      ['server-version/frontend/src/components/Card.css','presentation',false],
      [sjt,'content',false], [cognitive,'content',true],
      ['server-version/frontend/src/pages/Teacher.tsx','frontend',true],
      ['server-version/frontend/src/modules/cognitive/core/runner.ts','platform',true],
      ['server-version/backend/prisma/schema.prisma','platform',true],
      ['.github/workflows/ci.yml','platform',true],
    ]) {
      git('reset','--hard',base);
      const path=join(fixture,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'fixture\n');
      git('add','.');git('-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-qm','case');
      const output=JSON.parse(execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{
        cwd:fixture,encoding:'utf8',env:{...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,
        CI_PR_REPOSITORY:'owner/repo',GITHUB_REPOSITORY:'owner/repo',CI_RUNNER_PROFILE:'local',
        CI_MAC_LIGHT_ENABLED:'false',CI_FORCE_FULL:'false',GITHUB_OUTPUT:''},
      }).trim());
      assert.equal(output.scenario,scenario,file);assert.equal(output.codeql,codeql,file);
      const outputs=Object.fromEntries(Object.entries(output).map(([key,value])=>[key,String(value)]));
      const needs={scope:{result:'success',outputs}};
      for(const name of requiredChecks(needs,false)) needs[name]={...needs[name],result:'success'};
      assert.deepEqual(failedChecks(needs,false),[],file);
      assert.deepEqual(JSON.parse(output.docker_runner),['self-hosted','Linux','X64','eduk12-win-ci']);
    }
  } finally {rmSync(fixture,{recursive:true,force:true});}
});
