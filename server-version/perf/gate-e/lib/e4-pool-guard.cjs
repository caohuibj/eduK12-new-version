/**
 * E4 fixture-pool guard (fail-closed).
 *
 * Stage 1R: remove modulo reuse as an undersized-pool strategy. If the sibling /
 * fixture pool is smaller than the requested PEAK (target concurrency), the run
 * must refuse to start rather than map trailing VUs onto reused fixtures (which
 * would silently turn fresh-submit work into idempotent replay / reuse).
 *
 * Pure module (no k6 / node deps) so the same contract is exercised both by the
 * k6 script at init time and by the node contract test.
 */
'use strict';

/**
 * @param {number} poolSize number of distinct fixtures in the selected group
 * @param {number} peak desired concurrency / VUs
 * @throws {Error} when poolSize < peak (undersized pool)
 * @returns {true}
 */
function assertSiblingPoolSufficient(poolSize, peak) {
  if (!Number.isFinite(poolSize) || !Number.isFinite(peak) || peak < 1) {
    throw new Error(
      `[E4] invalid pool/PEAK: pool=${poolSize} PEAK=${peak} (must be finite, PEAK>=1)`,
    );
  }
  if (poolSize < peak) {
    throw new Error(
      `[E4] undersized fixture pool (fail-closed): pool=${poolSize} < PEAK=${peak}; ` +
        `refusing to run. Increase fixture pool to >= PEAK or lower PEAK.`,
    );
  }
  return true;
}

module.exports = { assertSiblingPoolSufficient };