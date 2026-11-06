import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkReleaseTestReport } from './assert-release-test-report.mjs'
import { criticalIntegrationSuites } from './critical-integration-suites.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const backendDir = dirname(scriptsDir)
const scriptPath = join(scriptsDir, 'assert-release-test-report.mjs')
const manifestPath = join(scriptsDir, 'critical-integration-suites.mjs')

// A synthetic vitest JSON report: every manifest suite present, every case
// passed, plus one unrelated suite with a legitimate opt-in skip.
function buildReport(overrides = (r) => r) {
  const suites = criticalIntegrationSuites.map((entry) => ({
    name: `/repo/server-version/backend/${entry.file}`,
    assertionResults: entry.cases.map((title) => ({
      title,
      fullName: `${entry.file} ${title}`,
      status: 'passed',
    })),
  }))
  suites.push({
    name: '/repo/server-version/backend/src/__tests__/integration/optInManual.postgres.integration.test.ts',
    assertionResults: [
      { title: 'manual continuation (opt-in)', fullName: 'manual continuation (opt-in)', status: 'passed' },
      { title: 'manual step 2 (opt-in)', fullName: 'manual step 2 (opt-in)', status: 'skipped' },
    ],
  })
  const report = {
    success: true,
    numTotalTests: 26,
    numPassedTests: 25,
    numFailedTests: 0,
    numPendingTests: 1,
    testResults: suites,
  }
  return overrides(report)
}

function runCli(args, cwd = backendDir) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.status, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '' }
  }
}

function writeReport(report) {
  const dir = mkdtempSync(join(tmpdir(), 'assert-report-'))
  const file = join(dir, 'report.json')
  writeFileSync(file, typeof report === 'string' ? report : JSON.stringify(report))
  return file
}

// CI-08: all eight critical suites actually ran and passed -> gate passes,
// and a legitimate opt-in skip elsewhere does not fail the gate (CI-07).
test('CI-08/CI-07: manifest suites pass, unrelated opt-in skip is ignored', () => {
  const result = checkReleaseTestReport(buildReport(), [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(result.belowFloor, [])
  assert.deepEqual(result.missingCases, [])
})

// CI-01: deleting one required file's report entry fails the gate.
test('CI-01: a missing suite fails the gate', () => {
  const report = buildReport((r) => {
    r.testResults = r.testResults.filter(
      (s) => !s.name.endsWith('trainingStartConcurrentFirstStart.postgres.integration.test.ts'),
    )
    return r
  })
  const result = checkReleaseTestReport(report, [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, false)
  assert.ok(result.missing.some((f) => f.includes('trainingStartConcurrentFirstStart')))
})

// CI-02: a whole suite skipped fails the gate.
test('CI-02: a fully skipped suite fails the gate', () => {
  const report = buildReport((r) => {
    const suite = r.testResults.find((s) => s.name.endsWith('surveyGovernanceInterleave.postgres.integration.test.ts'))
    suite.assertionResults = suite.assertionResults.map((a) => ({ ...a, status: 'skipped' }))
    return r
  })
  const result = checkReleaseTestReport(report, [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, false)
  assert.ok(result.skipped.some((s) => s.file.includes('surveyGovernanceInterleave')))
})

// CI-03: one critical case changed to it.skip fails the gate.
test('CI-03: a skipped critical case fails the gate', () => {
  const report = buildReport((r) => {
    const suite = r.testResults.find((s) => s.name.endsWith('boundRunReplayInterleave.postgres.integration.test.ts'))
    suite.assertionResults[0].status = 'skipped'
    return r
  })
  const result = checkReleaseTestReport(report, [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, false)
  assert.ok(result.skipped.some((s) => s.file.includes('boundRunReplayInterleave')))
  assert.ok(result.missingCases.some((m) => m.file.includes('boundRunReplayInterleave')))
})

// CI-04: deleting one required case fails the gate (title + floor).
test('CI-04: a deleted case fails the gate', () => {
  const report = buildReport((r) => {
    const suite = r.testResults.find((s) => s.name.endsWith('trainingStartResumeBypass.postgres.integration.test.ts'))
    suite.assertionResults = suite.assertionResults.slice(0, 2)
    return r
  })
  const result = checkReleaseTestReport(report, [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, false)
  assert.ok(result.belowFloor.some((b) => b.file.includes('trainingStartResumeBypass') && b.passed === 2 && b.minimum === 3))
  assert.ok(result.missingCases.some((m) => m.file.includes('trainingStartResumeBypass')))
})

// CI-05: a manifest file path that does not exist on disk fails the gate.
test('CI-05: a manifest path missing on disk fails the gate', () => {
  const badManifest = [
    ...criticalIntegrationSuites,
    { file: 'src/__tests__/integration/renamed-but-manifest-stale.test.ts', minPassedAssertions: 1, cases: ['x'] },
  ]
  const result = checkReleaseTestReport(buildReport(), [], {
    manifestSuites: badManifest,
    checkFilesExist: true,
  })
  assert.equal(result.ok, false)
  assert.ok(result.manifestFileMissing.some((f) => f.includes('renamed-but-manifest-stale')))
})

// Duplicate suite records for the same file fail the gate.
test('duplicate suite records fail the gate', () => {
  const report = buildReport((r) => {
    r.testResults.push({ ...r.testResults[0] })
    return r
  })
  const result = checkReleaseTestReport(report, [], {
    manifestSuites: criticalIntegrationSuites,
    checkFilesExist: false,
  })
  assert.equal(result.ok, false)
  assert.ok(result.duplicate.length > 0)
})

// Backward compatibility: the old CLI form (explicit files, no manifest)
// still works, and a corrupt report fails.
test('CLI: old form without --manifest still works', () => {
  const file = writeReport(buildReport())
  const { code, stdout } = runCli([
    file,
    'src/__tests__/integration/trainingStartConcurrentFirstStart.postgres.integration.test.ts',
  ])
  assert.equal(code, 0)
  assert.equal(JSON.parse(stdout).ok, true)
})

test('CLI: --manifest form passes on a good report', () => {
  const file = writeReport(buildReport())
  const { code, stdout } = runCli([file, '--manifest', manifestPath])
  assert.equal(code, 0)
  assert.equal(JSON.parse(stdout).ok, true)
})

test('CLI: --manifest form fails when a case is deleted', () => {
  const report = buildReport((r) => {
    const suite = r.testResults.find((s) => s.name.endsWith('assessmentRunRespondentIndex.postgres.integration.test.ts'))
    suite.assertionResults = []
    return r
  })
  const file = writeReport(report)
  const { code, stdout } = runCli([file, '--manifest', manifestPath])
  assert.equal(code, 1)
  const result = JSON.parse(stdout)
  assert.equal(result.ok, false)
  assert.ok(result.empty.some((f) => f.includes('assessmentRunRespondentIndex')))
})

// CI-06: a corrupt report fails the gate.
test('CI-06: a corrupt report fails the gate', () => {
  const file = writeReport('{not json')
  const { code } = runCli([file, '--manifest', manifestPath])
  assert.equal(code, 1)
})

test('CLI: usage error exits 2', () => {
  const { code } = runCli([])
  assert.equal(code, 2)
})
