/**
 * E1a — NAT correctness: same client IP, different valid public start tokens.
 * Primary: GET /api/public/questionnaires/:token (shared-link entry).
 * Acceptance: success 100%, accidental 429 = 0, unexpected 5xx = 0.
 */
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';
import { recordEventualOutcome } from './lib/eventual-success.js';

const fixturePath = __ENV.E1_FIXTURE_FILE || '/tmp/eduk12-gate47-fixtures/e1-public-tokens.json';
const fixtures = JSON.parse(open(fixturePath));
const peak = Number(__ENV.PEAK || 500);
const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

const tokens = new SharedArray('e1a-tokens', () => {
  const list = fixtures.distinctTokens || [];
  if (list.length < peak) {
    throw new Error(`Need >= ${peak} distinctTokens, got ${list.length}`);
  }
  return list.slice(0, peak);
});

const okCount = new Counter('e1_http_ok');
const status429 = new Counter('e1_http_429');
const status5xx = new Counter('e1_http_5xx');
const successRate = new Rate('e1_get_success_rate');

export const options = {
  scenarios: {
    e1a_nat_distinct: {
      executor: 'per-vu-iterations',
      vus: peak,
      iterations: Number(__ENV.ITERATIONS || 1),
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
  thresholds: {
    e1_get_success_rate: ['rate>=0.999'],
    e1_http_429: ['count==0'],
    e1_http_5xx: ['count==0'],
  },
};

export default function () {
  const index = (__VU - 1) % tokens.length;
  const token = tokens[index];
  const recovery = `e1a-recovery-${String(__VU).padStart(4, '0')}-${String(__ITER).padStart(4, '0')}-pad`;
  const started = Date.now();
  const res = http.get(`${baseUrl}/api/public/questionnaires/${token}`, {
    headers: {
      'x-recovery-token': recovery,
      Accept: 'application/json',
    },
    tags: { profile: 'e1a', token_mode: 'distinct' },
  });
  const status = res.status;
  const ok = status === 200;
  if (ok) okCount.add(1);
  if (status === 429) status429.add(1);
  if (status >= 500) status5xx.add(1);
  successRate.add(ok);
  recordEventualOutcome({
    ok,
    latencyMs: Date.now() - started,
    status,
    tags: { profile: 'e1a' },
  });
}

export function handleSummary(data) {
  const path = __ENV.GATE_E_SUMMARY_PATH;
  const out = {
    profile: 'e1a',
    peak,
    metrics: data.metrics,
  };
  const files = {};
  if (path) files[path] = JSON.stringify(out, null, 2);
  return files;
}
