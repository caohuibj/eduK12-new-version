/**
 * E3 Cognitive payload sizes — small / normal / near-1.5MiB.
 * Set GROUP=cognitiveSmall|cognitiveNormal|cognitiveLarge (or fixture keys).
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const groupName = __ENV.GROUP || 'cognitiveNormal';
const vus = Number(__ENV.VUS || 10);
const iterations = Number(__ENV.ITERATIONS || 1);

const requests = new SharedArray('e3-fixtures', () => {
  // Grouped fixture file ({ cognitiveSmall|cognitiveNormal|cognitiveLarge: [...] })
  // or a legacy flat list.
  const group = loadFixtureGroup(fixtures, groupName);
  if (group.length) return group;
  if (Array.isArray(fixtures)) return fixtures;
  return [];
});

if (requests.length < vus * iterations) {
  throw new Error(
    `E3 fixture pool exhausted: group="${groupName}" pool=${requests.length} required=${vus * iterations}`,
  );
}

export const options = {
  scenarios: {
    e3_cognitive_payload: {
      executor: 'per-vu-iterations',
      vus,
      iterations,
      maxDuration: String(__ENV.MAX_DURATION || '5m'),
    },
  },
};

export default function () {
  const index = (__VU - 1) * iterations + __ITER;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, {
    profile: 'e3_cognitive_payload',
    payload_class: String(__ENV.PAYLOAD_CLASS || groupName),
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
    profile: 'e3_cognitive_payload',
    payload_class: String(__ENV.PAYLOAD_CLASS || groupName),
    vus,
    success,
    fail,
    success_rate: success + fail > 0 ? success / (success + fail) : 0,
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    '503_busy_unit': count('gate_e_busy_503_unit'),
    '503_busy_aggregate': count('gate_e_busy_503_aggregate'),
    '503_unexpected': count('gate_e_busy_503_unexpected'),
    p95_ms: p95,
    p99_ms: p99,
    duration_s: testRun,
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/gate-e-e3-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
