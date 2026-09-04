/**
 * E2 Burst with REAL retry contract (v3.0 §28-33, §30-31).
 * True simultaneous-student surge via constant-arrival-rate with a short ramp
 * and hold. Each logical student uses runLogicalSubmit -> the real capacity
 * retry contract:
 *   - 503 busy -> Retry-After -> jitter/backoff -> same submissionId -> retry
 *   - 429 -> hard stop (never retried)
 * KPI = eventual success, T50/T95/T99/T99.9, retries/student, recovery.
 */
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const rate = Number(__ENV.TARGET_SUCCESS_RATE || 250);
const rampS = Number(__ENV.RAMP_S || 2);
const holdS = Number(__ENV.HOLD_S || 8);
const totalS = rampS + holdS + 5;
const groupName = __ENV.GROUP || 'scale';
const preVU = Number(__ENV.PRE_ALLOCATED_VUS || 40);
const maxVU = Number(__ENV.MAX_VUS || Math.max(preVU, Math.ceil(rate / 3)));

// MEM FIX: parse fixture file once inside SharedArray (not per-VU module level).
const requests = new SharedArray('burst-retry-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});

export const options = {
  scenarios: {
    burst_retry: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: `${totalS}s`,
      preAllocatedVUs: preVU,
      maxVUs: maxVU,
    },
  },
  thresholds: {
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  const index = exec.scenario.iterationInTest;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, {
    profile: 'e2_burst_retry',
    target_rate: String(rate),
    burst: '1',
  });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const vals = (name) => {
    const m = metrics[name];
    if (!m) return {};
    return m.values || m;
  };
  const count = (name) => Number(vals(name).count || 0);
  const pct = (p) => Number(vals('gate_e_eventual_latency_ms')[`p(${p})`] || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const state = data.state || {};
  const wall = state.testRunDurationMs ? state.testRunDurationMs / 1000 : totalS;
  const started = count('iterations');
  const dropped = count('dropped_iterations');
  const scheduled = Math.round(rate * wall);
  const fresh = count('gate_e_fresh_completions');
  const summary = {
    profile: `E2 Burst ${rate}/s retry-contract`,
    target_rate: rate,
    ramp_s: rampS,
    hold_s: holdS,
    duration_s: wall,
    success,
    fail,
    eventual_success_rate: success + fail > 0 ? success / (success + fail) : 0,
    // load-generator accounting (v3.0 §10-12)
    scheduled_arrivals: scheduled,
    started_iterations: started,
    dropped_iterations: dropped,
    start_rate: started > 0 ? started / scheduled : 0,
    offered_success_rate: scheduled > 0 ? fresh / scheduled : 0,
    started_success_rate: started > 0 ? fresh / started : 0,
    // eventual KPI (v3.0 §31)
    t50_ms: pct(50),
    t95_ms: pct(95),
    t99_ms: pct(99),
    t99_9_ms: pct(99.9),
    retries_total: count('gate_e_capacity_retries'),
    retries_per_student: success > 0 ? count('gate_e_capacity_retries') / success : 0,
    fresh_completions: fresh,
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    http_reqs: count('http_reqs'),
    '429': count('gate_e_rate_limited_429'),
    '503_total': count('gate_e_capacity_busy_503'),
    '503_unit': count('gate_e_busy_503_unit'),
    '503_aggregate': count('gate_e_busy_503_aggregate'),
    '503_unexpected': count('gate_e_busy_503_unexpected'),
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/eduk12-burst-retry-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
