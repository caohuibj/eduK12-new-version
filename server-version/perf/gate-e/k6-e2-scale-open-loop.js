/**
 * E2 Scale open-loop — target 25/50/75/100 successful/s via constant-arrival-rate.
 * Measure eventual success, not offered RPS alone.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const rate = Number(__ENV.TARGET_SUCCESS_RATE || 25);
const duration = String(__ENV.DURATION || '30s');
const groupName = __ENV.GROUP || 'scale';
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || Math.max(50, rate * 4));
const maxVUs = Number(__ENV.MAX_VUS || Math.max(100, rate * 8));

const requests = new SharedArray('e2-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e2_scale_open_loop: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
};

let cursor = 0;

export default function () {
  // Fresh fixture per logical submit — do not wrap; exhausted pool records failure.
  const index = cursor;
  cursor += 1;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e2_scale_open_loop', target_rate: String(rate) });
}
