/**
 * E1 Public NAT — many VUs behind one client IP (100/250/500).
 * Primary KPI: gate_e_eventual_success_rate + eventual success count.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const peak = Number(__ENV.NAT_PEAK || 100);
const groupName = __ENV.GROUP || 'scale';

const requests = new SharedArray('e1-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e1_public_nat: {
      executor: 'per-vu-iterations',
      vus: peak,
      iterations: 1,
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
  thresholds: {
    gate_e_eventual_success_rate: [
      `rate>=${__ENV.MIN_SUCCESS_RATE || '0.01'}`,
    ],
  },
};

export default function () {
  // FIXTURE_OFFSET lets a fresh, still-unconsumed band of a shared pool be
  // used after an earlier scale run has consumed the leading fixtures.
  const offset = Number(__ENV.FIXTURE_OFFSET || 0);
  const index = offset + (__VU - 1);
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e1_public_nat', peak: String(peak) });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const count = (name) => Number((metrics[name] || {}).values?.count || 0);
  const p95 = Number(metrics.gate_e_eventual_latency_ms?.values?.['p(95)'] || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const testRun = data.state?.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const summary = {
    profile: 'e1_public_nat',
    peak,
    success,
    fail,
    success_rate: success + fail > 0 ? success / (success + fail) : 0,
    students_per_s: testRun > 0 ? success / testRun : 0,
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    '503_busy_unit': count('gate_e_busy_503_unit'),
    '503_busy_aggregate': count('gate_e_busy_503_aggregate'),
    '503_unexpected': count('gate_e_busy_503_unexpected'),
    p95_ms: p95,
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/gate-e-e1-nat-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
