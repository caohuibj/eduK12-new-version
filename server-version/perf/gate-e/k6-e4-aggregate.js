/**
 * E4 Aggregate — many-parent stampede and same-parent concurrent last-unit.
 * Set MODE=manyParent|sameParent and GROUP accordingly.
 *
 * sameParent: fixtures must share one parentId with distinct child/slot/submissionId
 * (seed SAME_PARENT_SIBLINGS=2|10|50). Each VU takes a distinct sibling index —
 * never pin all VUs to fixture 0 (that collapses contention into serial reuse).
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';
import { assertSiblingPoolSufficient } from './lib/e4-pool-guard.cjs';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const mode = String(__ENV.MODE || 'manyParent');
const groupName = __ENV.GROUP || (mode === 'sameParent' ? 'sameParent' : 'mixed');
const peak = Number(__ENV.PEAK || (mode === 'sameParent' ? 50 : 100));

// MEM FIX: parse fixture file once inside SharedArray (not per-VU module level).
const requests = new SharedArray('e4-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});

// Stage 1R (fail-closed): refuse to start when the fixture pool is smaller than the
// requested concurrency. Trailing VUs must NOT be recycled onto reused fixtures.
assertSiblingPoolSufficient(requests.length, peak);

export const options = {
  scenarios: {
    e4_aggregate: {
      executor: 'per-vu-iterations',
      vus: peak,
      iterations: 1,
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
  thresholds: {
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  // F9 (Gate-E): distribute VUs across distinct child fixtures so same-parent
  // mode hammers different child/submissionId against the SAME parent. Stage 1R
  // removed modulo reuse: the init-time pool guard guarantees requests.length >=
  // peak, so __VU-1 is always a distinct in-range index (no replay/reuse collapse).
  const request = pickFreshRequest(requests, __VU - 1);
  runLogicalSubmit(request, {
    profile: 'e4_aggregate',
    mode,
    sibling_pool: String(requests.length),
  });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const count = (name) => Number((metrics[name] || {}).values?.count || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const p95 = Number(metrics.gate_e_eventual_latency_ms?.values?.['p(95)'] || 0);
  const p99 = Number(metrics.gate_e_eventual_latency_ms?.values?.['p(99)'] || 0);
  const testRun = data.state?.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const summary = {
    profile: 'e4_aggregate',
    mode,
    group: groupName,
    peak_vus: peak,
    success,
    fail,
    success_rate: success + fail > 0 ? success / (success + fail) : 0,
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    p95_ms: p95,
    p99_ms: p99,
    duration_s: testRun,
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || `/tmp/gate-e-e4-${mode}-last.json`;
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
