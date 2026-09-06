/**
 * E3R same-child concurrent-first-submit risk probe (Stage 3R).
 *
 * One VU per probe session; each VU fires CONCURRENCY identical submissions at
 * the SAME session id in the same tick (Promise.all of http.asyncRequest), then
 * classifies every response:
 *   - fresh success: 200 with data.replayed === false
 *   - replay:        200 with data.replayed === true (idempotent convergence)
 *   - 409:           STALE_ATTEMPT / duplicate-persistence conflict
 *   - 503:           capacity busy (bounded admission gate)
 *   - other:         anything else
 *
 * The runner (run-e3r3-probe.sh) supplies a FRESH fixture file per concurrency
 * level (tail-of-pool IN_PROGRESS sessions) and separately verifies durable
 * persistence: raw-submission rows and session completion count for those ids.
 */
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '/workspace/eduk12-pr49-cloud-results/e3r-probe-normal.json';
const groupName = __ENV.GROUP || 'cognitiveNormal';
const concurrency = Number(__ENV.CONCURRENCY || 2);
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const requests = new SharedArray('e3r-probe-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});

const freshSuccess = new Counter('probe_fresh_success');
const replayCount = new Counter('probe_replay');
const c409 = new Counter('probe_409');
const c503 = new Counter('probe_503');
const cOther = new Counter('probe_other');
const latency = new Trend('probe_latency_ms', true);

export const options = {
  vus: requests.length,
  iterations: requests.length,
  // Exact p(50)/p(99) from the Trend summary (k6 default omits them).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

function classify(res) {
  const ms = Number((res.timings && res.timings.duration) || 0);
  latency.add(ms);
  let replayed = false;
  if (res.body) {
    try {
      const parsed = JSON.parse(res.body);
      const data = parsed && parsed.data ? parsed.data : parsed;
      replayed = Boolean(data && data.replayed === true);
    } catch (_err) { /* non-JSON body */ }
  }
  const status = Number(res.status || 0);
  if (status === 200 && !replayed) freshSuccess.add(1);
  else if (status === 200 && replayed) replayCount.add(1);
  else if (status === 409) c409.add(1);
  else if (status === 503) c503.add(1);
  else cOther.add(1);
  return { status, replayed, ms };
}

export default async function () {
  const fixture = requests[__VU - 1];
  if (!fixture) return;
  const url = baseUrl + fixture.path;
  const body = JSON.stringify(fixture.body);
  const params = { headers: fixture.headers, tags: { probe: 'concurrent-first-submit', session: fixture.sessionId } };
  const attempts = Array.from({ length: concurrency }, () => http.asyncRequest('POST', url, body, params));
  const results = await Promise.all(attempts);
  results.forEach(classify);
}

export function handleSummary(data) {
  const values = (name) => (data.metrics[name] || {}).values || {};
  const count = (name) => Number(values(name).count || 0);
  const lv = values('probe_latency_ms');
  const summary = {
    profile: 'e3r_concurrent_first_submit_probe',
    concurrency,
    fixture_count: requests.length,
    expected_requests: concurrency * requests.length,
    fresh_success: count('probe_fresh_success'),
    replay: count('probe_replay'),
    '409': count('probe_409'),
    '503': count('probe_503'),
    other: count('probe_other'),
    latency_ms: {
      count: Number(lv.count || 0),
      p50: Number(lv['p(50)'] || 0),
      p90: Number(lv['p(90)'] || 0),
      p95: Number(lv['p(95)'] || 0),
      p99: Number(lv['p(99)'] || 0),
      max: Number(lv.max || 0),
      avg: Number(lv.avg || 0),
    },
    sessions: requests.map((f) => f.sessionId),
  };
  const outPath = __ENV.PROBE_SUMMARY_PATH || '/tmp/e3r-probe-last.json';
  return {
    stdout: JSON.stringify(summary, null, 2),
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
