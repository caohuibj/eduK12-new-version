import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureIndexForVu, requireFixturePool } from '../gate-e/lib/fixture-pool.js';

test('E4 pool contract accepts equal and larger pools', () => {
  assert.deepEqual(requireFixturePool(2, 2), { poolSize: 2, peak: 2 });
  assert.deepEqual(requireFixturePool(10, 10), { poolSize: 10, peak: 10 });
  assert.deepEqual(requireFixturePool(50, 50), { poolSize: 50, peak: 50 });
});

test('E4 pool contract fails closed when peak exceeds fresh fixtures', () => {
  assert.throws(() => requireFixturePool(10, 50), /fixture pool exhausted/);
});

test('E4 maps each VU to one distinct fixture index', () => {
  assert.equal(fixtureIndexForVu(1), 0);
  assert.equal(fixtureIndexForVu(50), 49);
});
