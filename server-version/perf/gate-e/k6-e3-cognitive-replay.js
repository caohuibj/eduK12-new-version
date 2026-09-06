/**
 * E3 same-child replay contention.
 *
 * This is the explicit exception to the fresh-fixture rule: every VU sends the
 * same sessionId/submissionId/payload so durable replay behavior can be
 * compared with scoring, reference, frozen-context, encryption and DB counters.
 */
import { SharedArray } from 'k6/data';
import { loadFixtureGroup, runLogicalSubmit } from './lib/http.js';

const fixturePath = __ENV.FIXTURE_FILE || '../fixtures/final-submit-fixtures.json';
const groupName = __ENV.GROUP || 'cognitiveNormal';
const vus = Number(__ENV.VUS || __ENV.PEAK || 25);
const fixtureIndex = Number(__ENV.FIXTURE_INDEX || 0);
const duration = String(__ENV.DURATION || '1s');

const requests = new SharedArray('e3-replay-fixtures', () => {
  const fixtures = JSON.parse(open(fixturePath));
  return loadFixtureGroup(fixtures, groupName);
});
if (!requests.length || !requests[fixtureIndex]) {
  throw new Error(`E3 replay fixture missing: group="${groupName}" index=${fixtureIndex}`);
}
const request = requests[fixtureIndex];

export const options = {
  scenarios: {
    e3_same_child_replay: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: String(__ENV.MAX_DURATION || '3m'),
    },
  },
};

export default function () {
  runLogicalSubmit(request, {
    profile: 'e3_same_child_replay',
    contention: 'same_child',
    contenders: String(vus),
    logical_fixture: String(request.fixtureId || fixtureIndex),
  });
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  const count = (name) => Number((metrics[name] || {}).values?.count || 0);
  const success = count('gate_e_eventual_success');
  const fail = count('gate_e_eventual_failure');
  const summary = {
    profile: 'e3_same_child_replay',
    group: groupName,
    vus,
    duration,
    fixture_index: fixtureIndex,
    fixture_id: request.fixtureId || null,
    session_id: request.sessionId || null,
    submission_id: request.submissionId || request.body?.submissionId || null,
    fresh_winner_count: count('gate_e_fresh_completions'),
    idempotent_replay_count: count('gate_e_idempotent_replays'),
    eventual_success: success,
    eventual_failure: fail,
    first_attempt_replay_is_fail_closed: true,
    '429': count('gate_e_rate_limited_429'),
    '503': count('gate_e_capacity_busy_503'),
  };
  const outPath = __ENV.GATE_E_SUMMARY_PATH || '/tmp/gate-e-e3-replay-last.json';
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
