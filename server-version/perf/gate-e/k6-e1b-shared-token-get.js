/**
 * E1b — shared-link capacity: same NAT IP, SAME start token, distinct recovery ids.
 * Levels 60/250/500 GETs. Abuse mode (ABUSE=1) hammers until 429 expected.
 */
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';
import { recordEventualOutcome } from './lib/eventual-success.js';

const fixturePath = __ENV.E1_FIXTURE_FILE || '/tmp/eduk12-gate47-fixtures/e1-public-tokens.json';
const fixtures = JSON.parse(open(fixturePath));
const peak = Number(__ENV.PEAK || 60);
const abuse = String(__ENV.ABUSE || '0') === '1';
const iterations = Number(__ENV.ITERATIONS || (abuse ? 150 : 1));
const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

const shared = new SharedArray('e1b-shared', () => {
  const token = fixtures.sharedToken;
  if (!token) throw new Error('sharedToken missing in E1 fixture');
  return [token];
});

const okCount = new Counter('e1_http_ok');
const status429 = new Counter('e1_http_429');
const status5xx = new Counter('e1_http_5xx');
const successRate = new Rate('e1_get_success_rate');

export const options = abuse
  ? {
      scenarios: {
        e1b_abuse: {
          executor: 'constant-arrival-rate',
          rate: Number(__ENV.ABUSE_RATE || 1500),
          timeUnit: '1s',
          duration: String(__ENV.ABUSE_DURATION || '20s'),
          preAllocatedVUs: Number(__ENV.PRE_VUS || 200),
          maxVUs: Number(__ENV.MAX_VUS || 400),
        },
      },
      thresholds: {
        // Abuse must eventually observe 429
        e1_http_429: ['count>0'],
      },
    }
  : {
      scenarios: {
        e1b_shared: {
          executor: 'per-vu-iterations',
          vus: peak,
          iterations,
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
  const token = shared[0];
  const vu = __VU || 1;
  const iter = __ITER || 0;
  const recovery = `e1b-recovery-${String(vu).padStart(5, '0')}-${String(iter).padStart(5, '0')}-identity`;
  const started = Date.now();
  const res = http.get(`${baseUrl}/api/public/questionnaires/${token}`, {
    headers: {
      'x-recovery-token': recovery,
      Accept: 'application/json',
    },
    tags: { profile: abuse ? 'e1b_abuse' : 'e1b', peak: String(peak) },
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
    tags: { profile: abuse ? 'e1b_abuse' : 'e1b' },
  });
}

export function handleSummary(data) {
  const path = __ENV.GATE_E_SUMMARY_PATH;
  const out = {
    profile: abuse ? 'e1b_abuse' : 'e1b',
    peak,
    abuse,
    metrics: data.metrics,
  };
  const files = {};
  if (path) files[path] = JSON.stringify(out, null, 2);
  return files;
}
