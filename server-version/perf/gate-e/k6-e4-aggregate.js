/**
 * E4 Aggregate — many-parent stampede and same-parent concurrent last-unit.
 * Set MODE=manyParent|sameParent and GROUP accordingly.
 *
 * sameParent: fixtures must share one parentId with distinct child/slot/submissionId
 * (seed SAME_PARENT_SIBLINGS=2|10|50). Each VU takes a distinct sibling index —
 * never pin all VUs to fixture 0 (that collapses contention into serial reuse).
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
  thresholds: {
    gate_e_missing_fixtures: ['count<1'],
  },
};

export default function () {
  // Distinct sibling / parent fixture per VU. sameParent pool must be >= PEAK
  // (seed SAME_PARENT_SIBLINGS) or missing_fixtures fails the run fail-closed.
  const index = __VU - 1;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, {
    profile: 'e4_aggregate',
    mode,
    sibling_pool: String(requests.length),
  });
}
