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
import { steadyLatencyQuantiles } from './lib/eventual-success.js';

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
// k6 constant-arrival-rate pacing can overshoot the configured warmup count by
// a few iterations, so warmup and steady use DISJOINT fixture zones: warmup
// takes indices [0, warmupCap), steady takes [warmupCap, warmupCap+steady).
// warmupCap = 1.5x the configured warmup (5/s x 10s -> 75) absorbs the slack
// without ever colliding with steady's fresh slice.
const warmupCap = Math.ceil(warmupRate * warmupSeconds * 1.5);
const warmupFixtures = Math.ceil(warmupRate * warmupSeconds);
const steadyFixtures = Math.ceil(rate * durationSeconds);
const requests = new SharedArray('e3-knee-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});
if (requests.length < warmupCap + steadyFixtures) {
  throw new Error(
    `E3 knee fixture pool exhausted: group="${groupName}" pool=${requests.length} required=${warmupCap + steadyFixtures}`,
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
  // k6 v0.52 Trend summaries omit p(50)/p(99) by default; expose them so the
  // Stage 2R accounting can read exact percentiles from the summary instead of
  // relying on per-VU module state (which k6 does not share with handleSummary).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  const isWarmup = exec.scenario.name === 'e3_cognitive_knee_warmup';
  const index = isWarmup
    ? exec.scenario.iterationInTest
    : warmupCap + exec.scenario.iterationInTest;
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
  const success = count('gate_e_steady_eventual_success');
  const fail = count('gate_e_steady_eventual_failure');
  const wall = (data.state && data.state.testRunDurationMs) ? data.state.testRunDurationMs / 1000 : 0;
  // Stage 2R corrected accounting. For constant-arrival-rate, every started
  // steady iteration records exactly one eventual outcome, so the authoritative
  // steady started count is success + fail; dropped (arrivals that never got a
  // VU) is added to give actual offered = started + dropped. iterations_total /
  // dropped_iterations stay as raw k6 cross-checks.
  const iterationsTotal = count('iterations');
  const droppedTotal = count('dropped_iterations');
  const steadyStarted = success + fail;
  const steadyDropped = Math.max(0, droppedTotal);
  const latency = values('gate_e_steady_eventual_latency_ms');
  // Percentiles come from the Trend summary (summaryTrendStats above) so they
  // are exact across all VUs; the raw-sample quantile module state is VU-local
  // in k6 and is only used as a fallback when p(50)/p(99) are absent.
  const q = steadyLatencyQuantiles();
  // k6's JS dialect has no `??`; use an explicit undefined/null fallback.
  const lt = (k, fallback) => {
    const v = latency[k];
    return (v === undefined || v === null) ? fallback : Number(v);
  };
  const summary = {
    profile: 'e3_cognitive_knee',
    payload_class: groupName,
    offered_rate: rate,
    warmup_rate: warmupRate,
    warmup_seconds: warmupSeconds,
    steady_duration_seconds: durationSeconds,
    wall_seconds_including_warmup: wall,
    iterations_total: iterationsTotal,
    dropped_iterations: droppedTotal,
    steady_started: steadyStarted,
    steady_dropped: steadyDropped,
    steady_actual_offered: steadyStarted + steadyDropped,
    steady_offered_configured: rate * durationSeconds,
    success,
    fail,
    eventual_success_rate: success + fail > 0 ? success / (success + fail) : 0,
    productive_final_per_s: durationSeconds > 0 ? success / durationSeconds : 0,
    fresh_completions: count('gate_e_steady_fresh_completions'),
    idempotent_replays: count('gate_e_steady_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    latency_ms: {
      count: q ? q.count : Number(latency.count || 0),
      p50: lt('p(50)', q ? q.p50 : 0),
      p90: lt('p(90)', q ? q.p90 : 0),
      p95: lt('p(95)', q ? q.p95 : 0),
      p99: lt('p(99)', q ? q.p99 : 0),
      max: lt('max', q ? q.max : 0),
      avg: lt('avg', q ? q.avg : 0),
      med: lt('med', 0),
    },
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
    capacity_retries: count('gate_e_capacity_retries'),
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/gate-e-e3-knee-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
