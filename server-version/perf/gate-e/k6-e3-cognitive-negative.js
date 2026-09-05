/**
 * E3 Cognitive negative contract.
 *
 * This deliberately exceeds the business trial limit and is never included in
 * capacity curves. It proves the production route rejects invalid workload
 * input before scoring/persistence.
 */
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const groupName = __ENV.GROUP || 'cognitiveNormal';
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

const requests = new SharedArray('e3-negative-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});
if (!requests.length) throw new Error(`E3 negative fixture group is empty: ${groupName}`);

const source = requests[0];
const sourceTrials = Array.isArray(source.body?.trials) ? source.body.trials : [];
const seedTrial = sourceTrials[0] || {
  trialIndex: 0,
  phase: 'test',
  payload: { correct: true, rtMs: 400 },
  startedAtPerfMs: 0,
  endedAtPerfMs: 400,
};
const invalidBody = Object.assign({}, source.body, {
  submissionId: `${source.body?.submissionId || 'e3-negative'}-too-many-trials`,
  trials: Array.from({ length: 1001 }, (_, index) => Object.assign({}, seedTrial, {
    trialIndex: index,
    startedAtPerfMs: index * 1000,
    endedAtPerfMs: index * 1000 + 400,
  })),
});

const authHeaders = () => {
  const headers = Object.assign({}, source.headers || {}, { 'Content-Type': 'application/json' });
  const authToken = String(__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || '').trim();
  const csrfToken = String(__ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN || '').trim();
  if (authToken) {
    headers.Cookie = `ptool_session=${encodeURIComponent(authToken)}${csrfToken ? `; ptool_csrf=${encodeURIComponent(csrfToken)}` : ''}`;
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }
  return headers;
};

export const options = {
  scenarios: {
    e3_cognitive_negative: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: { checks: ['rate==1'] },
};

export default function () {
  const response = http.request(
    'POST',
    `${baseUrl}${String(source.path || '').startsWith('/') ? source.path : `/${source.path || ''}`}`,
    JSON.stringify(invalidBody),
    { headers: authHeaders(), tags: { profile: 'e3_cognitive_negative', payload_class: 'oversize' } },
  );
  check(response, {
    'too-many-trials rejected': (value) => value.status >= 400 && value.status < 500 && value.status !== 429,
  });
}

export function handleSummary(data) {
  const status = Number(data.metrics?.http_req_failed?.values?.count || 0);
  const summary = {
    profile: 'e3_cognitive_negative',
    group: groupName,
    trial_count: invalidBody.trials.length,
    rejected: status === 0,
    capacity_benchmark: false,
  };
  return { stdout: `${JSON.stringify(summary, null, 2)}\n` };
}
