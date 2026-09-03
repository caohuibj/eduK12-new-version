/**
 * E2 Scale open-loop — true fresh-write capacity curve.
 * Each logical student consumes one unfinished parent-bound UNIFIED_V1 scale
 * fixture (unique attempt + submissionId). No wrap. Capacity retries may reuse
 * the same submissionId only within one logical submit.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const rate = Number(__ENV.TARGET_SUCCESS_RATE || 25);
const duration = String(__ENV.DURATION || '20s');
const groupName = __ENV.GROUP || 'scale';
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || Math.max(50, rate * 4));
const maxVUs = Number(__ENV.MAX_VUS || Math.max(100, rate * 8));

const requests = new SharedArray('e2-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e2_scale_open_loop: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: {
    // Soft: do not abort mid-curve; INVALID is decided by post-run accounting.
    gate_e_missing_fixtures: ['count<1'],
  },
};

let cursor = 0;

export default function () {
  const index = cursor;
  cursor += 1;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e2_scale_open_loop', target_rate: String(rate) });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const count = (name) => (metrics[name] && metrics[name].values && metrics[name].values.count) || 0;
  const rateOf = (name) => (metrics[name] && metrics[name].values && metrics[name].values.rate) || 0;
  const p95 = (metrics.gate_e_eventual_latency_ms && metrics.gate_e_eventual_latency_ms.values && metrics.gate_e_eventual_latency_ms.values['p(95)']) || 0;
  const p99 = (metrics.gate_e_eventual_latency_ms && metrics.gate_e_eventual_latency_ms.values && metrics.gate_e_eventual_latency_ms.values['p(99)']) || 0;
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const fresh = count('gate_e_fresh_completions');
  const replays = count('gate_e_idempotent_replays');
  const used = count('gate_e_fixtures_used');
  const missing = count('gate_e_missing_fixtures');
  const state = data.state || {};
  const testRun = state.testRunDurationMs ? state.testRunDurationMs / 1000 : 0;
  const summary = {
    profile: `E2 Scale fresh OL ${rate}/s`,
    target_rate: rate,
    duration_s: testRun,
    success,
    fail,
    success_rate: success + fail > 0 ? success / (success + fail) : 0,
    students_per_s: testRun > 0 ? success / testRun : 0,
    fresh_completions: fresh,
    idempotent_replays: replays,
    fixtures_used: used,
    missing_fixtures: missing,
    p95_ms: p95,
    p99_ms: p99,
    http_reqs: count('http_reqs'),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    fixture_pool_size: requests.length,
  };
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [__ENV.K6_SUMMARY_EXPORT || '/tmp/eduk12-gate47-test-results/gate-e/e2-fresh-last.summary.json']: JSON.stringify({ root_group: data.root_group, metrics: data.metrics, state: data.state, gate_e_summary: summary }, null, 2),
  };
}
