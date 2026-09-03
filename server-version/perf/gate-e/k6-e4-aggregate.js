/**
 * E4 Aggregate — many-parent stampede and same-parent concurrent last-GET.
 * Set MODE=manyParent|sameParent and GROUP accordingly.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const mode = String(__ENV.MODE || 'manyParent');
const groupName = __ENV.GROUP || (mode === 'sameParent' ? 'sameParent' : 'mixed');
const peak = Number(__ENV.PEAK || (mode === 'sameParent' ? 50 : 100));

const requests = new SharedArray('e4-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e4_aggregate: {
      executor: 'per-vu-iterations',
      vus: peak,
      iterations: 1,
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
};

export default function () {
  const index = mode === 'sameParent' ? 0 : (__VU - 1);
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, { profile: 'e4_aggregate', mode });
}
