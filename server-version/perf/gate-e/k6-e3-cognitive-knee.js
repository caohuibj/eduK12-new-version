/**
 * E3 Cognitive normal payload sustainable knee.
 *
 * Uses constant-arrival-rate for the offered-load sweep. The warmup scenario
 * consumes a separate fixture band and is excluded from the steady-state
 * summary by its scenario tag in downstream analysis.
 */
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const groupName = __ENV.GROUP || 'cognitiveNormal';
const rate = Number(__ENV.RATE || __ENV.TARGET_SUCCESS_RATE || 20);
const duration = String(__ENV.DURATION || '60s');
const warmupSeconds = Number(__ENV.WARMUP_SECONDS || 10);
const warmupRate = Number(__ENV.WARMUP_RATE || Math.max(1, Math.min(rate, 5)));
const preAllocatedVUs = Math.max(10, Number(__ENV.PRE_ALLOCATED_VUS || rate * 4));
const maxVUs = Math.max(preAllocatedVUs, Number(__ENV.MAX_VUS || rate * 8));

const secondsFromDuration = (value) => {
  const match = String(value).match(/^(\d+)(s|m)$/);
  if (!match) throw new Error(`DURATION must use Ns or Nm (got ${value})`);
  return Number(match[1]) * (match[2] === 'm' ? 60 : 1);
};
const durationSeconds = secondsFromDuration(duration);
const warmupFixtures = Math.ceil(warmupRate * warmupSeconds);
const steadyFixtures = Math.ceil(rate * durationSeconds);
const requests = new SharedArray('e3-knee-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});
if (requests.length < warmupFixtures + steadyFixtures) {
  throw new Error(
    `E3 knee fixture pool exhausted: group="${groupName}" pool=${requests.length} required=${warmupFixtures + steadyFixtures}`,
  );
}

export const options = {
  scenarios: {
    e3_cognitive_knee_warmup: {
      executor: 'constant-arrival-rate',
      rate: warmupRate,
      timeUnit: '1s',
      duration: `${warmupSeconds}s`,
      preAllocatedVUs: Math.max(2, Math.min(preAllocatedVUs, warmupRate * 2)),
      maxVUs: Math.max(2, Math.min(maxVUs, warmupRate * 4)),
      tags: { phase: 'warmup' },
    },
    e3_cognitive_knee_steady: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      startTime: `${warmupSeconds}s`,
      duration,
      preAllocatedVUs,
      maxVUs,
      tags: { phase: 'steady' },
    },
  },
  thresholds: {
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  const isWarmup = exec.scenario.name === 'e3_cognitive_knee_warmup';
  const index = isWarmup
    ? exec.scenario.iterationInTest
    : warmupFixtures + exec.scenario.iterationInTest;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, {
    profile: 'e3_cognitive_knee',
    payload_class: groupName,
    offered_rate: String(isWarmup ? warmupRate : rate),
    phase: isWarmup ? 'warmup' : 'steady',
  });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const values = (name) => (metrics[name] || {}).values || {};
  const count = (name) => Number(values(name).count || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const wall = data.state?.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const summary = {
    profile: 'e3_cognitive_knee',
    payload_class: groupName,
    offered_rate: rate,
    warmup_rate: warmupRate,
    warmup_seconds: warmupSeconds,
    steady_duration_seconds: durationSeconds,
    wall_seconds_including_warmup: wall,
    success,
    fail,
    eventual_success_rate: success + fail > 0 ? success / (success + fail) : 0,
    productive_final_per_s: durationSeconds > 0 ? success / durationSeconds : 0,
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    p95_ms: Number(values('gate_e_eventual_latency_ms')['p(95)'] || 0),
    p99_ms: Number(values('gate_e_eventual_latency_ms')['p(99)'] || 0),
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/gate-e-e3-knee-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
