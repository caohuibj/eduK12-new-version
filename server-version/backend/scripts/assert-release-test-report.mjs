#!/usr/bin/env node

/**
 * Fail a release gate when a critical integration suite was collected but
 * silently skipped.  Vitest's normal exit code is still green for skipped
 * tests, so this check is intentionally separate from the test runner.
 *
 * Usage:
 *   assert-release-test-report.mjs <vitest-json> <required-test-file>...
 *   assert-release-test-report.mjs <vitest-json> --manifest <manifest.mjs> [<required-test-file>...]
 *
 * The `--manifest` form additionally enforces the case-level contract from
 * `scripts/critical-integration-suites.mjs`: every listed case title must
 * appear with status `passed`, and the suite must have at least
 * `minPassedAssertions` passed assertions. That catches a case being
 * deleted or renamed while the suite still "passes".
 *
 * Checks performed (all failures make the gate fail):
 * - a required suite is missing from the report entirely;
 * - a required suite has no assertion results;
 * - any assertion in a required suite is skipped/pending;
 * - a required suite appears more than once in the report (duplicate);
 * - (manifest only) a listed case title is absent or not passed;
 * - (manifest only) the passed assertion count is below the floor;
 * - (manifest only) a manifest file does not exist on disk at the checked
 *   revision (the manifest and HEAD must agree on paths).
 *
 * Deliberately NOT a global `numPendingTests == 0` check: the repo has
 * intentional opt-in suites that may legitimately skip. Only the suites
 * named here (explicitly or via the manifest) are held to the strict
 * contract.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Pure report check: no I/O except the optional on-disk existence check
 * for manifest files (`checkFilesExist`, default true; unit tests pass
 * false). Returns the result object that is also printed as JSON by the CLI.
 *
 * @param {object} report - parsed vitest JSON report
 * @param {string[]} requiredFiles - backend-relative test file paths
 * @param {object} [options]
 * @param {Array<{file: string, minPassedAssertions: number, cases: string[]}>} [options.manifestSuites]
 * @param {boolean} [options.checkFilesExist]
 */
export function checkReleaseTestReport(report, requiredFiles, options = {}) {
  const { manifestSuites = [], checkFilesExist = true } = options
  const suites = Array.isArray(report?.testResults) ? report.testResults : []
  const byName = new Map()
  for (const suite of suites) {
    const name = path.normalize(suite?.name || '')
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(suite)
  }
  const findSuite = (required) => {
    const normalized = path.normalize(required)
    const entry = [...byName.entries()].find(([name]) => name.endsWith(normalized))
    return entry ? entry[1] : null
  }

  const missing = []
  const skipped = []
  const empty = []
  const duplicate = []

  const checkSuite = (required) => {
    const matches = findSuite(required)
    if (!matches) {
      missing.push(required)
      return null
    }
    if (matches.length > 1) duplicate.push({ file: required, count: matches.length })
    const suite = matches[0]
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : []
    if (assertions.length === 0) empty.push(required)
    const pending = assertions.filter((a) => a.status === 'skipped' || a.status === 'pending')
    if (pending.length > 0) skipped.push({ file: required, count: pending.length })
    return assertions
  }

  for (const required of requiredFiles) checkSuite(required)

  // Manifest suites get the same file-level checks plus case-level checks.
  const belowFloor = []
  const missingCases = []
  const manifestFileMissing = []
  for (const entry of manifestSuites) {
    if (checkFilesExist && !fs.existsSync(path.resolve(entry.file))) {
      manifestFileMissing.push(entry.file)
    }
    const assertions = checkSuite(entry.file)
    if (!assertions) continue
    const passed = assertions.filter((a) => a.status === 'passed')
    if (passed.length < entry.minPassedAssertions) {
      belowFloor.push({ file: entry.file, passed: passed.length, minimum: entry.minPassedAssertions })
    }
    const passedTitles = new Set(
      passed.flatMap((a) => [a.title, a.fullName].filter(Boolean)),
    )
    const missingTitles = entry.cases.filter(
      (title) => !passedTitles.has(title) && ![...passedTitles].some((t) => t.endsWith(title)),
    )
    if (missingTitles.length > 0) missingCases.push({ file: entry.file, cases: missingTitles })
  }

  const ok =
    missing.length === 0 &&
    skipped.length === 0 &&
    empty.length === 0 &&
    duplicate.length === 0 &&
    belowFloor.length === 0 &&
    missingCases.length === 0 &&
    manifestFileMissing.length === 0

  return {
    ok,
    requiredSuites: requiredFiles.length + manifestSuites.length,
    missing,
    skipped,
    empty,
    duplicate,
    belowFloor,
    missingCases,
    manifestFileMissing,
    report: {
      totalTests: report?.numTotalTests ?? null,
      passedTests: report?.numPassedTests ?? null,
      failedTests: report?.numFailedTests ?? null,
      pendingTests: report?.numPendingTests ?? null,
    },
  }
}

function parseArgs(argv) {
  const positional = []
  let manifestPath = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--manifest') {
      if (i + 1 >= argv.length) return { error: '--manifest requires a path' }
      manifestPath = argv[i + 1]
      i += 1
    } else if (argv[i].startsWith('--manifest=')) {
      manifestPath = argv[i].slice('--manifest='.length)
    } else {
      positional.push(argv[i])
    }
  }
  return { positional, manifestPath }
}

async function loadManifest(manifestPath) {
  let mod
  try {
    mod = await import(pathToFileURL(path.resolve(manifestPath)).href)
  } catch (error) {
    return { error: `cannot load manifest ${manifestPath}: ${error.message}` }
  }
  const suites = mod.criticalIntegrationSuites
  if (!Array.isArray(suites) || suites.length === 0) {
    return { error: `manifest ${manifestPath} does not export a non-empty criticalIntegrationSuites array` }
  }
  for (const entry of suites) {
    if (
      typeof entry?.file !== 'string' ||
      !Number.isSafeInteger(entry?.minPassedAssertions) ||
      entry.minPassedAssertions < 1 ||
      !Array.isArray(entry?.cases) ||
      entry.cases.length === 0 ||
      entry.cases.some((c) => typeof c !== 'string' || c.length === 0)
    ) {
      return { error: `manifest ${manifestPath} has an invalid suite entry: ${JSON.stringify(entry)}` }
    }
    if (entry.minPassedAssertions < entry.cases.length) {
      return {
        error: `manifest ${manifestPath}: minPassedAssertions (${entry.minPassedAssertions}) is below the case count (${entry.cases.length}) for ${entry.file}`,
      }
    }
  }
  return { suites }
}

async function main(argv) {
  const { positional, manifestPath, error: parseError } = parseArgs(argv)
  if (parseError) {
    console.error(parseError)
    console.error('usage: assert-release-test-report.mjs <vitest-json> [--manifest <manifest.mjs>] <required-test-file>...')
    return 2
  }
  const [reportPath, ...requiredFiles] = positional
  if (!reportPath || (requiredFiles.length === 0 && !manifestPath)) {
    console.error('usage: assert-release-test-report.mjs <vitest-json> [--manifest <manifest.mjs>] <required-test-file>...')
    return 2
  }

  let report
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  } catch {
    console.error('release test report is missing or invalid')
    return 1
  }

  let manifestSuites = []
  if (manifestPath) {
    const loaded = await loadManifest(manifestPath)
    if (loaded.error) {
      console.error(loaded.error)
      return 2
    }
    manifestSuites = loaded.suites
  }

  const result = checkReleaseTestReport(report, requiredFiles, { manifestSuites })
  console.log(JSON.stringify(result))
  return result.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
