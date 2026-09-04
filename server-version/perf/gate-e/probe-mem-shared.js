/**
 * Memory probe variant: JSON.parse INSIDE SharedArray callback (runs once).
 * Usage: k6 run --quiet probe-mem-shared.js
 * Env: FIXTURE_FILE=<path>
 */
import { SharedArray } from 'k6/data';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const requests = new SharedArray('probe-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  const group = fixtures['scale'];
  return Array.isArray(group) ? group : (group && Array.isArray(group.requests) ? group.requests : []);
});

export const options = {
  scenarios: {
    probe: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 20,
      maxDuration: '5s',
    },
  },
};

export default function () {
  const n = requests.length;
  console.log(`PROBE fixtures=${n}`);
}
