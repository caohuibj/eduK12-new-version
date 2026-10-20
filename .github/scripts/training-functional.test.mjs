import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTrainingFunctional, validTrainingFunctionalPlan, TRAINING_FUNCTIONAL_BASE,
  TRAINING_FUNCTIONAL_CONFIG, TRAINING_FUNCTIONAL_TOOLS, TRAINING_FUNCTIONAL_OMISSIONS } from './training-functional.mjs';
import { validateTrainingFollowup, TRAINING_FOLLOWUP_CONFIG, TRAINING_FOLLOWUP_BASE,
  TRAINING_FOLLOWUP_MODE, TRAINING_FOLLOWUP_SOURCES, TRAINING_FOLLOWUP_TOOLS } from './training-functional.mjs';
import { requiredChecks, failedChecks } from './merge-gate.mjs';
import { mediaPlan } from './ci-media-plan.mjs';

const config = JSON.parse(readFileSync(new URL('../config/training-functional-ci.json', import.meta.url), 'utf8'));
const context = { base: TRAINING_FUNCTIONAL_BASE, head: 'a'.repeat(40), event: 'pull_request' };
const added = file => ({ file, status: 'A', oldMode: '000000', newMode: '100644' });
const entries = () => [...TRAINING_FUNCTIONAL_TOOLS, ...config.sourcePaths].map(added);
const plan = () => validateTrainingFunctional(entries(), config, context);
const followupConfig = JSON.parse(readFileSync(new URL('../config/training-followup-functional-ci.json', import.meta.url), 'utf8'));
const followupContext = { ...context, base: TRAINING_FOLLOWUP_BASE };
const followupEntries = () => [...TRAINING_FOLLOWUP_TOOLS, ...TRAINING_FOLLOWUP_SOURCES].map(added);
const followupPlan = () => validateTrainingFollowup(followupEntries(), followupConfig, followupContext);
const workflow = name => readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), 'utf8');
const job = (source, name) => source.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][a-z0-9-]*:/)[0] || '';
const acceptance = ['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'];
const functionalChecks = ['scope','maintenance','miniprogram','backend','backend-regression','frontend','browser','docker',
  'frontend-build','accept-visual','codeql','accept-media','accept-ui','accept-ops'];
function needsFor(functional = true) {
  const selected = ['media2','video_core','media7','situational_video','situational_branching'];
  const outputs = {
    ...Object.fromEntries(acceptance.map(key => [key, functional && key === 'perf_smoke' ? 'false' : 'true'])),
    ...Object.fromEntries(['maintenance','content','presentation','frontend','frontend_test','documentation'].map(key => [key, 'false'])),
    application_route: 'legacy', scenario: 'platform', codeql: 'true', runner_profile: 'hosted',
    frontend_build: 'true', ui_required: 'true', visual_hosted: 'true',
    media_selection: JSON.stringify(selected), media_groups: JSON.stringify(mediaPlan(selected)),
    training_functional_only: String(functional), run_performance_tests: String(!functional),
    training_functional_plan: JSON.stringify(functional ? plan() : null),
  };
  const needs = { scope: { outputs, result: 'success' }, 'accept-perf': { result: functional ? 'skipped' : 'success' } };
  for (const name of functionalChecks.filter(name => name !== 'scope')) needs[name] = { result: 'success' };
  return needs;
}

test('one explicit reviewed scope preserves current base and declares only two performance omissions', () => {
  const p = plan();
  assert.equal(validTrainingFunctionalPlan(p), true);
  assert.deepEqual(p.omittedPerformance, TRAINING_FUNCTIONAL_OMISSIONS);
  assert.equal(p.changedPaths.length, entries().length);
  assert.deepEqual(p.changedPaths, [...p.changedPaths].sort());
  assert.deepEqual(validateTrainingFunctional(entries(), config, { ...context, event: 'push' }), p);
});

test('branch names and arbitrary booleans cannot opt an ordinary PR into functional-only mode', () => {
  const ordinary = entries().filter(entry => entry.file !== TRAINING_FUNCTIONAL_CONFIG);
  assert.equal(validateTrainingFunctional(ordinary, config, { ...context,
    branch: 'work/training-functional-final-20261020', trainingFunctional: true }), null);
  assert.doesNotMatch(readFileSync(new URL('./training-functional.mjs', import.meta.url), 'utf8'), /GITHUB_(?:HEAD_)?REF|CI_TRAINING_FUNCTIONAL_REQUIRED/);
});

test('scope is one-time and refuses unknown, deleted, renamed, executable and symlink paths', () => {
  for (const mutation of [
    list => list.push(added('server-version/backend/package.json')),
    list => list.push(added('server-version/backend/src/unreviewed.ts')),
    list => { list[0].status = 'M'; list[0].oldMode = '100644'; },
    list => { list[1].status = 'D'; list[1].newMode = '000000'; },
    list => { list[1].status = 'R100'; },
    list => { list[1].newMode = '100755'; },
    list => { list[1].newMode = '120000'; },
    list => list.push({ ...list[1] }),
    list => list.splice(list.findIndex(entry => entry.file.endsWith('/schema.prisma')), 1),
  ]) {
    const changed = entries(); mutation(changed);
    assert.throws(() => validateTrainingFunctional(changed, config, context));
  }
});

test('moving base, force-full, manual events and broad or malformed declarations fail closed', () => {
  for (const options of [{ base: 'b'.repeat(40) }, { head: 'HEAD' }, { event: 'workflow_dispatch' },
    { event: 'pull_request_target' }, { forceFull: true }])
    assert.throws(() => validateTrainingFunctional(entries(), config, { ...context, ...options }));
  for (const change of [{ schema: 2 }, { mode: 'full' }, { base: 'b'.repeat(40) }, { reason: '' },
    { sourcePaths: [] }, { sourcePaths: ['server-version/backend/package.json'] },
    { sourcePaths: [...config.sourcePaths, config.sourcePaths[0]] },
    { sourcePaths: [...config.sourcePaths, 'server-version/backend/src/../escape.ts'] }])
    assert.throws(() => validateTrainingFunctional(entries(), { ...config, ...change }, context));
});

test('functional mode requires every existing platform functional/security/build check', () => {
  const needs = needsFor();
  assert.deepEqual(requiredChecks(needs, false).sort(), [...functionalChecks].sort());
  assert.deepEqual(failedChecks(needs, false), []);
  for (const name of functionalChecks) for (const state of ['failure','cancelled','skipped',undefined]) {
    const changed = structuredClone(needs);
    if (state === undefined) delete changed[name]; else changed[name].result = state;
    assert.ok(failedChecks(changed, false).length > 0, `${name}: ${state}`);
  }
  assert.ok(failedChecks(needs, true).includes('scope'), 'draft cannot claim the ready functional gate');
});

test('ordinary platform defaults still require performance and no forged omission can pass', () => {
  const ordinary = needsFor(false);
  assert.deepEqual(failedChecks(ordinary, false), []);
  assert.ok(requiredChecks(ordinary, false).includes('accept-perf'));
  ordinary['accept-perf'].result = 'skipped';
  assert.ok(failedChecks(ordinary, false).includes('accept-perf'));
  for (const mutate of [
    n => { n.scope.outputs.run_performance_tests = 'false'; },
    n => { n.scope.outputs.perf_smoke = 'false'; },
    n => { n.scope.outputs.training_functional_only = 'maybe'; },
    n => { n.scope.outputs.training_functional_plan = JSON.stringify(plan()); },
  ]) { const n = needsFor(false); mutate(n); assert.ok(failedChecks(n, false).includes('scope')); }
  for (const mutate of [
    n => { n.scope.outputs.training_functional_plan = 'null'; },
    n => { n.scope.outputs.run_performance_tests = 'true'; },
    n => { n.scope.outputs.ops = 'false'; },
    n => { n.scope.outputs.app_shell = 'false'; },
    n => { n.scope.outputs.codeql = 'false'; },
    n => { n.scope.outputs.application_route = 'reviewed-candidate'; },
    n => { n['accept-perf'].result = 'success'; },
    n => { delete n['accept-perf']; },
  ]) { const n = needsFor(); mutate(n); assert.ok(failedChecks(n, false).includes('scope')); }
});

test('followup freezes the actual administrator main and the complete 18-source / 8-tool diff', () => {
  assert.equal(followupConfig.base, 'f41dca3f347b253b500de600c75855ffcd275491');
  assert.equal(TRAINING_FOLLOWUP_SOURCES.length, 18); assert.equal(TRAINING_FOLLOWUP_TOOLS.length, 8);
  assert.deepEqual([...followupConfig.sourcePaths].sort(), TRAINING_FOLLOWUP_SOURCES);
  const p = followupPlan(); assert.equal(validTrainingFunctionalPlan(p), true);
  assert.equal(p.mode, TRAINING_FOLLOWUP_MODE); assert.equal(p.changedPaths.length, 26);
  assert.deepEqual(p.omittedPerformance, ['aggregate-report-200-completion', 'perf-phase0-smoke']);
  assert.equal(validateTrainingFollowup([], followupConfig, { ...followupContext, branch:'perf/training-load-followup-20261020' }), null);
});

test('followup rejects unknown, missing, malformed, moved, mixed-marker or changed-mode scope', () => {
  for (const entry of followupEntries().filter(e => e.file !== TRAINING_FOLLOWUP_CONFIG))
    assert.throws(() => validateTrainingFollowup(followupEntries().filter(e => e.file !== entry.file), followupConfig, followupContext));
  for (const change of [
    list => list.push(added('server-version/backend/src/new-optimization.ts')),
    list => list.push(added(TRAINING_FUNCTIONAL_CONFIG)),
    list => list.push({ ...list[0] }),
    ...['D','R100'].map(status => list => { list[1].status=status; }),
    ...['100755','120000'].map(newMode => list => { list[1].newMode=newMode; }),
    list => { list[0].status='M'; list[0].oldMode='100644'; },
  ]) { const list=followupEntries(); change(list); assert.throws(() => validateTrainingFollowup(list, followupConfig, followupContext)); }
  for (const options of [{base:'b'.repeat(40)}, {head:'HEAD'}, {event:'workflow_dispatch'}, {event:'pull_request_target'}, {forceFull:true}])
    assert.throws(() => validateTrainingFollowup(followupEntries(),followupConfig,{...followupContext,...options}));
  for (const change of [{mode:'training-functional-only'}, {sourcePaths:followupConfig.sourcePaths.slice(1)},
    {sourcePaths:[...followupConfig.sourcePaths,'server-version/backend/src/new-optimization.ts']}])
    assert.throws(() => validateTrainingFollowup(followupEntries(),{...followupConfig,...change},followupContext));
  for (const change of [{base:TRAINING_FUNCTIONAL_BASE}, {changedPaths:followupPlan().changedPaths.slice(1)},
    {omittedPerformance:['all-security']}]) assert.equal(validTrainingFunctionalPlan({...followupPlan(),...change}),false);
});

test('followup still requires every ordinary functional gate and exact performance nonexecution', () => {
  const needs=needsFor(); needs.scope.outputs.training_functional_plan=JSON.stringify(followupPlan());
  assert.deepEqual(requiredChecks(needs,false).sort(),[...functionalChecks].sort());
  assert.deepEqual(failedChecks(needs,false),[]);
  for (const name of functionalChecks) for (const state of ['failure','cancelled','skipped',undefined]) {
    const changed=structuredClone(needs); changed[name]={result:state}; assert.ok(failedChecks(changed,false).length>0,name+' '+state);
  }
  for (const mutate of [n=>{n.scope.outputs.run_performance_tests='true';},n=>{n.scope.outputs.perf_smoke='true';},
    n=>{n['accept-perf'].result='success';},n=>{n.scope.outputs.training_functional_plan='null';},
    ...['ops','app_shell','codeql','ui_required','frontend_build','visual_hosted'].map(k=>n=>{n.scope.outputs[k]='false';})]) {
    const changed=structuredClone(needs); mutate(changed); assert.ok(failedChecks(changed,false).includes('scope'));
  }
});

test('followup passes an exact profile input and adds admin acceptance without dropping ordinary browser work', () => {
  const ci=workflow('ci'),backend=workflow('ci-backend'),browser=workflow('ci-browser');
  for(const name of ['scope','probe-backend','probe-perf','probe-browser','merge-gate'])
    assert.match(job(ci,name),/!\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/perf\/training-load-followup-20261020'\)/,name);
  assert.match(job(ci,'scope'),/CI_TRAINING_FUNCTIONAL_REQUIRED:.*perf\/training-load-followup-20261020/);
  for(const name of ['backend','browser'])assert.match(job(ci,name),/training_followup_functional:.*fromJSON\(needs\.scope\.outputs\.training_functional_plan\)\.mode == 'training-followup-functional-only'/);
  assert.match(backend,/if: inputs\.admin_permissions_functional \|\| inputs\.training_followup_functional/);
  assert.match(backend,/training-functional\.mjs" verify-followup/);
  assert.match(backend,/test "\$denied" -eq 1/);
  assert.match(backend,/assert\.equal\(read\('rollback-old\.json'\)\.result,'DENIED'\)/);
  assert.doesNotMatch(backend,/CI_EXPECTED_BASE_ROLLBACK/);
  assert.match(browser,/if: \(inputs\.admin_permissions_functional \|\| inputs\.training_followup_functional\) && matrix\.group == 'security'/);
  assert.match(browser,/training-functional\.mjs verify-followup/);
  // Followup is additive: only the original admin-only input narrows these
  // existing tasks; the new input must not be used to suppress any step.
  for(const line of browser.split('\n').filter(line=>line.trim().startsWith('if:')))
    assert.doesNotMatch(line,/!.*inputs\.training_followup_functional|inputs\.training_followup_functional.*==\s*false/);
  assert.match(readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8'),/\[TRAINING_FUNCTIONAL_BASE,TRAINING_FOLLOWUP_BASE\]\.includes\(process\.env\.CI_BASE_SHA\)/);
});

test('backend switch defaults true and the two functional aggregate assertions remain mandatory', () => {
  const backend = workflow('ci-backend');
  assert.match(backend, /run_performance_tests:\n\s+type: boolean\n\s+default: true/);
  assert.match(backend, /name: verify explicit Training scope before omitting performance[\s\S]*?training-functional\.mjs verify-backend/);
  assert.match(backend, /name: 200-completion performance and report integrity gate\n\s+if: inputs\.run_performance_tests/);
  assert.match(backend, /name: performance suite must not skip\n\s+if: inputs\.run_performance_tests/);
  assert.match(backend, /--testNamePattern='\(writes ciphertext only and keeps the report readable through the service\|keeps one terminal report and timestamp across concurrent completion and replay\)\$'/);
  assert.match(backend, /training-functional-report\.mjs.*eduk12-backend-functional-vitest\.json/);
  assert.match(backend, /backend-functional-vitest-report/);
  assert.doesNotMatch(backend, /PR26_COMPLETION_BURST_SIZE|--passWithNoTests/);
  assert.match(workflow('ci-backend-regression'), /--exclude=src\/__tests__\/questionnaire\/aggregate-report\.postgres\.integration\.test\.ts/);
});

test('workflow exposes the explicit plan, retains normal routes and refuses manual fallback on this candidate', () => {
  const ci = workflow('ci');
  assert.match(job(ci, 'backend'), /run_performance_tests: \$\{\{ needs\.scope\.outputs\.run_performance_tests != 'false' \}\}/);
  assert.match(job(ci, 'accept-perf'), /needs\.scope\.outputs\.perf_smoke == 'true'/);
  assert.match(job(ci, 'scope'), /training_functional_plan: \$\{\{ steps\.scope\.outputs\.training_functional_plan \}\}/);
  assert.match(job(ci, 'scope'), /training-functional\.test\.mjs.*training-functional-report\.test\.mjs/);
  assert.match(job(ci, 'merge-gate'), /CI_BASE_SHA:.*github\.event\.pull_request\.base\.sha/);
  for (const name of ['scope','probe-backend','probe-perf','merge-gate'])
    assert.match(job(ci, name), /!\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/work\/training-functional-final-20261020'\)/, name);
  assert.match(job(ci, 'known-training-functional-manual-refusal'), /throw new Error/);
  const gate = readFileSync(new URL('./merge-gate.mjs', import.meta.url), 'utf8');
  assert.match(gate, /trainingFunctionalPlan\(changedEntries\(base, head\), base, head\)/);
  assert.match(gate, /recomputed-training-functional-plan/);
});


test('all three jsdom transaction gaps are required in native Chromium without memory fallback', () => {
  const browser = workflow('ci-browser');
  assert.match(browser, /name: Training native IndexedDB transaction contracts\n\s+if: matrix.group == 'foundation'\n\s+timeout-minutes: 2\n\s+run: node e2e\/training-draft-transactions-browser\.cjs/);
  const native = readFileSync(new URL('../../server-version/e2e/training-draft-transactions-browser.cjs', import.meta.url), 'utf8');
  const original = readFileSync(new URL('../../server-version/frontend/src/services/persistence/__tests__/answerReplacement.test.ts', import.meta.url), 'utf8');
  for (const name of [
    'rolls back old-only deletion, shared updates, new-only insertion, and timing on a late abort',
    'rolls back answer requests if the final metadata write throws',
    'resolves only after the transaction completion event',
  ]) { assert.ok(original.includes(name)); assert.ok(native.includes(name)); }
  assert.match(native, /store\.constructor\.name !== 'IndexedDbFinalDraftStore'/);
  assert.match(native, /assert\.equal\(actual\.newRowSucceeded, true\)/);
  assert.match(native, /assert\.equal\(actual\.committedWhenResolved, true\)/);
  assert.match(native, /assert\.deepEqual\(actual\.answers, actual\.old\)/);
  assert.match(native, /assert\.deepEqual\(actual\.metadata, actual\.oldMetadata\)/);
  assert.match(native, /assert\.equal\(result\.checks\.length, 3\)/);
});


test('real Node verify-backend CLI finishes initialization and rejects an illegal scope', () => {
  const directory = mkdtempSync(join(tmpdir(), 'training-functional-cli-'));
  try {
    // Only Git I/O is a deterministic fixture. The real CLI and its complete
    // module graph execute in a fresh Node process, so a cyclic top-level await
    // cannot be hidden by the imports already initialized in this test process.
    const fixtureFile = join(directory, 'git-fixture.json');
    writeFileSync(join(directory, 'git'), `#!/usr/bin/env node
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.TRAINING_CLI_GIT_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
if (JSON.stringify(args) === JSON.stringify(['rev-parse', 'HEAD'])) process.stdout.write(fixture.head + String.fromCharCode(10));
else if (JSON.stringify(args) === JSON.stringify(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '--abbrev=40', '-z', fixture.base, fixture.head, '--'])) process.stdout.write(fixture.raw);
else if (JSON.stringify(args) === JSON.stringify(['show', fixture.head + ':' + fixture.configPath])) process.stdout.write(JSON.stringify(fixture.config));
else throw new Error('Unexpected Git command: ' + JSON.stringify(args));
`, { mode: 0o755 });
    const raw = changes => changes.map(entry =>
      `:${entry.oldMode} ${entry.newMode} ${'0'.repeat(40)} ${'b'.repeat(40)} ${entry.status}\0${entry.file}\0`).join('');
    const fixture = { base: context.base, head: context.head, configPath: TRAINING_FUNCTIONAL_CONFIG, config, raw: raw(entries()) };
    writeFileSync(fixtureFile, JSON.stringify(fixture));
    const execute = (command = 'verify-backend') => spawnSync(process.execPath,
      [fileURLToPath(new URL('./training-functional.mjs', import.meta.url)), command], {
        cwd: directory, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: directory + delimiter + process.env.PATH,
          TRAINING_CLI_GIT_FIXTURE: fixtureFile, CI_EVENT: 'pull_request',
          CI_BASE_SHA: fixture.base, CI_FORCE_FULL: 'false' },
      });
    const valid = execute();
    assert.ifError(valid.error);
    assert.equal(valid.signal, null);
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout), { mode: 'training-functional-only',
      base: context.base, head: context.head, omittedPerformance: TRAINING_FUNCTIONAL_OMISSIONS });
    fixture.raw = raw([...entries(), added('server-version/backend/src/unreviewed.ts')]);
    writeFileSync(fixtureFile, JSON.stringify(fixture));
    const invalid = execute();
    assert.ifError(invalid.error);
    assert.equal(invalid.signal, null);
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Unknown path, deletion or file-mode change/);
    Object.assign(fixture,{base:followupContext.base,configPath:TRAINING_FOLLOWUP_CONFIG,
      config:followupConfig,raw:raw(followupEntries())});
    writeFileSync(fixtureFile,JSON.stringify(fixture));
    const current=execute('verify-followup'); assert.ifError(current.error); assert.equal(current.status,0,current.stderr);
    assert.deepEqual(JSON.parse(current.stdout),{mode:TRAINING_FOLLOWUP_MODE,base:followupContext.base,
      head:context.head,omittedPerformance:TRAINING_FUNCTIONAL_OMISSIONS});
    fixture.base='b'.repeat(40);writeFileSync(fixtureFile,JSON.stringify(fixture));
    const moved=execute('verify-followup');assert.equal(moved.status,1);assert.equal(moved.stdout,'');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
