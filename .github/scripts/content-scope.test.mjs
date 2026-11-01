import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, cognitiveMixedProductScope, frontendFile, frontendTestFile, frontendTestOnly, frontendAffected, backendModuleFilesOnly, acceptanceFor, documentationFile, runnerPlan } from './content-scope.mjs';
function scopeOutputs(content='false', presentation='false', frontend='false', extra={}) {
  const scenario = extra.scenario ?? (content === 'true' ? (frontend === 'true' ? 'content-frontend' : 'content') : presentation === 'true' ? 'presentation' : frontend === 'true' ? 'frontend' : 'platform');
  const output = {...Object.fromEntries(Object.keys(acceptanceFor([])).map(key=>[key,scenario === 'platform' ? 'true' : 'false'])),
    maintenance:'false',content,presentation,frontend,frontend_test:String(scenario === 'frontend-test'),documentation:'false',codeql:scenario === 'frontend-test' ? 'false' : frontend === 'true' || (content !== 'true' && presentation !== 'true') ? 'true' : 'false',scenario,runner_profile:'hosted',...extra};
  const selected=['media2','video_core','media7','situational_video','situational_branching'].filter(key=>output[key] === 'true');
  const groups=Object.entries({'images-video':['media2','video_core'],'cognitive-situational':['media7','situational_video','situational_branching']}).filter(([,keys])=>keys.some(key=>selected.includes(key))).map(([group])=>group);
  const ui=output.app_shell === 'true' || output.canonical_visual === 'true';
  return {...output,frontend_build:String(frontend === 'true' && output.frontend_affected !== 'true' || scenario === 'platform' || ui || selected.length>0),ui_required:String(ui),visual_hosted:String(output.runner_profile === 'hosted' && scenario === 'platform'),media_selection:JSON.stringify(selected),media_groups:JSON.stringify(groups)};
}

const root = 'server-version/backend/src/modules/';
const scale = `${root}scale/instruments/new_scale/1.0.0/instrument.ts`;
const cognitive = `${root}cognitive/tasks/STROOP/seeds.ts`;
const sjt = `${root}situational/instruments/new-sjt/1.0.0/instrument.json`;
test('backend modules retain backend qualification without admitting frontend schema or shared API changes',()=>{
  const files=[`${root}campus/group-reports.ts`,'server-version/backend/src/__tests__/campus/group-reports.test.ts','docs/evidence/group/as-run-probe.py','docs/evidence/group/query.sql.gz','docs/evidence/group/SHA256SUMS'];
  assert.equal(backendModuleFilesOnly(files),true);
  assert.equal(backendModuleFilesOnly([`${root}scale/onboarding/report-variants.ts`,`${root}scale/instruments/example/1.0.0/report-variants.json`,'docs/scale-intake/alignment.md']),true);
  for(const file of ['server-version/frontend/src/pages/student/CourseDetail.tsx','server-version/backend/prisma/schema.prisma','server-version/backend/src/routes/scales.ts',`${root}scale/scale.routes.ts`,`${root}assessment-runtime/compiler.ts`,`${root}reporting/schema.ts`,`${root}scale/scale-scoring.ts`,`${root}training/auth.ts`,`${root}parent-portal/authorization.ts`,`${root}survey/identity.service.ts`,'server-version/backend/package-lock.json','server-version/docker-compose.yml','.github/workflows/ci.yml','docs/evidence/group/run.sh'])assert.equal(backendModuleFilesOnly([...files,file]),false,file);
  const entries=files.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
  assert.equal(classifyChanges(entries).backend_modules,true);
  assert.equal(classifyChanges(entries,true).backend_modules,false);
  assert.equal(classifyChanges([{...entries[0],newMode:'120000'}]).backend_modules,false);
});
test('backend module aggregate retains all existing backend jobs and rejects selected failure or missing checks',()=>{
  for(const draft of [true,false]){
    const needs={scope:{result:'success',outputs:scopeOutputs('false','false','false',{scenario:'backend'})}};
    const expected=draft?['scope','pr-light-backend']:['scope','backend','backend-regression','docker','codeql'];
    assert.deepEqual(requiredChecks(needs,draft),expected);
    for(const name of expected)needs[name]={...needs[name],result:'success'};
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const name of expected)for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,[name]:{...needs[name],result}},draft).includes(name));
    assert(failedChecks({...needs,scope:{result:'success',outputs:{...needs.scope.outputs,media2:'true'}}},draft).includes('scope'));
  }
});
test('backend module workflow removes only unrelated outer frontend and acceptance jobs',()=>{
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const block=name=>ci.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0];
  for(const draft of [true,false]){
    const outputs=scopeOutputs('false','false','false',{scenario:'backend',application_route:'legacy'});
    const needs={scope:{result:'success',outputs}};
    const github={event_name:'pull_request',ref_name:'feature/backend',event:{pull_request:{draft,number:1,head:{ref:'feature/backend'}}}};
    for(const name of ['maintenance','pr-light-backend','pr-light-frontend','backend','backend-regression','frontend','frontend-build','browser','backend-browser-build','miniprogram','docker','post-merge-smoke']){
      const expr=block(name).match(/^    if: \$\{\{ (.+) \}\}$/m)[1];
      const actual=new Function('needs','github','vars','cancelled','fromJSON',`return (${expr})`)(needs,github,{CI_FORCE_FULL:'false'},()=>false,JSON.parse);
      assert.equal(Boolean(actual),draft?name==='pr-light-backend':['backend','backend-regression','docker'].includes(name),name+' draft='+draft);
    }
  }
  assert.match(block('codeql'),/BACKEND_MODULES:.*scenario == 'backend'/);
  assert.match(block('codeql'),/BACKEND_MODULES==='true'\?\{paths:\['server-version\/backend\/src'\]\}/);
});
test('backend module CLI classifies a real Git diff without broad frontend acceptance',()=>{
  const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),'backend-route-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=()=>{git('add','.');git('-c','user.name=Scope fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');};
  try{
    git('init','-q');writeFileSync(join(dir,'README.md'),'fixture');commit();const base=git('rev-parse','HEAD');
    const file=join(dir,'server-version/backend/src/modules/campus/group-reports.ts');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'export const fixture=true;');commit();
    process.chdir(dir);
    const env={...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,CI_HEAD_REF:'feature/backend-modules',CI_PR_REPOSITORY:'fixture/repo',GITHUB_REPOSITORY:'fixture/repo',CI_FORCE_FULL:'',GITHUB_OUTPUT:''};
    const result=JSON.parse(execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    assert.equal(result.scenario,'backend');assert.equal(result.application_route,'legacy');assert.equal(result.frontend_build,false);assert.equal(result.codeql,true);assert.equal(result.visual_hosted,false);
    for(const key of Object.keys(acceptanceFor([])))assert.equal(result[key],false,key);
    assert.deepEqual(result.platformReasons,[]);
  }finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
test('engineering records follow the affected component without admitting executable or scientific inputs',()=>{
  const records=['docs/performance/navigation/README.md','docs/evidence/cli/metadata.json','docs/evidence/cli/checks.json.gz'];
  const page='server-version/frontend/src/pages/student/CourseDetail.tsx';
  assert.equal(classify(records).documentation,true);
  assert.equal(classify([page,...records]).frontend,true);
  assert.equal(classify([scale,...records]).content,true);
  assert.equal(classify([page,'docs/scale-instruments/scientific.md']).content,true);
  assert.equal(frontendAffected([page,'docs/scale-instruments/scientific.md']),false);
  for(const file of ['docs/evidence/cli/check.ts','docs/evidence/../secret.md','server-version/backend/src/index.ts'])assert.equal(classify([page,file]).frontend,false,file);
});
test('local page selection keeps shared runtime, explicit media and mixed changes on existing paths',()=>{
  const page='server-version/frontend/src/pages/student/CourseDetail.tsx';
  assert.equal(frontendAffected([page,'server-version/frontend/src/pages/teacher/TeacherCourseDetail.tsx','docs/performance/navigation/README.md']),true);
  for(const file of ['server-version/frontend/src/pages/student/ScaleAssessment.tsx','server-version/frontend/src/components/app-shell/Shell.tsx','server-version/frontend/src/api/course.ts',`${root}cognitive/service.ts`])assert.equal(frontendAffected([page,file]),false,file);
  const entry={file:page,status:'M',oldMode:'100644',newMode:'100644'};
  assert.equal(classifyChanges([entry]).frontend_affected,true);
  assert.equal(classifyChanges([entry],true).frontend_affected,false);
  assert.equal(classifyChanges([{...entry,newMode:'120000'}]).frontend_affected,false);
});
test('affected frontend uses existing jobs and every selected failure remains blocking',()=>{
  for(const draft of [true,false]){
    const needs={scope:{result:'success',outputs:scopeOutputs('false','false','true',{scenario:'frontend',frontend_affected:'true'})}};
    const expected=draft?['scope','frontend']:['scope','frontend','docker','codeql'];
    assert.deepEqual(requiredChecks(needs,draft),expected);
    for(const job of expected)needs[job]={...needs[job],result:'success'};
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const job of expected)for(const result of ['skipped','failure','cancelled',undefined])assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},draft).includes(job));
  }
});
test('affected frontend workflow conditions agree with the existing merge jobs',()=>{
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const block=name=>ci.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0];
  for(const draft of [true,false]){
    const outputs=scopeOutputs('false','false','true',{scenario:'frontend',frontend_affected:'true',application_route:'legacy'});
    const needs={scope:{outputs,result:'success'},'frontend-build':{result:'success'},'backend-browser-build':{result:'success'}};
    const github={event_name:'pull_request',ref_name:'feature/local-page',event:{pull_request:{draft,number:1,head:{ref:'feature/local-page'}}}};
    for(const name of ['frontend','frontend-build','pr-light-frontend','backend-browser-build','browser','docker','post-merge-smoke']){
      const expr=block(name).match(/^    if: \$\{\{ (.+) \}\}$/m)[1];
      const selected=new Function('needs','github','vars','cancelled',`return (${expr})`)(needs,github,{CI_FORCE_FULL:'false'},()=>false);
      assert.equal(Boolean(selected),name==='frontend'||name==='docker'&&!draft,name+' draft='+draft);
    }
  }
  const frontend=readFileSync(new URL('../workflows/ci-frontend.yml',import.meta.url),'utf8');
  assert.match(block('frontend'),/affected_only:.*frontend_affected/);
  assert.match(block('codeql'),/frontend_affected == 'true' && 'paths: \[server-version\/frontend\/src\]'/);
  assert.match(frontend,/\['related','--run',\.\.\.files\]/);
  assert.doesNotMatch(frontend,/npm test -- --changed/);
  assert.match(frontend,/report\.numPassedTests>0/,'a missing related-test result cannot pass');
  assert.match(frontend,/if: inputs\.survey_selection != true && inputs\.affected_only != true\n        run: npm test/);
});
test('all three content domains and combined content qualify', () => {
  for (const file of [scale, cognitive, sjt]) assert.equal(classify([file]).content, true);
  assert.deepEqual(classify([scale, cognitive, sjt]), { maintenance:false, documentation:false, content: true, frontend: false, presentation: false, domains: ['cognitive', 'scale', 'situational'] });
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

import { recheckCognitiveIntake, requiredChecks, failedChecks } from './merge-gate.mjs';
import {personalTrackingDraftScope} from './personal-tracking-draft-scope.mjs';
test('personal tracking Draft reuses existing producers without qualifying Ready or unrelated maintenance',()=>{
  const marker={file:'server-version/backend/src/modules/reporting/personal-tracking.ts',status:'A',oldMode:'000000',newMode:'100644'};
  const draft={event:'pull_request',draft:true};
  assert.equal(personalTrackingDraftScope([marker],draft),true);
  assert.equal(personalTrackingDraftScope([marker,{...marker,file:'docs/evidence/personal-longitudinal-20261030/continuation/source.json'}],draft),true);
  assert.throws(()=>personalTrackingDraftScope([marker,{...marker,file:'docs/evidence/personal-longitudinal-20261030/continuation/code.mjs'}],draft),/no broad fallback/);
  assert.equal(personalTrackingDraftScope([marker],{...draft,draft:false}),false);
  assert.equal(personalTrackingDraftScope([marker],{...draft,event:'push'}),false);
  assert.throws(()=>personalTrackingDraftScope([marker],{...draft,forceFull:true}),/does not authorize/);
  for(const other of [
    {...marker,file:'server-version/backend/package-lock.json'},
    {...marker,file:'server-version/scripts/host-ops/backup.py'},
    {...marker,file:'server-version/backend/src/modules/auth/other.ts'},
    {...marker,status:'D',oldMode:'100644',newMode:'000000'},
    {...marker,newMode:'120000'},
  ])assert.throws(()=>personalTrackingDraftScope([marker,other],draft),/no broad fallback/);
  const scope=scopeOutputs('false','false','false',{application_route:'legacy',personal_tracking_draft:'true'});
  const needs={scope:{outputs:scope,result:'success'},'pr-light-backend':{result:'success'},'pr-light-frontend':{result:'success'}};
  assert.deepEqual(requiredChecks(needs,true),['scope','pr-light-backend','pr-light-frontend']);
  assert.deepEqual(failedChecks(needs,true),[]);
  assert.ok(failedChecks({...needs,'pr-light-backend':{result:'skipped'}},true).includes('pr-light-backend'));
  assert.ok(failedChecks(needs,false).includes('scope'));
  assert.ok(requiredChecks({scope:{outputs:{...scope,personal_tracking_draft:'false'}}},false).includes('backend-regression'));
});
test('Training personal tracking selects the same bounded Draft producers and refuses unrelated writes',()=>{
  const entry=file=>({file,status:'A',oldMode:'000000',newMode:'100644'});
  const entries=['server-version/backend/src/modules/composite/personal-tracking.ts',
    'server-version/backend/prisma/migrations/20261030110000_training_personal_tracking/migration.sql',
    'server-version/backend/src/modules/bundle-product/service.ts',
    'docs/evidence/personal-longitudinal-training-20261030/manifest.json'].map(entry);
  assert.equal(personalTrackingDraftScope(entries,{event:'pull_request',draft:true}),true);
  assert.equal(personalTrackingDraftScope(entries,{event:'pull_request',draft:false}),false);
  assert.throws(()=>personalTrackingDraftScope([...entries,entry('server-version/backend/src/modules/auth/changed.ts')],{event:'pull_request',draft:true}),/no broad fallback/);
  assert.throws(()=>personalTrackingDraftScope(entries,{event:'pull_request',draft:true,forceFull:true}),/does not authorize/);
});
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
import { execFileSync, spawnSync } from 'node:child_process';
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

test('explicit manual full dispatch selects platform checks even with no base SHA', () => {
  const output = execFileSync(process.execPath, [new URL('./content-scope.mjs', import.meta.url).pathname], {
    encoding: 'utf8', env: {...process.env, CI_EVENT:'workflow_dispatch',CI_FULL_ACCEPTANCE:'true', CI_BASE_SHA:'', GITHUB_OUTPUT:''},
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
test('measurement pages and React hooks use full frontend without widening narrow shortcuts',()=>{
  const src='server-version/frontend/src/';
  const files=[
    'training/courseAssessments.ts','training/courseAssessments.pagination.test.ts',
    'pages/public/PublicQuestionnaire.tsx','pages/public/__tests__/PublicQuestionnaire.start.test.tsx',
    'modules/cognitive/core/useCognitiveSession.ts','modules/cognitive/core/__tests__/useCognitiveSession.error-race.test.tsx',
    'modules/cognitive/pages/CognitiveAssignmentEntry.tsx','modules/cognitive/__tests__/CognitiveAssignmentEntry.navigation.test.tsx',
    'modules/composite/CompositeReportPage.tsx','modules/composite/__tests__/CompositeReportPage.navigation.test.tsx',
    'school/SchoolCompositeRunner.tsx','school/SchoolCompositeRunner.test.tsx',
  ].map(file=>src+file).concat('docs/performance/frontend-entry-scope/README.md');
  const entries=files.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
  const result=classifyChanges(entries);
  assert.equal(result.frontend,true);assert.equal(result.frontend_affected,false);assert.equal(result.frontend_test,false);
  // Architectural roles, not a list of the current six product files.
  for(const file of ['modules/cognitive/pages/FutureEntry.tsx','modules/cognitive/components/Status.tsx',
    'modules/composite/hooks/useReportNavigation.ts','modules/cognitive/core/useSessionNotice.ts']){
    assert.equal(classify([src+file]).frontend,true,file);
    assert.equal(frontendFile(src+file),false,file);
  }
  const tests=files.filter(file=>file.includes('/modules/')&&file.endsWith('.test.tsx'));
  assert.equal(classify(tests).frontend,true);assert.equal(frontendTestOnly(tests),false);
  const selected=acceptanceFor(files);
  assert.equal(selected.canonical_visual,true);
  for(const key of ['perf_smoke','media2','media7','situational_video','situational_branching'])assert.equal(selected[key],false,key);
});
test('measurement frontend retains cognitive and browser consumers and selected failures',()=>{
  const src='server-version/frontend/src/';
  const selected=acceptanceFor([src+'pages/public/PublicQuestionnaire.tsx',src+'modules/composite/CompositeReportPage.tsx']);
  const outputs=scopeOutputs('false','false','true',Object.fromEntries(Object.entries(selected).map(([key,value])=>[key,String(value)])));
  const needs={scope:{result:'success',outputs}};
  const expected=['scope','backend-browser-build','frontend','browser','docker','frontend-build','codeql','accept-ui'];
  assert.deepEqual(requiredChecks(needs,false),expected);
  for(const name of expected)needs[name]={...needs[name],result:'success'};
  assert.deepEqual(failedChecks(needs,false),[]);
  for(const name of expected)for(const result of ['failure','skipped','cancelled'])
    assert.ok(failedChecks({...needs,[name]:{...needs[name],result}},false).includes(name),name+':'+result);
  const build=readFileSync(new URL('../workflows/ci-backend-browser-build.yml',import.meta.url),'utf8');
  assert.match(build,/bash "\$GITHUB_WORKSPACE\/\.github\/scripts\/cognitive-ci-diagnostics.sh"/);
  const cognitive=readFileSync(new URL('./cognitive-ci-diagnostics.sh',import.meta.url),'utf8');
  assert.match(cognitive,/cognitive:onboarding-check -- --all --json/);
});
test('measurement engines protocols and mixed components retain their original scope',()=>{
  const ui='server-version/frontend/src/modules/composite/CompositeReportPage.tsx';
  for(const file of ['modules/cognitive/pages/CognitiveRunner.tsx','modules/cognitive/tasks/cpt/runner.tsx',
    'modules/cognitive/generated/runners.ts','modules/cognitive/registry.ts','modules/cognitive/api.ts','modules/cognitive/types.ts',
    'modules/cognitive/core/session-ledger.ts','modules/cognitive/core/trial-envelope.ts','modules/cognitive/core/response-timing.ts',
    'modules/composite/api.ts','modules/composite/types.ts','modules/composite/scoring.ts',
    'modules/composite/components/scorer.tsx','modules/assessment-runtime/Runner.tsx','services/persistence/finalDraftStore.ts'])
    assert.equal(classify([ui,'server-version/frontend/src/'+file]).frontend,false,file);
  for(const file of ['server-version/backend/src/routes/cognitive.ts','server-version/backend/prisma/schema.prisma',
    'server-version/frontend/package-lock.json','package-lock.json','.github/workflows/ci.yml'])
    assert.equal(classify([ui,file]).frontend,false,file);
  const entry={file:ui,status:'M',oldMode:'100644',newMode:'100644'};
  assert.equal(classifyChanges([entry],true).frontend,false);
  for(const newMode of ['100755','120000','000000'])assert.equal(classifyChanges([{...entry,newMode}]).frontend,false);
  for(const file of [ui.replace('/modules/','//modules/'),ui.replace('composite','..'),ui+'\n'])assert.equal(classify([file]).frontend,false);
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
      env:{...process.env,CI_EVENT:'workflow_dispatch',CI_FULL_ACCEPTANCE:'true',CI_RUNNER_PROFILE:'hybrid',CI_MAC_LIGHT_ENABLED:'',GITHUB_OUTPUT:output},encoding:'utf8'});
    const rows=readFileSync(output,'utf8').trim().split('\n');
    assert.ok(rows.length>=19);
    const fields=Object.fromEntries(rows.map(row=>[row.slice(0,row.indexOf('=')),row.slice(row.indexOf('=')+1)]));
    assert.equal(fields.scenario,'platform'); assert.equal(fields.frontend,'false');
    assert.deepEqual(JSON.parse(fields.heavy_runner),['ubuntu-24.04']);
    assert.deepEqual(JSON.parse(fields.codeql_runner),['ubuntu-24.04']);
    assert.throws(()=>execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{
      env:{...process.env,CI_EVENT:'workflow_dispatch',CI_FULL_ACCEPTANCE:'true',CI_RUNNER_PROFILE:'typo',GITHUB_OUTPUT:''},stdio:'pipe'}));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('API contracts, persistence and measurement inputs never use the UI shortcut',()=>{
  for(const path of ['api/materialGrants.ts','types/index.ts','services/completionRetry.ts',
    'modules/assessment-context/options.ts','components/reference-data.json','utils/scoring.ts'])
    assert.equal(frontendFile('server-version/frontend/src/'+path),false,path);
});

test('all scenarios and legacy profile aliases use hosted runners regardless of local capacity',()=>{
  for (const profile of ['hosted','speed','economy','local','balanced','hybrid']) {
    for (const scenario of ['platform','dependencies','frontend','content','content-frontend','presentation','maintenance','documentation']) {
      for (const capacity of [{macEnabled:true,os:'darwin',freeBytes:9*1024**3},{macEnabled:false,os:'linux',freeBytes:0}]) {
        const plan=runnerPlan({profile,scenario,...capacity});
        assert.equal(plan.runner_profile,'hosted');
        for (const lane of ['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'])
          assert.deepEqual(plan[lane],['ubuntu-24.04'],`${profile}/${scenario}: ${lane}`);
        assert.equal(plan.visual_hosted,scenario === 'platform');
      }
    }
  }
  assert.deepEqual(runnerPlan().heavy_runner,['ubuntu-24.04']);
  assert.throws(()=>runnerPlan({profile:'typo'}),/Unsupported CI_RUNNER_PROFILE/);
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


test('only strict UI test modules can use the lightweight frontend-test route',()=>{
  const accepted=[
    'server-version/frontend/src/pages/__tests__/StudentManagement.test.tsx',
    'server-version/frontend/src/training/TrainingScreens.test.tsx',
    'server-version/frontend/src/components/staff-ui/Form.spec.ts',
  ];
  for(const file of accepted) assert.equal(frontendTestFile(file),true,file);
  assert.equal(frontendTestOnly(accepted),true);
  const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
  assert.equal(classifyChanges(accepted.map(entry)).frontend_test,true);
  for(const file of [
    'server-version/frontend/src/pages/StudentManagement.tsx',
    'server-version/frontend/src/modules/cognitive/core/runner.test.ts',
    'server-version/frontend/src/services/access.test.ts',
    'server-version/frontend/src/pages/__tests__/fixture.ts',
    'server-version/frontend/vite.config.test.ts',
    'server-version/frontend/src/pages/__tests__/../Page.test.tsx',
    'server-version/frontend/src/pages/Scale.test.tsx\\n',
    '.github/scripts/content-scope.test.mjs',
    'server-version/backend/src/__tests__/integration/access.test.ts',
  ]) {
    assert.equal(frontendTestFile(file),false,file);
    assert.equal(classifyChanges([entry(accepted[0]),entry(file)]).frontend_test,false,file);
  }
  for(const meta of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{status:'M',newMode:'100755'}])
    assert.equal(classifyChanges([{...entry(accepted[0]),...meta}]).frontend_test,false);
  assert.equal(classifyChanges([entry(accepted[0])],true).frontend_test,false);
  assert.equal(frontendTestOnly([]),false);
});
test('frontend-test route requires real frontend regression and never permits missing checks',()=>{
  for(const draft of [true,false]){
    const outputs=scopeOutputs('false','false','false',{scenario:'frontend-test'});
    const needs={scope:{result:'success',outputs},frontend:{result:'success'}};
    assert.deepEqual(requiredChecks(needs,draft),['scope','frontend']);
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const bad of ['skipped','failure','cancelled',undefined])
      assert.ok(failedChecks({...needs,frontend:{result:bad}},draft).includes('frontend'));
    for(const extra of [{frontend_test:'false'},{frontend_test:'wat'},{codeql:'true'},
      {frontend_build:'true'},{media2:'true'},{canonical_visual:'true'},{ui_required:'true'},
      {scenario:'platform'},{frontend:'true'}])
      assert.ok(failedChecks({...needs,scope:{...needs.scope,outputs:{...outputs,...extra}}},draft).includes('scope'),JSON.stringify(extra));
  }
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
      [sjt,'content',false], [cognitive,'unsupported-cognitive',true],
      ['server-version/frontend/src/pages/Teacher.tsx','frontend',true],
      ['server-version/frontend/src/pages/__tests__/Teacher.test.tsx','frontend-test',false],
      ['server-version/frontend/src/modules/cognitive/core/runner.ts','platform',true],
      ['server-version/backend/prisma/schema.prisma','platform',true],
      ['.github/workflows/ci.yml','release-tooling',true],
      ['.github/workflows/unknown.yml','platform',true],
    ]) {
      git('reset','--hard',base);
      const path=join(fixture,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'fixture\n');
      git('add','.');git('-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-qm','case');
      if(scenario==='unsupported-cognitive') {
        assert.throws(()=>execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{cwd:fixture,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,CI_PR_REPOSITORY:'owner/repo',GITHUB_REPOSITORY:'owner/repo',CI_FORCE_FULL:'false',GITHUB_OUTPUT:''}}),/UNSUPPORTED_COGNITIVE_INTAKE:missing-task-package/);
        continue;
      }
      const output=JSON.parse(execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{
        cwd:fixture,encoding:'utf8',env:{...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,
        CI_PR_REPOSITORY:'owner/repo',GITHUB_REPOSITORY:'owner/repo',CI_RUNNER_PROFILE:'local',
        CI_MAC_LIGHT_ENABLED:'false',CI_FORCE_FULL:'false',GITHUB_OUTPUT:''},
      }).trim());
      assert.equal(output.scenario,scenario,file);assert.equal(output.codeql,codeql,file);
      if(scenario==='release-tooling'){
        assert.deepEqual(JSON.parse(output.release_plan).changed,[]);
        assert.equal(output.frontend_build,false);assert.equal(output.ui_required,false);
        assert.equal(output.media_selection,'[]');
        for(const k of Object.keys(acceptanceFor([])))assert.equal(output[k],false,k);
      }
      const outputs=Object.fromEntries(Object.entries(output).map(([key,value])=>[key,String(value)]));
      const needs={scope:{result:'success',outputs}};
      for(const name of requiredChecks(needs,false)) needs[name]={...needs[name],result:'success'};
      assert.deepEqual(failedChecks(needs,false),[],file);
      assert.deepEqual(JSON.parse(output.docker_runner),['ubuntu-24.04']);
    }
  } finally {rmSync(fixture,{recursive:true,force:true});}
});

test('the existing learning-motivation JSON uses Scale checks without admitting arbitrary root data or behavior',()=>{
  const file='server-version/backend/src/modules/scale/instruments/learning-motivation-wave1-data.json';
  const regular={file,status:'M',oldMode:'100644',newMode:'100644'};
  assert.equal(classifyChanges([regular]).content,true);
  assert.deepEqual(classifyChanges([regular]).domains,['scale']);
  for(const path of [file.replace('wave1-data','other-data'),file.replace('.json','.ts'),
    'server-version/backend/scripts/learning-motivation-wave1/generate-packages.py'])
    assert.equal(classifyChanges([{...regular,file:path}]).content,false,path);
  assert.equal(classifyChanges([{...regular,status:'D',newMode:'000000'}]).content,false);
  assert.equal(classifyChanges([{...regular,newMode:'120000'}]).content,false);
  assert.equal(classifyChanges([regular],true).content,false);
  assert.equal(acceptanceFor([file]).ops,false);
});


test('guidance documents use only documentation gate; mixed or nonregular changes do not',()=>{
  const files=['AGENTS.md','docs/release/README.md','.github/PULL_REQUEST_TEMPLATE.md'];
  const entries=files.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
  assert.equal(classifyChanges(entries).documentation,true);
  for(const extra of ['.github/workflows/ci.yml','server-version/backend/src/controllers/authController.ts','docs/release/unknown.md'])
    assert.equal(classifyChanges([...entries,{file:extra,status:'M',oldMode:'100644',newMode:'100644'}]).documentation,false,extra);
  for(const bad of [{status:'D',newMode:'000000'},{newMode:'100755'},{newMode:'120000'}])
    assert.equal(classifyChanges([{...entries[0],...bad}]).documentation,false);
  const outputs=scopeOutputs('false','false','false',{scenario:'documentation',documentation:'true',codeql:'false'});
  const needs={scope:{result:'success',outputs},documentation:{result:'success'}};
  assert.deepEqual(requiredChecks(needs,false),['scope','documentation']);
  assert.deepEqual(failedChecks(needs,false),[]);
  for(const bad of ['failure','cancelled','skipped',undefined])
    assert.ok(failedChecks({...needs,documentation:{result:bad}},false).includes('documentation'));
});

test('Teacher personal tracking stays in the same bounded Draft route with no Ready or unknown-path grant',()=>{
 const entry=file=>({file,status:'A',oldMode:'000000',newMode:'100644'});
 const entries=['server-version/backend/src/modules/reporting/education-personal-tracking.ts',
  'server-version/backend/prisma/migrations/20261030120000_education_personal_tracking/migration.sql',
  'server-version/backend/src/modules/reporting/teacher-personal-changes.service.ts',
  'server-version/frontend/src/huiteacher/TeacherPersonalTracking.tsx',
  'docs/evidence/personal-longitudinal-teacher-20261030/manifest.json'].map(entry);
 const draft={event:'pull_request',draft:true};
 assert.equal(personalTrackingDraftScope(entries,draft),true);
 assert.equal(personalTrackingDraftScope(entries,{...draft,draft:false}),false);
 assert.throws(()=>personalTrackingDraftScope([...entries,entry('server-version/backend/src/modules/huiteacher/authority.ts')],draft),/no broad fallback/);
 assert.throws(()=>personalTrackingDraftScope(entries,{...draft,forceFull:true}),/does not authorize/);
});

test('image build tooling gate requires real Docker success only on Ready and rejects malformed flags',()=>{
  for(const draft of [true,false]){
    const needs={scope:{result:'success',outputs:scopeOutputs('false','false','false',{scenario:'release-tooling',image_build:'true'})}};
    const expected=draft?['scope','release-tools']:['scope','release-tools','docker','codeql'];
    assert.deepEqual(requiredChecks(needs,draft),expected);
    for(const name of expected)needs[name]={...needs[name],result:'success'};
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const name of expected)for(const result of ['failure','skipped','cancelled','neutral',undefined])
      assert(failedChecks({...needs,[name]:{...needs[name],result}},draft).includes(name),name+':'+result);
    for(const image_build of ['yes','',true])assert(failedChecks({...needs,scope:{...needs.scope,outputs:{...needs.scope.outputs,image_build}}},draft).includes('scope'));
  }
  const mixed={scope:{result:'success',outputs:scopeOutputs('false','false','false',{scenario:'platform',image_build:'true'})}};
  assert(failedChecks(mixed,false).includes('scope'));
});

test('image build tooling workflow selects existing tools Docker and CodeQL without business acceptance',()=>{
  const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const block=name=>ci.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0];
  const names=['maintenance','backend','backend-regression','frontend-build','frontend','browser','docker','codeql','miniprogram','accept-media','accept-ui','accept-visual','accept-perf','accept-ops','release-tools'];
  for(const draft of [true,false])for(const imageBuild of [true,false]){
    const needs={scope:{result:'success',outputs:scopeOutputs('false','false','false',{scenario:'release-tooling',image_build:String(imageBuild),application_route:'legacy'})}};
    for(const name of [...names,'backend-browser-build'])needs[name]={result:'skipped'};
    const github={event_name:'pull_request',ref_name:'build-inputs',event:{pull_request:{draft,number:1,head:{ref:'build-inputs'}}}};
    for(const name of names){
      const expression=block(name).match(/^    if: \$\{\{ (.+) \}\}$/m)[1].replace(/\bneeds\.([a-zA-Z0-9_-]+)/g,(_,key)=>`needs[${JSON.stringify(key)}]`);
      const actual=new Function('needs','github','vars','inputs','cancelled','fromJSON','always',`return (${expression})`)(needs,github,{CI_FORCE_FULL:'false'},{},()=>false,JSON.parse,()=>true);
      assert.equal(Boolean(actual),name==='release-tools'||!draft&&(name==='codeql'||imageBuild&&name==='docker'),name+' draft='+draft+' image='+imageBuild);
    }
  }
  assert.match(ci,/image_build: \$\{\{ steps\.scope\.outputs\.image_build \}\}/);
  const images=readFileSync(new URL('../workflows/ci-images.yml',import.meta.url),'utf8');
  for(const required of ['build production images','scan backend image (high and critical)','scan frontend image (high and critical)','assert API/worker isolation topology','assert prelaunch resource and HTTPS contract','verify production Nginx static asset MIME and security headers'])assert(images.includes('name: '+required),required);
});

test('image build tooling CLI preserves Dockerfile fingerprints and rechecks the full diff at the stable gate',()=>{
  const dir=mkdtempSync(join(tmpdir(),'image-tooling-route-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(file,text)=>{mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),text);};
  const commit=()=>{git('add','.');git('-c','user.name=Scope fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');};
  const front='server-version/frontend/Dockerfile',back='server-version/backend/Dockerfile',input='.github/scripts/ci-image-plan.mjs';
  try{
    git('init','-q');for(const file of [front,back,input])put(file,'base\n');commit();const base=git('rev-parse','HEAD');
    const env={...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,CI_HEAD_REF:'feature/image-build',CI_IS_DRAFT:'false',CI_PR_REPOSITORY:'fixture/repo',GITHUB_REPOSITORY:'fixture/repo',CI_FORCE_FULL:'false',GITHUB_OUTPUT:'',IS_DRAFT:'false'};
    const classify=()=>JSON.parse(execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{cwd:dir,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    for(const [file,changed] of [[front,['frontend']],[back,['backend']],[input,[]]]){
      git('reset','--hard',base);put(file,'changed\n');commit();const output=classify();
      assert.equal(output.scenario,'release-tooling');assert.equal(output.image_build,true);assert.equal(output.codeql,true);assert.equal(output.frontend_build,false);
      for(const flag of Object.keys(acceptanceFor([])))assert.equal(output[flag],false,flag);
      const release=JSON.parse(output.release_plan);assert.deepEqual(release.changed,changed);
      for(const component of changed)assert.notEqual(release.components[component].base,release.components[component].candidate);
      const outputs=Object.fromEntries(Object.entries(output).map(([key,value])=>[key,String(value)]));
      const needs={scope:{result:'success',outputs},'release-tools':{result:'success'},docker:{result:'success'},codeql:{result:'success'}};
      const gate=()=>spawnSync(process.execPath,[new URL('./merge-gate.mjs',import.meta.url).pathname],{cwd:dir,encoding:'utf8',env:{...env,NEEDS_JSON:JSON.stringify(needs)}});
      const passed=gate();assert.equal(passed.status,0,passed.stderr+passed.stdout);
      // A false flag cannot suppress image checks, even if the rest of the emitted plan is unchanged.
      needs.scope.outputs.image_build='false';let rejected=gate();assert.notEqual(rejected.status,0);assert(rejected.stdout.includes('mixed-or-unknown-tooling'));
      delete needs.scope.outputs.image_build;rejected=gate();assert.notEqual(rejected.status,0);assert(rejected.stdout.includes('mixed-or-unknown-tooling'));
    }
    for(const mixed of ['server-version/frontend/src/main.tsx','server-version/backend/package-lock.json','server-version/backend/prisma/schema.prisma','server-version/docker-compose.yml','server-version/scripts/release/executor.py']){
      git('reset','--hard',base);git('clean','-fd');put(front,'changed\n');put(mixed,'mixed\n');commit();
      const output=classify();assert.equal(output.scenario,'platform',mixed);assert.equal(output.image_build,false,mixed);
    }
    git('reset','--hard',base);git('clean','-fd');put(front,'changed\n');commit();
    const output=classify();put('server-version/frontend/src/main.tsx','runtime\n');commit();
    const actual=execFileSync(process.execPath,['--input-type=module','-e',`import {plan} from ${JSON.stringify(new URL('../../server-version/scripts/release/policy.mjs',import.meta.url).href)}; console.log(JSON.stringify(plan(${JSON.stringify(base)},${JSON.stringify(git('rev-parse','HEAD'))})));`],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const outputs=Object.fromEntries(Object.entries(output).map(([key,value])=>[key,String(value)]));outputs.release_plan=actual.trim();
    const needs={scope:{result:'success',outputs},'release-tools':{result:'success'},docker:{result:'success'},codeql:{result:'success'}};
    const rejected=spawnSync(process.execPath,[new URL('./merge-gate.mjs',import.meta.url).pathname],{cwd:dir,encoding:'utf8',env:{...env,NEEDS_JSON:JSON.stringify(needs)}});
    assert.notEqual(rejected.status,0);assert(rejected.stdout.includes('mixed-or-unknown-tooling'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

const mixedEntry = file => ({file,status:'M',oldMode:'100644',newMode:'100644'});
const mixedFiles = ['docs/contributing/example.md','server-version/backend/src/modules/cognitive/tasks/example/package.ts','server-version/backend/src/modules/cognitive/schemas/example.config.ts','server-version/backend/src/modules/cognitive/onboarding/admin.routes.ts'];
const mixedManifest = () => JSON.stringify({schemaVersion:1,task:'example',identities:[{testType:'example',engineVersion:'1',scoringVersion:'1'}]});
test('Cognitive mixed product scope permits shared schema and admin code without content admission',()=>{
  assert.equal(cognitiveMixedProductScope(mixedFiles.map(mixedEntry),mixedManifest),true);
  assert.equal(cognitiveMixedProductScope(mixedFiles.slice(0,2).map(mixedEntry),mixedManifest),false);
  assert.equal(cognitiveMixedProductScope(mixedFiles.map(mixedEntry),()=>null),false);
  assert.equal(cognitiveMixedProductScope(mixedFiles.map(mixedEntry),mixedManifest,()=>JSON.stringify({identities:[{testType:'example',engineVersion:'old',scoringVersion:'old'}]})),false);
});
test('Cognitive full scope scans every path for native, unsafe, duplicate and nonregular inputs',()=>{
  const entries=mixedFiles.map(mixedEntry);
  for(const extra of [mixedEntry('server-version/frontend/src/modules/cognitive/native-runners.tsx'),mixedEntry('server-version/backend/src/modules/cognitive/content-candidates/other/a.ts'),mixedEntry('src/../bad.ts'),entries[0],{...entries[1],newMode:'120000'},{...entries[1],newMode:'100755'},{...entries[1],status:'D',newMode:'000000'}])
    assert.equal(cognitiveMixedProductScope([...entries,extra],mixedManifest),false,extra.file);
});
test('Cognitive mixed full gate retains generated checks and rejects failed, missing or skipped qualification',()=>{
  const outputs=scopeOutputs('false','false','false',{scenario:'platform',application_route:'legacy',frontend_build:'true',cognitive:'true',cognitive_intake_light:'false'});
  const needs={scope:{result:'success',outputs}};
  const required=requiredChecks(needs,false);
  for(const name of ['backend','backend-regression','frontend','browser','docker','codeql'])assert(required.includes(name),name);
  for(const name of required)needs[name]={...needs[name],result:'success'};
  assert.deepEqual(failedChecks(needs,false),[]);
  for(const name of required)for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,[name]:{...needs[name],result}},false).includes(name));
  const workflow=readFileSync('.github/workflows/ci-backend.yml','utf8'),pkg=JSON.parse(readFileSync('server-version/backend/package.json','utf8'));
  assert.match(workflow,/npm run cognitive:contracts/);assert.match(workflow,/cognitive-ci-diagnostics\.sh/);
  assert.match(pkg.scripts['cognitive:contracts'],/cognitive:manifest:check/);assert.match(pkg.scripts['cognitive:manifest:check'],/manifests\.cjs --check/);
});

test('Cognitive mixed with image inputs selects full route and gate recomputes it',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cognitive-mixed-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');};
  try {
    git('init','-q');writeFileSync(join(dir,'base.txt'),'base');commit();const base=git('rev-parse','HEAD');
    for(const file of mixedFiles){mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),'export {}');}
    const manifest='server-version/backend/src/modules/cognitive/tasks/example/task-package.json';writeFileSync(join(dir,manifest),mixedManifest());
    const dockerfile='server-version/frontend/Dockerfile';mkdirSync(dirname(join(dir,dockerfile)),{recursive:true});writeFileSync(join(dir,dockerfile),'FROM node:24\n');commit();const head=git('rev-parse','HEAD');
    const output=JSON.parse(execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{cwd:dir,encoding:'utf8',env:{...process.env,CI_EVENT:'pull_request',CI_BASE_SHA:base,CI_FORCE_FULL:'false',CI_PR_REPOSITORY:'fixture/repo',GITHUB_REPOSITORY:'fixture/repo',GITHUB_OUTPUT:''}}));
    assert.equal(output.scenario,'platform');assert.equal(output.cognitive_intake_light,false);assert.equal(output.cognitive,true);assert.equal(output.image_build,false);
    const needs={scope:{result:'success',outputs:Object.fromEntries(Object.entries(output).map(([k,v])=>[k,String(v)]))}};
    for(const name of requiredChecks(needs,false))needs[name]={...needs[name],result:'success'};
    assert.deepEqual(recheckCognitiveIntake(needs,{base,head,cwd:dir}),[]);
    assert(recheckCognitiveIntake({...needs,backend:{result:'failure'}},{base,head,cwd:dir}).includes('backend'));
    assert(recheckCognitiveIntake({...needs,scope:{...needs.scope,outputs:{...needs.scope.outputs,frontend:'true'}}},{base,head,cwd:dir}).includes('recomputed-cognitive-product-scope'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('report empty-state display uses affected frontend while requests, handlers and non-rendering code stay exact',()=>{
 const file='server-version/frontend/src/training/TrainingGroupReports.tsx',css='server-version/frontend/src/components/scale-governance/catalog-discovery.css';
 const old="import api from '../api/client';export function Report(){const [index,setIndex]=useState(null);const base='/courses/report';return <main>{index&&<button onClick={()=>api.post(base)}>生成</button>}</main>}";
 const next=old.replace('{index&&','{index&&index.tasks.length===0&&<p role="status">暂无任务</p>}{index&&index.tasks.length>0&&');
 const entries=[file,file.replace('.tsx','.test.tsx'),css,'docs/development/cua-report-theme.md'].map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
 const readers={readBaseFile:()=>old,readHeadFile:()=>next};
 assert.equal(classifyChanges(entries,false,readers).frontend_affected,true);
 for(const text of [next.replace("'/courses/report'","'/admin/report'"),next.replace('api.post(base)','api.get(base)'),next.replace('useState(null)','useState({admin:true})'),next+";fetch('/api')",next.replace("'../api/client'","'../api/admin'")])
  assert.equal(classifyChanges(entries,false,{...readers,readHeadFile:()=>text}).frontend_affected,false,text);
 assert.equal(classifyChanges([...entries,{file:'server-version/frontend/package.json',status:'M',oldMode:'100644',newMode:'100644'}],false,readers).frontend_affected,false);
 assert.equal(classifyChanges(entries.map(e=>e.file===file?{...e,newMode:'120000'}:e),false,readers).frontend_affected,false);
 assert.equal(classifyChanges(entries,true,readers).frontend_affected,false);
});

test('affected display selects its existing report suite once without following CSS imports',async()=>{
 const {runInNewContext}=await import('node:vm');
 const frontend=readFileSync(new URL('../workflows/ci-frontend.yml',import.meta.url),'utf8');
 const script=frontend.split('      - name: dependency-related frontend tests')[1].split("node --input-type=module <<'JS'\n")[1].split('\n          JS')[0].replace(/^          /gm,'').replace(/^import .*;\n/gm,'');
 const calls=[];
 runInNewContext(script,{process:{env:{CI_BASE_SHA:'a'.repeat(40),RUNNER_TEMP:'/tmp/fixture'}},execFileSync:(exe,args)=>{
  if(exe==='git')return ['server-version/frontend/src/training/TrainingGroupReports.tsx','server-version/frontend/src/training/TrainingGroupReports.test.tsx','server-version/frontend/src/components/scale-governance/catalog-discovery.css','docs/development/cua-report.md'].join('\0');
  calls.push([exe,...args]);
 }});
 assert.equal(calls.length,1);assert.equal(calls[0][4],'run');assert.equal(calls[0][5],'src/training/TrainingGroupReports.test.tsx');assert.equal(calls[0].includes('related'),false);
});
