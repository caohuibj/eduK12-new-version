import test from 'node:test';
import assert from 'node:assert/strict';
import { seconds, summarize } from './ci-timing-report.mjs';

test('missing, in-progress and reversed timestamps cannot become fast successes', () => {
  assert.equal(seconds(null, null), null);
  assert.equal(seconds('2026-09-22T10:00:01Z', '2026-09-22T10:00:00Z'), null);
  const rows = summarize({ jobs: [
    {status:'in_progress', started_at:'2026-09-22T10:00:00Z'},
    {status:'completed', conclusion:'skipped', started_at:'2026-09-22T10:00:00Z', completed_at:'2026-09-22T10:00:00Z'},
  ]});
  assert.ok(rows.every(row => row.executionSeconds === null && row.dispatchToStartSeconds === null));
});
test('separates dispatch delay from execution and ranks completed steps', () => {
  const result = summarize({created_at:'2026-09-22T10:00:00Z', jobs:[{
    name:'browser', status:'completed', conclusion:'failure',
    started_at:'2026-09-22T10:24:00Z', completed_at:'2026-09-22T10:41:00Z',
    steps:[
      {name:'build', status:'completed', conclusion:'success', started_at:'2026-09-22T10:25:00Z', completed_at:'2026-09-22T10:30:00Z'},
      {name:'tests', status:'completed', conclusion:'failure', started_at:'2026-09-22T10:30:00Z', completed_at:'2026-09-22T10:31:00Z'},
      {name:'unrun', status:'completed', conclusion:'skipped'},
    ],
  }]})[0];
  assert.equal(result.dispatchToStartSeconds,1440);
  assert.equal(result.executionSeconds,1020);
  assert.equal(result.conclusion,'failure');
  assert.deepEqual(result.slowestSteps.map(s => s.name),['build','tests']);
});
