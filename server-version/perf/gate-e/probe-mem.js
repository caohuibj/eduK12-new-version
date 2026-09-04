/**
 * Memory probe: load a fixture file into SharedArray and report init memory.
 * Usage: k6 run --summary-export=probe.json probe-mem.js
 * Env: FIXTURE_FILE=<path>
 */
import { SharedArray } from 'k6/data';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const requests = new SharedArray('probe-fixtures', () => {
  const group = fixtures['scale'];
  return Array.isArray(group) ? group : (group && Array.isArray(group.requests) ? group.requests : []);
});

export const options = {
  scenarios: {
    probe: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5s',
    },
  },
};

export default function () {
  // touch a few entries to force materialization
  const n = requests.length;
  let bytes = 0;
  for (let i = 0; i < Math.min(5, n); i += 1) {
    const r = requests[i];
    bytes += (r && r.body ? r.body.length : 0);
  }
  console.log(`PROBE fixtures=${n} touched_bytes=${bytes}`);
}
