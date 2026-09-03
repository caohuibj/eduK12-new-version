/**
 * E1 Public NAT — many VUs behind one client IP (100/250/500).
 * Primary KPI: gate_e_eventual_success_rate + eventual success count.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const peak = Number(__ENV.NAT_PEAK || 100);
const groupName = __ENV.GROUP || 'scale';

const requests = new SharedArray('e1-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e1_public_nat: {
      executor: 'per-vu-iterations',
      vus: peak,
      iterations: 1,
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
  thresholds: {
    gate_e_eventual_success_rate: [
      `rate>=${__ENV.MIN_SUCCESS_RATE || '0.01'}`,
    ],
  },
};

export default function () {
  const index = (__VU - 1);
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e1_public_nat', peak: String(peak) });
}
