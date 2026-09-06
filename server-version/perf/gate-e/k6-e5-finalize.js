/**
 * E5 Aggregate finalizer runner (submit last section -> POST /complete).
 *
 * UNIFIED_V1 ready-parents: each fixture is the LAST form-section submit. The
 * real student flow also issues an explicit complete call that drives
 * finalizeQuestionnaireAttemptUnifiedIfReady (report build + field encryption +
 * fingerprint CAS + parent completion). This runner replays both calls and
 * scores the COMPLETE call as the aggregate finalize workload.
 *
 *   MODE=distinct (default, per-VU fresh parent: many-parent / size curve)
 *   MODE=stampede (all VUs reuse fixture[0]: same-parent CAS/duplicate probe)
 *
 *   BASE_URL, FIXTURE_FILE, AUTH_TOKEN, CSRF_TOKEN, GROUP, PEAK (=VUS),
 *   GATE_E_SUMMARY_PATH
 */
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';
import http from 'k6/http';

const mode = String(__ENV.MODE || 'distinct');
const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const groupName = __ENV.GROUP || 'parentN5';
const peak = Number(__ENV.PEAK || 10);
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const authToken = String(__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || '').trim();
const csrfToken = String(__ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN || '').trim();

const requests = new SharedArray('e5-finalize', () => {
  const fixtures = JSON.parse(open(fixturePath));
  const group = fixtures[groupName];
  const arr = Array.isArray(group) ? group : (group && Array.isArray(group.requests) ? group.requests : []);
  if (!arr.length) throw new Error(`e5-finalize: empty fixture group ${groupName}`);
  if (mode === 'distinct' && arr.length < peak) throw new Error(`fixture pool exhausted: pool=${arr.length} peak=${peak}`);
  return arr;
});

const sFresh = new Counter('e5_submit_fresh');
const sReplay = new Counter('e5_submit_replay');
const s409 = new Counter('e5_submit_cas_409');
const s503 = new Counter('e5_submit_capacity_503');
const s429 = new Counter('e5_submit_rate_429');
const sOther = new Counter('e5_submit_other');

const cOk = new Counter('e5_complete_ok');
const c409 = new Counter('e5_complete_cas_409');
const c503 = new Counter('e5_complete_capacity_503');
const c429 = new Counter('e5_complete_rate_429');
const cOther = new Counter('e5_complete_other');

const finLat = new Trend('e5_finalize_latency_ms', true);

export const options = {
  scenarios: { e5_finalize: { executor: 'per-vu-iterations', vus: peak, iterations: 1, maxDuration: '4m' } },
};

function makeHeaders() {
  const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
  h.Cookie = `ptool_session=${encodeURIComponent(authToken)}${csrfToken ? `; ptool_csrf=${encodeURIComponent(csrfToken)}` : ''}`;
  return h;
}
function post(url, body) { return http.post(url, body, { headers: makeHeaders() }); }
function parseResp(r) { try { return JSON.parse(r.body); } catch (e) { return null; } }
function isReplayed(p) { return Boolean(p && p.data && p.data.replayed === true); }

export default function () {
  const targetIndex = Number(__ENV.FIXTURE_INDEX || 0);
  const offset = Number(__ENV.FIXTURE_OFFSET || 0);
  const idx = mode === 'stampede' ? targetIndex : offset + Number(__VU) - 1;
  const request = requests[idx];
  if (!request) { cOther.add(1); return; }
  const submitPath = baseUrl + (request.path.startsWith('/') ? request.path : `/${request.path}`);
  const completePath = `${baseUrl}/api/questionnaires/assessments/${request.parentId}/complete`;
  let body = null;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  // Step 1: submit last section.
  const sr = post(submitPath, body);
  const sp = parseResp(sr);
  if (sr.status === 200 && !isReplayed(sp)) sFresh.add(1);
  else if (sr.status === 200) sReplay.add(1);
  else if (sr.status === 409) s409.add(1);
  else if (sr.status === 503) s503.add(1);
  else if (sr.status === 429) s429.add(1);
  else sOther.add(1);

  // Step 2: complete (aggregate finalize).
  const started = Date.now();
  const cr = post(completePath, null);
  finLat.add(Date.now() - started);
  const cp = parseResp(cr);
  if (cr.status === 200 && !isReplayed(cp)) cOk.add(1);
  else if (cr.status === 200) cOk.add(1);
  else if (cr.status === 409) c409.add(1);
  else if (cr.status === 503) c503.add(1);
  else if (cr.status === 429) c429.add(1);
  else cOther.add(1);
}

export function handleSummary(data) {
  const m = data.metrics || {};
  const c = (n) => Number(((m[n] || {}).values || {}).count || 0);
  const dur = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const ok = c('e5_complete_ok');
  const lat = (m.e5_finalize_latency_ms && m.e5_finalize_latency_ms.values) ? m.e5_finalize_latency_ms.values : {};
  const summary = {
    profile: 'e5_aggregate_finalize',
    mode,
    group: groupName,
    peak_vus: peak,
    duration_s: Number(dur.toFixed(2)),
    complete_ok: ok,
    finalize_per_s: dur > 0 ? Number((ok / dur).toFixed(3)) : 0,
    submit: {
      fresh: c('e5_submit_fresh'),
      replay: c('e5_submit_replay'),
      cas_409: c('e5_submit_cas_409'),
      capacity_503: c('e5_submit_capacity_503'),
      rate_429: c('e5_submit_rate_429'),
      other: c('e5_submit_other'),
    },
    complete: {
      ok: ok,
      cas_409: c('e5_complete_cas_409'),
      capacity_503: c('e5_complete_capacity_503'),
      rate_429: c('e5_complete_rate_429'),
      other: c('e5_complete_other'),
    },
    finalize_latency_ms: {
      p50: Number((lat['p(50)'] || 0).toFixed(1)),
      p95: Number((lat['p(95)'] || 0).toFixed(1)),
      p99: Number((lat['p(99)'] || 0).toFixed(1)),
      max: Number((lat.max || 0).toFixed(1)),
    },
    fixture_pool_size: requests.length,
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || `/tmp/gate-e-e5-${mode}-${groupName}-${peak}.json`;
  return { stdout: `${JSON.stringify(summary, null, 2)}\n`, [outPath]: JSON.stringify(summary, null, 2) };
}