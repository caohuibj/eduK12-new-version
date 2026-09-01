import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const fixturePath = __ENV.FIXTURE_FILE || './fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const expectedStatuses = new Set(
  String(__ENV.EXPECTED_STATUSES || '200')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean),
);

export const finalSubmitDuration = new Trend('final_submit_duration', true);
export const finalSubmitErrors = new Counter('final_submit_errors');
export const finalSubmitBusy = new Counter('final_submit_busy');

function requestsFor(groupName) {
  const group = fixtures[groupName];
  if (Array.isArray(group)) return group;
  if (group && Array.isArray(group.requests)) return group.requests;
  return [];
}

function requestIndex(index) {
  const vu = Number(__VU || 1);
  const iteration = Number(__ITER || 0);
  return Number.isFinite(index) ? index : ((vu - 1) * 100000) + iteration;
}

export function runFinalSubmit(groupName, index) {
  const requests = requestsFor(groupName);
  if (requests.length === 0) {
    finalSubmitErrors.add(1, { group: groupName, reason: 'missing_fixture' });
    check(false, { [`${groupName} fixture is present`]: (value) => value === true });
    return;
  }

  const request = requests[requestIndex(index) % requests.length];
  const path = String(request.path || '');
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { ...(request.headers || {}) };
  if (__ENV.AUTH_TOKEN) headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN}`;
  if (request.body !== undefined && request.body !== null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let body = null;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  const response = http.request(String(request.method || 'POST').toUpperCase(), url, body, {
    headers,
    tags: {
      final_submit_group: String(groupName),
      instrument: String(request.instrument || groupName),
    },
  });
  const tags = {
    group: String(groupName),
    instrument: String(request.instrument || groupName),
  };
  finalSubmitDuration.add(response.timings.duration, tags);
  if (response.status === 503) finalSubmitBusy.add(1, tags);
  const accepted = expectedStatuses.has(String(response.status));
  if (!accepted) finalSubmitErrors.add(1, { ...tags, status: String(response.status) });
  check(response, {
    [`${groupName} returned an expected status`]: (result) => expectedStatuses.has(String(result.status)),
  });

  const pause = Number(__ENV.INTER_REQUEST_SLEEP || 0);
  if (pause > 0) sleep(pause);
}
