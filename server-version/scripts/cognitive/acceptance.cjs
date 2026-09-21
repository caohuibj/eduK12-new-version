const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process')
/** Runs task-declared deterministic DOM/runner/stimulus suites; real-browser checks remain a CI job. */
function runAcceptance(root, pkg) {
  const suites = pkg.acceptance?.frontendSuites
  if (!Array.isArray(suites) || !suites.length)
    throw new Error(
      'COG_RUNNER_EVIDENCE_MISSING: declare acceptance.frontendSuites',
    )
  const cwd = path.join(root, 'server-version/frontend')
  for (const suite of suites) {
    if (
      typeof suite !== 'string' ||
      !suite.startsWith('src/modules/cognitive/') ||
      suite.split('/').some((p) => p === '..' || p === '.') ||
      !/\.test\.tsx?$/.test(suite) ||
      !fs.existsSync(path.join(cwd, suite))
    )
      throw new Error('COG_RUNNER_EVIDENCE_INVALID: ' + suite)
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(cwd, 'node_modules/vitest/vitest.mjs'),
      'run',
      ...suites,
      '--maxWorkers=2',
    ],
    {
      cwd,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, VITE_COGNITIVE_MODULE_ENABLED: 'true' },
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  if (result.error || result.status !== 0)
    throw new Error(
      'COG_RUNNER_ACCEPTANCE_FAILED: ' +
        (result.error?.code || 'nonzero exit') +
        '; rerun frontend vitest for ' +
        suites.join(', '),
    )
  return suites.length
}
module.exports = { runAcceptance }
