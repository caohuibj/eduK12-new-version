import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertTrainingFunctionalReport, AGGREGATE_FILE, AGGREGATE_SUITE,
  AGGREGATE_FUNCTIONAL_TESTS, AGGREGATE_PERFORMANCE_TEST } from './training-functional-report.mjs';

function report() {
  return { success: true, numTotalTests: 3, numPassedTests: 2, numFailedTests: 0, numPendingTests: 1,
    numRuntimeErrorTestSuites: 0, unhandledErrors: [], testResults: [{
      name: '/workspace/server-version/backend/' + AGGREGATE_FILE, status: 'passed', message: '',
      assertionResults: [...AGGREGATE_FUNCTIONAL_TESTS, AGGREGATE_PERFORMANCE_TEST].map(title => ({
        title, fullName: `${AGGREGATE_SUITE} ${title}`, ancestorTitles: [AGGREGATE_SUITE],
        status: title === AGGREGATE_PERFORMANCE_TEST ? 'pending' : 'passed', failureMessages: [],
      })),
    }] };
}

test('accepts exactly two real functional passes and lists performance as not executed, never passed', () => {
  for (const status of ['pending','skipped']) {
    const input = report(); input.testResults[0].assertionResults[2].status = status;
    assert.deepEqual(assertTrainingFunctionalReport(input), {
      ok: true, mode: 'training-functional-only', functionalPassed: AGGREGATE_FUNCTIONAL_TESTS,
      performanceNotExecuted: [AGGREGATE_PERFORMANCE_TEST], performancePassed: false,
    });
  }
});

test('rejects empty, missing, failed, additional, duplicated and falsely green reports', () => {
  for (const input of [null, {}, { success: true }, { ...report(), testResults: [] },
    { ...report(), numTotalTests: 0, numPassedTests: 0, numPendingTests: 0 }])
    assert.throws(() => assertTrainingFunctionalReport(input));
  for (const mutate of [
    r => { r.success = false; },
    r => { r.numPassedTests = 3; r.numPendingTests = 0; },
    r => { r.numFailedTests = 1; },
    r => { r.numPendingTests = 2; },
    r => { r.numRuntimeErrorTestSuites = 1; },
    r => { r.numFailedTestSuites = 1; },
    r => { r.numTodoTests = 1; },
    r => { r.unhandledErrors = ['unexpected error']; },
    r => { r.testResults.push(structuredClone(r.testResults[0])); },
    r => { r.testResults[0].name = 'other.test.ts'; },
    r => { r.testResults[0].status = 'failed'; },
    r => { r.testResults[0].message = 'beforeAll failed'; },
    r => { r.testResults[0].assertionResults.pop(); },
    r => { r.testResults[0].assertionResults.push({ title: 'extra', status: 'skipped' }); },
    r => { r.testResults[0].assertionResults[0] = structuredClone(r.testResults[0].assertionResults[1]); },
    r => { r.testResults[0].assertionResults[0].title = 'different functional case'; },
    r => { r.testResults[0].assertionResults[0].fullName = 'wrong suite'; },
    r => { r.testResults[0].assertionResults[0].ancestorTitles = ['wrong suite']; },
    r => { r.testResults[0].assertionResults[0].failureMessages = ['failed']; },
  ]) { const input = report(); mutate(input); assert.throws(() => assertTrainingFunctionalReport(input)); }
});

test('no functional test may be skipped and the performance burst must not run', () => {
  for (const index of [0, 1]) for (const status of ['pending','skipped','todo','failed',undefined]) {
    const input = report(); input.testResults[0].assertionResults[index].status = status;
    assert.throws(() => assertTrainingFunctionalReport(input));
  }
  for (const status of ['passed','failed','todo',undefined]) {
    const input = report(); input.testResults[0].assertionResults[2].status = status;
    assert.throws(() => assertTrainingFunctionalReport(input));
  }
});

test('the exact report allowlist matches all three existing aggregate tests without editing their assertions', () => {
  const source = readFileSync(new URL('../../server-version/backend/' + AGGREGATE_FILE, import.meta.url), 'utf8');
  const names = [...source.matchAll(/\bit\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(names.sort(), [...AGGREGATE_FUNCTIONAL_TESTS, AGGREGATE_PERFORMANCE_TEST].sort());
});
