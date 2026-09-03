/**
 * E2 Scale open-loop — true fresh-write capacity curve.
 * Each logical student consumes one unfinished parent-bound UNIFIED_V1 scale
 * fixture (unique attempt + submissionId). No wrap. Capacity retries may reuse
 * the same submissionId only within one logical submit.
 */
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const rate = Number(__ENV.TARGET_SUCCESS_RATE || 25);
const duration = String(__ENV.DURATION || '20s');
const groupName = __ENV.GROUP || 'scale';
const preAllocatedVUs = Math.max(1, Number(__ENV.PRE_ALLOCATED_VUS || Math.max(50, rate * 4)) || Math.max(50, rate * 4));
const maxVUs = Math.max(preAllocatedVUs, Number(__ENV.MAX_VUS || Math.max(100, rate * 8)) || Math.max(preAllocatedVUs, rate * 8));

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
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  // Unique across all VUs — do NOT use a mutable module cursor (per-VU copies collide).
  const index = exec.scenario.iterationInTest;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e2_scale_open_loop', target_rate: String(rate) });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const vals = (name) => {
    const m = metrics[name];
    if (!m) return {};
    return m.values || m;
  };
  const count = (name) => Number(vals(name).count || 0);
  const p95 = Number(vals('gate_e_eventual_latency_ms')['p(95)'] || 0);
  const p99 = Number(vals('gate_e_eventual_latency_ms')['p(99)'] || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
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
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    fixtures_used: count('gate_e_fixtures_used'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    p95_ms: p95,
    p99_ms: p99,
    http_reqs: count('http_reqs'),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/eduk12-gate47-test-results/gate-e/e2-fresh-last.gate-e.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
