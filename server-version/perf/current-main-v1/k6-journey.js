import exec from 'k6/execution';
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';
import crypto from 'k6/crypto';
import { loadFixtureGroup, pickFreshRequest } from '../gate-e/lib/http.js';

const fixtureFile = String(__ENV.FIXTURE_FILE || '');
const groupName = String(__ENV.GROUP || '');
const baseUrl = String(__ENV.BASE_URL || '').replace(/\/$/, '');
if (!fixtureFile || !groupName || !baseUrl) throw new Error('FIXTURE_FILE, GROUP and BASE_URL are required');
const fixtures = new SharedArray('current-main-journey-fixtures', () => {
  const groups = JSON.parse(open(fixtureFile));
  return loadFixtureGroup(groups, groupName);
});

const used = new Counter('journey_fixture_used');
const missing = new Counter('journey_missing_fixture');
const success = new Counter('journey_success');
const failure = new Counter('journey_failure');
const http2xx = new Counter('journey_http_2xx');
const http4xx = new Counter('journey_http_4xx');
const http5xx = new Counter('journey_http_5xx');
const network = new Counter('journey_network_error');

const rate = Number(__ENV.RATE || 1);
const duration = String(__ENV.DURATION || '5s');
const preAllocatedVUs = Number(__ENV.PRE_VUS || 4);
const maxVUs = Number(__ENV.MAX_VUS || 16);
if (!Number.isInteger(rate) || rate < 1 || rate > 500) throw new Error('invalid bounded RATE');
export const options = { scenarios: { journey: {
  executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration,
  preAllocatedVUs, maxVUs, gracefulStop: '0s',
} } };

export default function () {
  const fixture = pickFreshRequest(fixtures, exec.scenario.iterationInTest);
  if (!fixture) {
    missing.add(1);
    failure.add(1);
    check(false, { 'journey fixture present': () => false });
    return;
  }
  used.add(1);
  const body = fixture.body ? JSON.stringify(fixture.body) : null;
  const response = http.request(fixture.method, `${baseUrl}${fixture.path}`, body, {
    headers: fixture.headers,
    responseType: fixture.expectedSha256 ? 'binary' : 'text',
  });
  if (response.status === 0) network.add(1);
  else if (response.status >= 200 && response.status < 300) http2xx.add(1);
  else if (response.status >= 400 && response.status < 500) http4xx.add(1);
  else if (response.status >= 500 && response.status < 600) http5xx.add(1);
  let identityOkay = true;
  if (fixture.expectedAttemptId) {
    try { identityOkay = JSON.parse(response.body).data?.attemptId === fixture.expectedAttemptId; }
    catch (_error) { identityOkay = false; }
  }
  if (fixture.expectedMimeType) {
    identityOkay = identityOkay && String(response.headers['Content-Type'] || response.headers['content-type'] || '').startsWith(fixture.expectedMimeType);
  }
  if (fixture.expectedContentLength) {
    identityOkay = identityOkay && Number(response.headers['Content-Length'] || response.headers['content-length']) === fixture.expectedContentLength;
  }
  if (fixture.expectedSha256) {
    identityOkay = identityOkay && crypto.sha256(response.body, 'hex') === fixture.expectedSha256;
  }
  const expected = fixture.expectedStatuses.includes(response.status) && identityOkay;
  if (expected) success.add(1); else failure.add(1);
  check(response, { 'journey expected status and identity': () => expected });
}
