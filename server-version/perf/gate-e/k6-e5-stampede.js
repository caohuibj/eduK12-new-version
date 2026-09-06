/**
 * E5 Aggregate — same-parent finalize stampede (CAS / duplicate-work probe).
 *
 * Every VU pins to the SAME ready-parent last-section fixture (requests[0]).
 * A correct UNIFIED_V1 aggregate finalizer must yield exactly ONE durable
 * fresh completion; all concurrent losers observe either `replayed:true`
 * (parent already terminal, same identity) or a 409 CAS/STALE_ATTEMPT. Report
 * build + field encryption is never duplicated (only the CAS winner persists),
 * which the caller proves via DB parent-completion delta == 1 for that parent.
 *
 *   BASE_URL, FIXTURE_FILE, AUTH_TOKEN, CSRF_TOKEN, PEAK (=VUS, set by run-e5)
 *   -> NODE unique last-section fixtures are read; VU i submits requests[0].
 *     Requesting fixture[0] from the chosen SHARED pool keeps the test isolated
 *     to a single parent regardless of concurrency.
 */
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';
import http from 'k6/http';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const groupName = __ENV.GROUP || 'parentN2';
const peak = Number(__ENV.PEAK || 2);
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const authToken = String(__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || '').trim();
const csrfToken = String(__ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN || '').trim();
// Measurement integrity: a run without credentials produces 401/403 that k6
// scores as "other" and can still exit 0. Fail fast here so a misconfigured
// run yields NO RESULT instead of benchmark evidence that looks like data.
if (!authToken || !csrfToken) {
  throw new Error('E5 requires AUTH_TOKEN/PERF_AUTH_TOKEN and CSRF_TOKEN/PERF_CSRF_TOKEN to be set (see perf/README)');
}

const requests = new SharedArray('e5-stampede', () => {
  const fixtures = JSON.parse(open(fixturePath));
  const group = fixtures[groupName];
  const arr = Array.isArray(group) ? group : (group && Array.isArray(group.requests) ? group.requests : []);
  if (!arr.length) throw new Error(`stampede: empty fixture group ${groupName}`);
  return arr;
});

// Counter of outcomes so the summary is human-readable even if k6 stdout drops.
const fresh = new Counter('e5_stampede_fresh');
const replay = new Counter('e5_stampede_replay');
const cas409 = new Counter('e5_stampede_cas_409');
const busy503 = new Counter('e5_stampede_capacity_busy_503');
const rate429 = new Counter('e5_stampede_rate_limited_429');
const other = new Counter('e5_stampede_other');

export const options = {
  scenarios: {
    e5_stampede: { executor: 'per-vu-iterations', vus: peak, iterations: 1, maxDuration: '3m' },
  },
};

function doRequest(request) {
  const url = baseUrl + (request.path.startsWith('/') ? request.path : `/${request.path}`);
  const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  headers.Cookie = `ptool_session=${encodeURIComponent(authToken)}${csrfToken ? `; ptool_csrf=${encodeURIComponent(csrfToken)}` : ''}`;
  let body = null;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }
  return http.post(url, body, { headers });
}

export default function () {
  const request = requests[0]; // all VUs hammer the SAME parent last-section.
  const resp = doRequest(request);
  const parsed = (() => { try { return JSON.parse(resp.body); } catch { return null; } })();
  const replayed = Boolean(parsed && parsed.data && parsed.data.replayed === true);
  const code = resp.status;
  if (code === 200 && !replayed) { fresh.add(1); }
  else if (code === 200 && replayed) { replay.add(1); }
  else if (code === 409) { cas409.add(1); }
  else if (code === 503) { busy503.add(1); }
  else if (code === 429) { rate429.add(1); }
  else { other.add(1); }
}

export function handleSummary(data) {
  const m = data.metrics || {};
  const count = (name) => Number((m[name] || {}).values?.count || 0);
  const summary = {
    profile: 'e5_aggregate_stampede',
    group: groupName,
    peak_vus: peak,
    parent_id: requests[0] ? requests[0].parentId : null,
    submission_id: requests[0] ? requests[0].body.submissionId : null,
    fresh: count('e5_stampede_fresh'),
    idempotent_replay: count('e5_stampede_replay'),
    cas_409: count('e5_stampede_cas_409'),
    capacity_503: count('e5_stampede_capacity_busy_503'),
    rate_limited_429: count('e5_stampede_rate_limited_429'),
    other: count('e5_stampede_other'),
    total: peak,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || `/tmp/gate-e-e5-stampede-${peak}.json`;
  return { stdout: `${JSON.stringify(summary, null, 2)}\n`, [outPath]: JSON.stringify(summary, null, 2) };
}