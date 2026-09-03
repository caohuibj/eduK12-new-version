/**
 * E5 Bundle mixed + FFmpeg concurrency hint (0/1/2 via env for the app under test).
 * k6 itself only drives mixed finals; set FFMPEG_CONCURRENCY on the backend process.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, pickFreshRequest, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const fixtures = JSON.parse(open(fixturePath));
const groupName = __ENV.GROUP || 'mixed';
const vus = Number(__ENV.VUS || 50);
const duration = String(__ENV.DURATION || '30s');

const requests = new SharedArray('e5-fixtures', () => loadFixtureGroup(fixtures, groupName));

export const options = {
  scenarios: {
    e5_bundle_mixed: {
      executor: 'constant-vus',
      vus,
      duration,
    },
  },
};

export default function () {
  const index = (__VU - 1) * 100000 + __ITER;
  const request = pickFreshRequest(requests, index % Math.max(requests.length, 1));
  runLogicalSubmit(request, {
    profile: 'e5_bundle_mixed',
    ffmpeg_concurrency: String(__ENV.FFMPEG_CONCURRENCY || '0'),
  });
}
