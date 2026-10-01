import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './content-scope.mjs';
const root = 'server-version/backend/src/modules/';
const scale = `${root}scale/instruments/new_scale/1.0.0/instrument.ts`;
const cognitive = `${root}cognitive/tasks/STROOP/seeds.ts`;
const sjt = `${root}situational/instruments/new-sjt/1.0.0/instrument.json`;
test('all three content domains and combined content qualify', () => {
  for (const file of [scale, cognitive, sjt]) assert.equal(classify([file]).content, true);
  assert.deepEqual(classify([scale, cognitive, sjt]), { content: true, presentation: false, domains: ['cognitive', 'scale', 'situational'] });
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
  assert.ok(requiredChecks({ scope: { outputs: { content: 'false', presentation: 'false' } } }, false).includes('backend-regression'));
  for (const [content, presentation, draft] of [
    ['true', 'false', false],
    ['true', 'false', true],
    ['false', 'true', false],
    ['false', 'true', true],
    ['false', 'false', true],
    ['false', 'false', false],
  ]) {
    const needs = { scope: { outputs: { content, presentation }, result: 'success' } };
    for (const job of requiredChecks(needs, draft)) needs[job] = { ...needs[job], result: 'success' };
    assert.deepEqual(failedChecks(needs, draft), []);
    for (const job of requiredChecks(needs, draft)) {
      for (const result of ['failure', 'skipped', 'cancelled', undefined]) {
        assert.ok(failedChecks({ ...needs, [job]: { ...needs[job], result } }, draft).includes(job));
      }
    }
  }
});

import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
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
      { content: bad, presentation: 'false' },
      { content: 'false', presentation: bad },
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
