/**
 * Burst test — instantaneous traffic spike on the 2C4G stack.
 * Measures FIRST-WAVE acceptance: a short, high-concurrency window right after
 * ramping to the target rate. Unlike the open-loop knee curve (sustained SR),
 * here the intent is a single abrupt load spike:
 *   - ramping-vus to target quickly (arrival-rate equivalent wall-clock surge)
 *   - a short hold (5s) to observe the first-wave accept path
 *   - then ramp down; no capacity retry so we SEE raw 503 for classification.
 *
 * 503 classification: records unit / aggregate / unexpected buckets via
 * record503 (eventual-success.js). 429 is never retried (F7/design intent).
 */
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check } from 'k6';
import {
  loadFixtureGroup,
  pickFreshRequest,
  merge,
} from './lib/http.js';
import {
  isDurableSuccessStatus,
  record503,
  recordEventualOutcome,
  fixturesUsed,
  freshCompletions,
  idempotentReplays,
  missingFixtures,
  capacityBusy503,
} from './lib/eventual-success.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const rate = Number(__ENV.TARGET_SUCCESS_RATE || 250);
const rampS = Number(__ENV.RAMP_S || 3);
const holdS = Number(__ENV.HOLD_S || 5);
const totalS = rampS + holdS + 3;
const groupName = __ENV.GROUP || 'scale';
const preVU = Number(__ENV.PRE_ALLOCATED_VUS || 40);
const maxVU = Number(__ENV.MAX_VUS || Math.max(preVU, Math.ceil(rate / 4)));

const requests = new SharedArray('burst-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    burst: {
      // constant-arrival-rate gives a wall-clock surge in first r|amp seconds;
      // preAllocatedVUs is small so memory stays bounded to avoid cgroup OOM.
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
  if (!request) {
    missingFixtures.add(1);
    recordEventualOutcome({ ok: false, status: 0, tags: { reason: 'missing_fixture' } });
    check(false, { 'fixture present': (v) => v === true });
    return;
  }
  fixturesUsed.add(1, { burst: '1' });

  // SINGLE attempt — no capacity retry — so raw first-wave 503 is visible.
  const baseUrlRaw = String(__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');
  const path = String(request.path || '');
  const url = `${baseUrlRaw}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = merge(request.headers);
  if (__ENV.AUTH_TOKEN) headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN}`;
  if (request.body !== undefined && request.body !== null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  let body = null;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  const started = Date.now();
  const response = http.request(
    String(request.method || 'POST').toUpperCase(),
    url,
    body,
    { headers, tags: { burst: '1', first_wave: '1' } },
  );
  const latencyMs = Date.now() - started;
  const tags = { burst: '1', first_wave: '1', target_rate: String(rate) };

  if (isDurableSuccessStatus(response.status)) {
    freshCompletions.add(1, tags);
    recordEventualOutcome({ ok: true, latencyMs, status: response.status, tags });
    return;
  }
  if (response.status === 503) {
    const cls = record503(response.body, tags); // classifies unit/aggregate/unexpected
    recordEventualOutcome({ ok: false, latencyMs, status: 503, tags: merge(tags, { capacity503clz: cls }) });
    return;
  }
  // 429 (rate limit) — never retried.
  recordEventualOutcome({ ok: false, latencyMs, status: response.status, tags });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const vals = (name) => (metrics[name] ? metrics[name].values || metadata_ignore(metrics[name]) : {});
  const count = (name) => Number(vals(name).count || 0);
  const p50 = Number(vals('gate_e_eventual_latency_ms')['p(50)'] || 0);
  const p95 = Number(vals('gate_e_eventual_latency_ms')['p(95)'] || 0);
  const p99 = Number(vals('gate_e_eventual_latency_ms')['p(99)'] || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const state = data.state || {};
  const wall = state.testRunDurationMs ? state.testRunDurationMs / 1000 : totalS;
  const summary = {
    profile: `E2 Burst ${rate}/s first-wave`, // set below too
    target_rate: rate,
    duration_s: wall,
    success,
    fail,
    first_wave_acceptance: success + fail > 0 ? success / (success + fail) : 0,
    fresh_completions: count('gate_e_fresh_completions'),
    idempotent_replays: count('gate_e_idempotent_replays'),
    missing_fixtures: count('gate_e_missing_fixtures'),
    http_reqs: count('http_reqs'),
    '429': count('gate_e_rate_limited_429'),
    '503_total': count('gate_e_capacity_busy_503'),
    '503_unit': count('gate_e_busy_503_unit'),
    '503_aggregate': count('gate_e_busy_503_aggregate'),
    '503_unexpected': count('gate_e_busy_503_unexpected'),
    p50_ms: p50,
    p95_ms: p95,
    p99_ms: p99,
    fixture_pool_size: requests.length,
  };
  summary.profile = `E2 Burst ${rate}/s first-wave`;
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/eduk12-burst-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}

function metadata_ignore(m) { return m; }