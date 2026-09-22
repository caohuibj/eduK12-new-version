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
