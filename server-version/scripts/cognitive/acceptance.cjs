const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { spawnSync } = require('node:child_process')
function declaredFrontendSuites(root) {
  const tasks = path.join(root, 'server-version/backend/src/modules/cognitive/tasks')
  const suites = fs.readdirSync(tasks, {withFileTypes:true}).filter(entry=>entry.isDirectory()).flatMap(entry=>{
    const pkg=JSON.parse(fs.readFileSync(path.join(tasks,entry.name,'task-package.json'),'utf8'))
    if(!Array.isArray(pkg.acceptance?.frontendSuites)||!pkg.acceptance.frontendSuites.length)
      throw Error('COG_RUNNER_EVIDENCE_MISSING: '+entry.name)
    return pkg.acceptance.frontendSuites
  })
  return [...new Set(suites)].sort()
}
function assertAcceptanceReport(report, cwd, suites) {
  if(report?.success!==true || !Array.isArray(report.testResults))throw Error('COG_RUNNER_ACCEPTANCE_FAILED: incomplete report')
  for(const suite of suites){
    const matches=report.testResults.filter(result=>typeof result.name==='string'&&path.resolve(result.name)===path.resolve(cwd,suite))
    if(matches.length!==1 || matches[0].status!=='passed' || !Array.isArray(matches[0].assertionResults)
      || !matches[0].assertionResults.length || matches[0].assertionResults.some(result=>result.status!=='passed'))
      throw Error('COG_RUNNER_ACCEPTANCE_FAILED: missing, failed or skipped suite '+suite)
  }
}
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
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cognitive-acceptance-'))
  const reportFile=path.join(temporary,'vitest.json')
  try {
  const result = spawnSync(
    process.execPath,
    [
      path.join(cwd, 'node_modules/vitest/vitest.mjs'),
      'run',
      ...suites,
      '--maxWorkers=2',
      '--reporter=default', '--reporter=json', '--outputFile.json='+reportFile,
    ],
    {
      cwd,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, VITE_COGNITIVE_MODULE_ENABLED: 'true' },
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  // Keep the original reporter on stderr so JSON stdout remains machine-readable.
  if (result.stdout) process.stderr.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error || result.status !== 0)
    throw new Error(
      'COG_RUNNER_ACCEPTANCE_FAILED: ' +
        (result.error?.code || 'nonzero exit') +
        '; rerun frontend vitest for ' +
        suites.join(', '),
    )
  assertAcceptanceReport(JSON.parse(fs.readFileSync(reportFile,'utf8')),cwd,suites)
  return suites.length
  } finally { fs.rmSync(temporary,{recursive:true,force:true}) }
}
module.exports = { runAcceptance, declaredFrontendSuites, assertAcceptanceReport }
