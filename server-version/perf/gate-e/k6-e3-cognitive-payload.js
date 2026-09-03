/**
 * E3 Cognitive payload sizes — small / normal / near-1.5MiB.
 * Set GROUP=cognitiveSmall|cognitiveNormal|cognitiveLarge (or fixture keys).
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const groupName = __ENV.GROUP || 'cognitive';
const vus = Number(__ENV.VUS || 10);
const iterations = Number(__ENV.ITERATIONS || 1);

const requests = new SharedArray('e3-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e3_cognitive_payload: {
      executor: 'per-vu-iterations',
      vus,
      iterations,
      maxDuration: String(__ENV.MAX_DURATION || '5m'),
    },
  },
};

export default function () {
  const index = (__VU - 1) * iterations + __ITER;
  const request = pickFreshRequest(requests, index);
  runLogicalSubmit(request, {
    profile: 'e3_cognitive_payload',
    payload_class: String(__ENV.PAYLOAD_CLASS || groupName),
  });
}
