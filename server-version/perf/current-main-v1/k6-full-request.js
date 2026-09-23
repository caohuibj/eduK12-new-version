import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from '../gate-e/lib/http.js';

const fixtureFile = String(__ENV.FIXTURE_FILE || '');
const groupName = String(__ENV.GROUP || '');
if (!fixtureFile || !groupName) throw new Error('FIXTURE_FILE and GROUP are required');
if (__ENV.AUTH_TOKEN || __ENV.PERF_AUTH_TOKEN || __ENV.CSRF_TOKEN || __ENV.PERF_CSRF_TOKEN) {
  throw new Error('current-main fixtures use unique per-request credentials; global auth would overwrite them');
}
const fixtures = new SharedArray('current-main-fresh-fixtures', () => {
  const groups = JSON.parse(open(fixtureFile));
  return loadFixtureGroup(groups, groupName);
});

const loadMode = String(__ENV.LOAD_MODE || 'steady');
const rate = Number(__ENV.RATE || 1);
const duration = String(__ENV.DURATION || '10s');
const preAllocatedVUs = Number(__ENV.PRE_VUS || 4);
const maxVUs = Number(__ENV.MAX_VUS || 16);
const burstCount = Number(__ENV.BURST_COUNT || 0);
const burstVUs = Number(__ENV.BURST_VUS || burstCount || 0);
const burstDeadline = Number(__ENV.BURST_DEADLINE || 30);

if (loadMode === 'steady') {
  if (!Number.isInteger(rate) || rate < 1 || rate > 500 || !Number.isInteger(preAllocatedVUs)
    || preAllocatedVUs < 1 || !Number.isInteger(maxVUs) || maxVUs < preAllocatedVUs || maxVUs > 256) {
    throw new Error('invalid RATE/PRE_VUS/MAX_VUS; refuse unbounded offered load');
  }
} else if (loadMode === 'burst') {
  if (!Number.isInteger(burstCount) || burstCount < 1 || burstCount > 500
    || burstVUs !== burstCount || !Number.isInteger(burstDeadline) || burstDeadline < 5 || burstDeadline > 120) {
    throw new Error('burst requires 1..500 one-shot VUs and a 5..120 second deadline');
  }
} else {
  throw new Error(`unsupported load mode ${loadMode}`);
}

export const options = {
  scenarios: {
    full_request: loadMode === 'burst'
      ? {
          executor: 'per-vu-iterations',
          vus: burstVUs,
          iterations: 1,
          maxDuration: `${burstDeadline}s`,
          gracefulStop: '5s',
        }
      : {
          executor: 'constant-arrival-rate',
          rate,
          timeUnit: '1s',
          duration,
          preAllocatedVUs,
          maxVUs,
          // Let an iteration already started at the duration boundary finish.
          // The runner still records a possible +1 scheduler-boundary arrival.
          gracefulStop: '5s',
        },
  },
};

export default function () {
  const request = pickFreshRequest(fixtures, exec.scenario.iterationInTest);
  runLogicalSubmit(request, { phase: String(__ENV.PHASE || 'steady'), fixture_class: groupName });
}
