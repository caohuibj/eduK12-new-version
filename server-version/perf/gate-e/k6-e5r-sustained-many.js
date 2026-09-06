/**
 * 5R-B Aggregate SUSTAINED many-parent throughput.
 *
 * Replaces the one-shot per-VU burst capacity estimate with a true
 * constant-arrival-rate 30s steady finalize workload. Each logical iteration
 * uses a FRESH distinct ready-parent (last-section submit -> POST /complete),
 * so finalize_per_s here is a sustained drain rate, not completions/burst-wall.
 *
 * The isolated DB `db_completed_delta` in the runner is still the authority for
 * durable fresh parent completions; this k6 summary records offered parent
 * arrivals, complete-call HTTP outcomes, exact 409 classification (by body
 * reason field), COMPLETION_BUSY, latency, and dropped arrivals.
 *
 *   FIXTURE_FILE (ready-parent group parentN5), RATE, DURATION (30s),
 *   FIXTURE_OFFSET (disjoint slices), BASE_URL, AUTH_TOKEN, CSRF_TOKEN,
 *   GATE_E_SUMMARY_PATH
 */
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Rate } from 'k6/metrics';
import http from 'k6/http';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/ready-parent-fixtures.json';
const groupName = __ENV.GROUP || 'parentN5';
const rate = Number(__ENV.RATE || 20);
const duration = String(__ENV.DURATION || '30s');
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const authToken = String(__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || '').trim();
const csrfToken = String(__ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN || '').trim();
// Measurement integrity: a run without credentials produces 401/403 that k6
// scores as "other" and can still exit 0. Fail fast here so a misconfigured
// run yields NO RESULT instead of benchmark evidence that looks like data.
if (!authToken || !csrfToken) {
  throw new Error('E5 requires AUTH_TOKEN/PERF_AUTH_TOKEN and CSRF_TOKEN/PERF_CSRF_TOKEN to be set (see perf/README)');
}

const requests = new SharedArray('e5r-many', () => {
  const fixtures = JSON.parse(open(fixturePath));
  const group = fixtures[groupName];
  const arr = Array.isArray(group) ? group : (group && Array.isArray(group.requests) ? group.requests : []);
  if (!arr.length) throw new Error(`e5r-many: empty fixture group ${groupName}`);
  return arr;
});

// offered/started/dropped accounting (like E2 open-loop, spec §10-11)
const cFreshDone = new Counter('e5r_fresh_parent_done');
const cReplay = new Counter('e5r_parent_replay');
const c409 = new Counter('e5r_complete_409');
const c409Fingerprint = new Counter('e5r_409_fingerprint');
const c409Sequencing = new Counter('e5r_409_sequencing');
const c409Completed = new Counter('e5r_409_already_completed');
const c409Unclassified = new Counter('e5r_409_unclassified');
const cBusy = new Counter('e5r_completion_busy');
const c503 = new Counter('e5r_complete_503');
const c429 = new Counter('e5r_complete_429');
const cOther = new Counter('e5r_complete_other');
const cDrop = new Counter('e5r_dropped_iterations');

const finLat = new Trend('e5r_finalize_latency_ms', true);
const missRate = new Rate('e5r_missing_fixture_rate');

const preAllocatedVUs = Math.max(5, Number(__ENV.PRE_ALLOCATED_VUS || Math.max(20, rate * 2)));
const maxVUs = Math.max(preAllocatedVUs, Number(__ENV.MAX_VUS || Math.max(60, rate * 4)));

export const options = {
  scenarios: {
    e5r_many: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: { e5r_missing_fixture_rate: ['rate<1'] },
};

function makeHeaders() {
  const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
  h.Cookie = `ptool_session=${encodeURIComponent(authToken)}${csrfToken ? `; ptool_csrf=${encodeURIComponent(csrfToken)}` : ''}`;
  return h;
}
function post(url, body) { return http.post(url, body, { headers: makeHeaders() }); }
function parseResp(r) { try { return JSON.parse(r.body); } catch (e) { return null; } }
function reasonOf(p) {
  if (!p) return '';
  const d = p.data;
  const e = p.error;
  return String((d && d.reason) || p.reason || (e && e.reason) || p.error || p.code || '');
}
function isReplayed(p) { return Boolean(p && p.data && p.data.replayed === true); }

export default function () {
  const offset = Number(__ENV.FIXTURE_OFFSET || 0);
  const index = offset + exec.scenario.iterationInTest;
  const request = requests[index];
  if (!request) { cDrop.add(1); missRate.add(false); return; }

  const submitPath = baseUrl + (request.path.startsWith('/') ? request.path : `/${request.path}`);
  const completePath = `${baseUrl}/api/questionnaires/assessments/${request.parentId}/complete`;
  let body = null;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  // Step 1: submit last section (fresh parent).
  const sr = post(submitPath, body);
  const sp = parseResp(sr);
  if (sr.status === 200 && !isReplayed(sp)) { /* last-section fresh durable */ }
  else if (sr.status === 200) { cReplay.add(1); }
  else if (sr.status === 503) { c503.add(1); }
  else if (sr.status === 429) { c429.add(1); }
  else if (sr.status === 409) { c409.add(1); }

  // Step 2: complete -> aggregate finalize.
  const started = Date.now();
  const cr = post(completePath, null);
  finLat.add(Date.now() - started);
  const cp = parseResp(cr);
  const reason = reasonOf(cp);

  if (cr.status === 200) {
    // Durable fresh parent completion is $DB-completed-delta authority; HTTP 200
    // here is the finalize acknowledgment (fresh or replay-on-close).
    cFreshDone.add(1);
  } else if (cr.status === 409) {
    c409.add(1);
    const r = reason.toLowerCase();
    if (r.includes('fingerprint') || r.includes('snapshot')) c409Fingerprint.add(1);
    else if (r.includes('sequenc') || r.includes('order') || r.includes('state')) c409Sequencing.add(1);
    else if (r.includes('completed') || r.includes('finaliz')) c409Completed.add(1);
    else c409Unclassified.add(1);
  } else if (cr.status === 503) {
    c503.add(1);
    if (reason.toLowerCase().includes('busy') || cr.body.includes('BUSY')) cBusy.add(1);
  } else if (cr.status === 429) {
    c429.add(1);
  } else {
    cOther.add(1);
  }
}

export function handleSummary(data) {
  const m = data.metrics || {};
  const c = (n) => Number(((m[n] || {}).values || {}).count || 0);
  const durRm = (data.state || {}).testRunDurationMs ? (data.state.testRunDurationMs / 1000) : 0;
  const lat = (m.e5r_finalize_latency_ms && m.e5r_finalize_latency_ms.values) ? m.e5r_finalize_latency_ms.values : {};
  const fresh = c('e5r_fresh_parent_done');
  const started = c('iterations');
  const dropped = c('e5r_dropped_iterations');
  const offered = Math.round(rate * durRm);
  const summary = {
    profile: 'e5r_aggregate_sustained_many',
    group: groupName,
    target_finalize_rate: rate,
    duration_s: Number(durRm.toFixed(2)),
    offers_made: Number(offered),
    iterations_started: started,
    iterations_dropped: dropped,
    complete_ok: fresh,
    productive_finalize_per_s: durRm > 0 ? Number((fresh / durRm).toFixed(3)) : 0,
    // DB-completed-delta in the runner JSON remains the durable-parents authority.
    offered_success_rate: offered > 0 ? Number((fresh / offered).toFixed(4)) : 0,
    started_rate: started > 0 ? Number((fresh / started).toFixed(4)) : 0,
    replay_parent: c('e5r_parent_replay'),
    complete: {
      ok: fresh,
      cas_409: c('e5r_complete_409'),
      fingerprint_409: c('e5r_409_fingerprint'),
      sequencing_409: c('e5r_409_sequencing'),
      already_completed_409: c('e5r_409_already_completed'),
      unclassified_409: c('e5r_409_unclassified'),
      completion_busy: c('e5r_completion_busy'),
      capacity_503: c('e5r_complete_503'),
      rate_429: c('e5r_complete_429'),
      other: c('e5r_complete_other'),
    },
    finalize_latency_ms: {
      p50: Number((lat['p(50)'] || 0).toFixed(1)),
      p95: Number((lat['p(95)'] || 0).toFixed(1)),
      p99: Number((lat['p(99)'] || 0).toFixed(1)),
      max: Number((lat.max || 0).toFixed(1)),
    },
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || `/tmp/gate-e-e5r-sustained-${groupName}-${rate}.json`;
  return { stdout: `${JSON.stringify(summary, null, 2)}\n`, [outPath]: JSON.stringify(summary, null, 2) };
}