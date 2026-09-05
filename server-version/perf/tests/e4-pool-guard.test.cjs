/**
 * E4 undersized-pool negative contract (Stage 1R).
 *
 * Proves the fail-closed guarantee that backs the k6 init guard:
 *   pool=10 / PEAK=50  -> refuse to run
 * This mirrors exactly the guard k6-e4-aggregate.js invokes at init.
 * Run: node perf/tests/e4-pool-guard.test.cjs
 */
'use strict';
const assert = require('node:assert');
const { assertSiblingPoolSufficient } = require('../gate-e/lib/e4-pool-guard.cjs');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL  ${name}: ${e.message}`);
  }
}

// Positive: pool >= peak is allowed.
check('pool=50 / PEAK=50 accepted', () => {
  assert.strictEqual(assertSiblingPoolSufficient(50, 50), true);
});
check('pool=100 / PEAK=50 accepted', () => {
  assert.strictEqual(assertSiblingPoolSufficient(100, 50), true);
});

// Negative: pool < peak must refuse (the reviewer's pool=10 / PEAK=50 case).
check('NEGATIVE pool=10 / PEAK=50 refuses', () => {
  assert.throws(() => assertSiblingPoolSufficient(10, 50), /undersized fixture pool/);
});
check('NEGATIVE pool=49 / PEAK=50 refuses', () => {
  assert.throws(() => assertSiblingPoolSufficient(49, 50), /undersized fixture pool/);
});
check('NEGATIVE pool=0 refuses', () => {
  assert.throws(() => assertSiblingPoolSufficient(0, 10), /undersized fixture pool/);
});
check('NEGATIVE bad PEAK rejects', () => {
  assert.throws(() => assertSiblingPoolSufficient(50, NaN), /invalid pool\/PEAK/);
});

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);