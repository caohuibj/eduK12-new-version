#!/usr/bin/env node

/**
 * Fail a release gate when a critical integration suite was collected but
 * silently skipped.  Vitest's normal exit code is still green for skipped
 * tests, so this check is intentionally separate from the test runner.
 */

import fs from 'node:fs'
import path from 'node:path'

const [reportPath, ...requiredFiles] = process.argv.slice(2)
if (!reportPath || requiredFiles.length === 0) {
  console.error('usage: assert-release-test-report.mjs <vitest-json> <required-test-file>...')
  process.exit(2)
}

let report
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
} catch {
  console.error('release test report is missing or invalid')
  process.exit(1)
}

const suites = Array.isArray(report.testResults) ? report.testResults : []
const byName = new Map(suites.map((suite) => [path.normalize(suite.name || ''), suite]))
const missing = []
const skipped = []

for (const required of requiredFiles) {
  const normalized = path.normalize(required)
  const suite = [...byName.entries()].find(([name]) => name.endsWith(normalized))?.[1]
  if (!suite) {
    missing.push(required)
    continue
  }
  const pending = (suite.assertionResults || []).filter((assertion) => assertion.status === 'skipped' || assertion.status === 'pending')
  if (pending.length > 0) skipped.push({ file: required, count: pending.length })
}

const result = {
  ok: missing.length === 0 && skipped.length === 0,
  requiredSuites: requiredFiles.length,
  missing,
  skipped,
  report: {
    totalTests: report.numTotalTests ?? null,
    passedTests: report.numPassedTests ?? null,
    failedTests: report.numFailedTests ?? null,
    pendingTests: report.numPendingTests ?? null,
  },
}
console.log(JSON.stringify(result))
if (!result.ok) process.exit(1)
