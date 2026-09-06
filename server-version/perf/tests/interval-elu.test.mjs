import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveIntervalElu, IntervalEluTracker } from '../lib/interval-elu.mjs';

test('first sample is unavailable and a later interval is finite', () => {
  const tracker = new IntervalEluTracker();
  assert.deepEqual(tracker.observe({ active: 10, idle: 5 }), { value: null, status: 'baseline' });
  const result = tracker.observe({ active: 14, idle: 7 });
  assert.equal(result.status, 'ok');
  assert.equal(result.value, 4 / 6);
});

test('NaN and Infinity are rejected without corrupting the last baseline', () => {
  const tracker = new IntervalEluTracker();
  tracker.observe({ active: 10, idle: 5 });
  assert.deepEqual(tracker.observe({ active: NaN, idle: 7 }), { value: null, status: 'invalid' });
  assert.deepEqual(tracker.observe({ active: Infinity, idle: 7 }), { value: null, status: 'invalid' });
  assert.equal(tracker.observe({ active: 12, idle: 6 }).value, 2 / 3);
});

test('counter reset returns a new baseline before resuming intervals', () => {
  const tracker = new IntervalEluTracker();
  tracker.observe({ active: 10, idle: 5 });
  assert.deepEqual(tracker.observe({ active: 3, idle: 2 }), { value: null, status: 'reset' });
  assert.deepEqual(tracker.observe({ active: 5, idle: 3 }), { value: 2 / 3, status: 'ok' });
});

test('zero-delta intervals and invalid direct samples fail closed', () => {
  assert.equal(deriveIntervalElu({ active: 1, idle: 1 }, { active: 1, idle: 1 }), null);
  assert.equal(deriveIntervalElu({ active: -1, idle: 1 }, { active: 1, idle: 1 }), null);
  assert.equal(deriveIntervalElu({ active: 1, idle: 1 }, { active: NaN, idle: 2 }), null);
});
