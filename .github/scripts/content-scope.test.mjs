import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './content-scope.mjs';
const root = 'server-version/backend/src/modules/';
const scale = `${root}scale/instruments/new_scale/1.0.0/instrument.ts`;
const cognitive = `${root}cognitive/tasks/STROOP/seeds.ts`;
const sjt = `${root}situational/instruments/new-sjt/1.0.0/instrument.json`;
test('all three content domains and combined content qualify', () => {
  for (const file of [scale, cognitive, sjt]) assert.equal(classify([file]).content, true);
  assert.deepEqual(classify([scale, cognitive, sjt]), { content: true, domains: ['cognitive', 'scale', 'situational'] });
});
test('empty, core, executable additions and mixed changes require full checks', () => {
  assert.equal(classify([]).content, false);
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
  for (const [content, draft] of [['true', false], ['true', true], ['false', true], ['false', false]]) {
    const needs = { scope: { outputs: { content }, result: 'success' } };
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
  for (const content of [undefined, '', 'TRUE', ' true', true, 'bundle']) {
    const needs = { scope: { result: 'success', outputs: { content } } };
    for (const name of requiredChecks(needs, false)) needs[name] = { ...needs[name], result: 'success' };
    assert.ok(failedChecks(needs, false).includes('scope'));
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
test('noncanonical paths and Bundle packages stay full until Bundle validators are wired', () => {
  for (const file of [scale.replace('/instruments/', '//instruments/'), scale + '\n',
    scale.replace('new_scale', '.'), scale.replace('new_scale', '..'), scale.replace('/', '\\'),
    `${root}assessment-bundle/packages/example/1.0.0/manifest.json`,
    `${root}assessment-bundle/generated/packages.json`]) assert.equal(classify([file]).content, false, file);
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
