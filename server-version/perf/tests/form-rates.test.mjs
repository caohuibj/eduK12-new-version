import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gate-e', 'form-rates.sh');

const rates = (args, env = {}) =>
  execFileSync('bash', [helper, ...args], { env: { ...process.env, ...env } })
    .toString()
    .trim()
    .split(/\s+/);

test('normal class defaults to the full 7-point sweep', () => {
  assert.deepEqual(rates(['normal']), ['25', '40', '55', '70', '85', '100', '115']);
});

test('large class defaults to the full 7-point sweep', () => {
  assert.deepEqual(rates(['large']), ['25', '40', '55', '70', '85', '100', '115']);
});

test('RATES env overrides the default set', () => {
  assert.deepEqual(rates(['normal'], { RATES: '100 115' }), ['100', '115']);
});

test('invalid class exits 2 with usage', () => {
  assert.throws(
    () => execFileSync('bash', [helper, 'medium'], { stdio: 'pipe' }),
    (err) => err.status === 2 && /usage: form-rates\.sh <normal\|large>/.test(err.stderr.toString()),
  );
});
