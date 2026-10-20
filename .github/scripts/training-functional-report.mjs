import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const AGGREGATE_FILE = 'src/__tests__/questionnaire/aggregate-report.postgres.integration.test.ts';
export const AGGREGATE_SUITE = 'aggregate report completion storage (real PostgreSQL)';
export const AGGREGATE_FUNCTIONAL_TESTS = [
  'writes ciphertext only and keeps the report readable through the service',
  'keeps one terminal report and timestamp across concurrent completion and replay',
];
export const AGGREGATE_PERFORMANCE_TEST = 'completes 200 independent assessments concurrently without duplicate terminal writes';

// The only permissible nonexecution is the named performance burst. It is never
// counted as passed. Missing, empty, duplicate, failed or otherwise skipped
// functional assertions fail this gate, even if the test runner returned zero.
export function assertTrainingFunctionalReport(report) {
  const fail = message => { throw new Error(`Training functional report: ${message}`); };
  if (report?.success !== true || report.numTotalTests !== 3 || report.numPassedTests !== 2
      || report.numFailedTests !== 0 || report.numPendingTests !== 1
      || (report.numRuntimeErrorTestSuites ?? 0) !== 0 || (report.numFailedTestSuites ?? 0) !== 0
      || (report.numTodoTests ?? 0) !== 0
      || (Array.isArray(report.unhandledErrors) && report.unhandledErrors.length))
    fail('expected exactly two passes, one unexecuted performance case and no errors');
  if (!Array.isArray(report.testResults) || report.testResults.length !== 1) fail('expected exactly one suite');
  const suite = report.testResults[0];
  if (typeof suite.name !== 'string' || !(suite.name === AGGREGATE_FILE || suite.name.endsWith('/' + AGGREGATE_FILE))
      || suite.status !== 'passed' || (suite.message && suite.message.trim())) fail('wrong or failed aggregate suite');
  const assertions = suite.assertionResults;
  if (!Array.isArray(assertions) || assertions.length !== 3) fail('missing or extra assertions');
  const names = assertions.map(assertion => assertion.title);
  if (new Set(names).size !== 3 || names.some(name => ![...AGGREGATE_FUNCTIONAL_TESTS, AGGREGATE_PERFORMANCE_TEST].includes(name)))
    fail('unknown or duplicate assertion');
  for (const assertion of assertions) {
    if (assertion.fullName && assertion.fullName !== `${AGGREGATE_SUITE} ${assertion.title}`) fail('unexpected assertion identity');
    if (assertion.ancestorTitles && JSON.stringify(assertion.ancestorTitles) !== JSON.stringify([AGGREGATE_SUITE])) fail('unexpected suite ancestry');
    if (Array.isArray(assertion.failureMessages) && assertion.failureMessages.length) fail('assertion has failure details');
    if (assertion.title === AGGREGATE_PERFORMANCE_TEST) {
      if (!['skipped', 'pending'].includes(assertion.status)) fail('cancelled performance burst must not execute');
    } else if (assertion.status !== 'passed') fail('every functional assertion must pass');
  }
  return { ok: true, mode: 'training-functional-only', functionalPassed: [...AGGREGATE_FUNCTIONAL_TESTS],
    performanceNotExecuted: [AGGREGATE_PERFORMANCE_TEST], performancePassed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('usage: training-functional-report.mjs <vitest-json>');
  console.log(JSON.stringify(assertTrainingFunctionalReport(JSON.parse(readFileSync(process.argv[2], 'utf8')))));
}
