'use strict'
// One immutable PR385 continuation. This does not admit local test assertions,
// configurable runs, arbitrary artifact producers, or new evidence signers.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fixed = Object.freeze({
  run: 40849532868, head: 'fe17d12aae66965b59b3bc3ed93d17dd9455cfdb',
  checkout: '772a8ed525fd769ebd9e11a432b8f80ffa155612',
  base: '908af20ecfbd3ede55685d2052bf01b52266661c',
  branch: 'release/education-observer-native-20261029',
  frontendTree: '8a10fe0cd4b78cf0fff76b77c5e76afbd801ef6a',
  backendTree: '3988da0f103f76f9b0fcfeb1f9f0d4e785986286',
  jobs: { frontend: 123365554023, backend: 123365554019, postgres: 123366364842,
    audit: 123365554044, sast: 123365404071 },
  artifacts: {
    frontend: [12886686330, '3b366489e563d9e1eac207deb7820af73053e1bdaff0d482739eeb54ea7e0a2e', 'frontend'],
    frontendChecks: [12886631520, '7e5932fca8f348c79999eee1ff253f569e6029e786cb8c2b3598addc27dfd5f0', 'frontend-checks'],
    backend: [12886786185, 'a902924fb401b7e38722756c4cd827be6315c66c2717c53805c1f971f3608c94', 'backend'],
    backendChecks: [12885729242, '3b8cda439860fec7d3dc1ad65629852b8386bafb76441a2fc55d087c66b00b62', 'backend-checks'],
    postgres: [12885894459, 'e2dd5eb2def91cf53fe08e69f31f6eb51a2855143e7d393b7f6668bfdb7a5282', 'postgres'],
    audit: [12886162859, 'cd4dc341364eca56867936ad005fc555cbf3ac8fe31d35b0fb67e0c3152b673f', 'audit'],
  },
})
const mode = 'fixed-official-observer-continuation'
const controlPaths = [
  '.github/scripts/school-teacher-self-bindings.json', '.github/scripts/school-teacher-checks.mjs',
  '.github/scripts/school-teacher-scope.mjs', '.github/scripts/school-teacher-self.test.mjs',
  '.github/scripts/school-teacher-observer-reuse.cjs', '.github/scripts/school-teacher-observer-reuse.test.cjs',
  '.github/scripts/school-teacher-observer-restore-input.sql.gz',
  '.github/workflows/ci.yml', '.github/workflows/ci-school-teacher.yml',
  'docs/development/education-observer-native-ci.md',
  'server-version/e2e/school-teacher-browser.cjs', 'server-version/e2e/school-teacher-ui.cjs',
  'server-version/e2e/school-teacher-chrome-permissions.cjs', 'server-version/e2e/school-teacher-chrome-permissions.test.cjs',
]
const controlSastPaths = 'paths: [.github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher-scope.mjs, .github/scripts/school-teacher-self.test.mjs, .github/scripts/school-teacher-observer-reuse.cjs, .github/scripts/school-teacher-observer-reuse.test.cjs, server-version/e2e/school-teacher-browser.cjs, server-version/e2e/school-teacher-ui.cjs, server-version/e2e/school-teacher-chrome-permissions.cjs, server-version/e2e/school-teacher-chrome-permissions.test.cjs]'
const hash = v => createHash('sha256').update(v).digest('hex')

function verifyInputs(b, git) {
  assert.equal(b.qualification, mode); assert.equal(b.branch, fixed.branch); assert.equal(b.base, fixed.base)
  assert.deepEqual(b.execution.officialContinuation, { run: fixed.run, head: fixed.head, checkout: fixed.checkout })
  assert.equal(git('rev-parse', fixed.head + '^{tree}'), git('rev-parse', fixed.checkout + '^{tree}'))
  const old = JSON.parse(git('show', fixed.checkout + ':.github/scripts/school-teacher-self-bindings.json'))
  for (const component of ['frontend', 'backend']) {
    assert.equal(git('rev-parse', 'HEAD:server-version/' + component), fixed[component + 'Tree'])
    assert.deepEqual(b.execution[component], old.execution[component], component + ' invocation or dependency closure drift')
  }
  for (const p of ['server-version/shared', 'server-version/scripts/ci-install-canvas-deps.sh', '.github/release-tools'])
    assert.equal(git('rev-parse', 'HEAD:' + p), git('rev-parse', fixed.checkout + ':' + p))
  assert.deepEqual(b.execution.auditComponents, old.execution.auditComponents)
  const migration = structuredClone(old.execution.migration)
  migration.restoreTables = migration.restoreTables.filter(t => t !== 'cognitive_trials')
  assert.deepEqual(b.execution.migration, migration, 'Only the false nonempty legacy-table requirement changes')
  const changed = git('diff', '--name-only', fixed.head, 'HEAD').split('\n').filter(Boolean)
  assert(changed.length > 0); for (const p of changed) assert(controlPaths.includes(p), 'Unexpected continuation input ' + p)
  return { frontend: fixed.frontendTree, backend: fixed.backendTree }
}
function verifyJob(run, job, kind, now = Date.now()) {
  assert.equal(run.id, fixed.run); assert.equal(run.head_sha, fixed.head); assert.equal(run.head_branch, fixed.branch)
  assert.equal(run.path, '.github/workflows/ci.yml'); assert.equal(run.event, 'pull_request'); assert.equal(run.run_attempt, 1)
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'failure'); assert(run.pull_requests.some(p => p.number === 385))
  assert.equal(job.id, fixed.jobs[kind]); assert.equal(job.run_id, fixed.run); assert.equal(job.head_sha, fixed.head)
  const names = { frontend: 'school-teacher / frontend', backend: 'school-teacher / backend-self',
    postgres: 'school-teacher / postgres-self', audit: 'school-teacher / security', sast: 'codeql (javascript/typescript SAST)' }
  assert.equal(job.name, names[kind]); assert.equal(job.status, 'completed')
  assert.equal(job.conclusion, kind === 'postgres' ? 'failure' : 'success')
  const age = now - Date.parse(job.completed_at); assert(Number.isFinite(age) && age >= 0 && age <= 86400000, 'Official evidence expired')
  const stages = kind === 'postgres'
    ? ['prove nonempty upgrade from this candidate exact main baseline', 'execute current affected backend and PostgreSQL assertions with real capacity guard']
    : kind === 'sast' ? ['initialize CodeQL', 'analyze with CodeQL'] : []
  for (const name of stages) assert(job.steps.some(s => s.name === name && s.conclusion === 'success' && s.status === 'completed'))
  if (kind === 'postgres') assert(job.steps.some(s => s.name === 'restore once from the current qualified native and declared PostgreSQL facts' && s.conclusion === 'failure'))
  return true
}
function verifyCases(read, b, component, verifyTestReport) {
  let passed = 0
  for (const [i, batch] of b.execution[component].batches.entries()) {
    const stage = component + '-tests-' + i, command = read('command-' + stage + '.json')
    assert.equal(command.status, 'COMMAND_SUCCEEDED'); assert.equal(command.exitCode, 0); assert.equal(command.signal, null)
    const actual = read(stage + '-actual.json'), normalized = read(stage + '.json')
    assert.equal(actual.invocationSuccess, true); assert(actual.cases.every(c => typeof c.name === 'string' && !Object.hasOwn(c, 'unreviewedNameSha256')))
    const verified = verifyTestReport({ success: true, numFailedTests: 0,
      testResults: [{ assertionResults: actual.cases.map(c => ({ fullName: c.name, status: c.status })) }] }, batch)
    assert.equal(normalized.sourceHead, fixed.checkout); assert.equal(normalized.wholeInvocationSucceeded, true)
    assert.equal(normalized.reportSha256, actual.rawSha256); assert.deepEqual(normalized.caseNames.sort(), verified.caseNames.sort())
    assert.equal(normalized.passed, verified.passed); assert.equal(normalized.filtered, verified.filtered); passed += verified.passed
  }
  assert.equal(passed, component === 'frontend' ? 58 : 214)
  return passed
}
function verifyBuildReceipt(r, { head, runId, kind, manifest, componentTree, lockDigest, contentDigest }) {
  assert.match(head, /^[a-f0-9]{40}$/); assert.match(runId, /^\d+$/)
  const [artifact, digest] = fixed.artifacts[kind]
  assert.deepEqual(r, { schemaVersion: 1, status: 'VERIFIED_OFFICIAL_' + kind.toUpperCase() + '_BUILD',
    currentHead: head, currentRun: runId, originalRun: fixed.run, originalHead: fixed.head,
    originalCheckout: fixed.checkout, originalJob: fixed.jobs[kind], originalJobConclusion: 'success',
    originalArtifact: artifact, originalArtifactSha256: digest, componentTree: fixed[kind + 'Tree'], manifest })
  assert.equal(componentTree, fixed[kind + 'Tree'])
  assert.deepEqual(Object.keys(manifest).sort(), ['schemaVersion', 'kind', 'sha', 'runId', 'contentDigest', 'lockDigest'].sort())
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.kind, kind)
  assert.equal(manifest.sha, fixed.checkout); assert.equal(manifest.runId, String(fixed.run))
  assert.equal(manifest.lockDigest, lockDigest); assert.equal(manifest.contentDigest, contentDigest)
  // These exact bytes were independently downloaded from the pinned official ZIP.
  assert.deepEqual(manifest, buildManifests[kind])
  return r
}
const buildManifests = {
  frontend: { schemaVersion: 1, sha: fixed.checkout, runId: String(fixed.run), kind: 'frontend',
    lockDigest: 'ee290a304e22c10e760cc55eb55bb6815cb34fb57773c0af77985450306916fe',
    contentDigest: '64afa264c40c8c373bc743ca554b6d8543fca7c9125edcc13e47380daafdb2a2' },
  backend: { schemaVersion: 1, sha: fixed.checkout, runId: String(fixed.run), kind: 'backend',
    lockDigest: '01b51f001193cf54c5f09b9b78fa20a46efa65ad08175d1199e588e33f9a0450',
    contentDigest: 'e6a49d7769883e0c38da4db1a54be383944b29d92de97e814cc8c78fa27c0b87' },
}

async function reuse(kind, b, d) {
  const inputs = verifyInputs(b, d.git)
  const run = await d.officialApi('/actions/runs/' + fixed.run), job = await d.officialApi('/actions/jobs/' + fixed.jobs[kind])
  verifyJob(run, job, kind)
  async function artifact(key) {
    const [id, digest, suffix] = fixed.artifacts[key]
    return d.officialZip(id, digest, 'school-teacher-' + suffix + '-' + fixed.checkout, fixed.run, fixed.head)
  }
  const result = { status: 'VERIFIED_OFFICIAL_SUBCHECKS', originalRun: fixed.run, originalHead: fixed.head,
    originalCheckout: fixed.checkout, originalJob: job.id, originalJobConclusion: job.conclusion,
    originalParentConclusion: 'failure', currentHead: d.git('rev-parse', 'HEAD'), currentRun: process.env.GITHUB_RUN_ID,
    inputs, currentBusinessTestsExecuted: false }
  if (kind === 'frontend' || kind === 'backend') {
    const read = d.jsonZip(await artifact(kind + 'Checks'))
    for (const stage of kind === 'frontend' ? ['frontend-types', 'frontend-lint', 'frontend-build', 'frontend-manifest'] : ['backend-build', 'backend-manifest']) {
      const c = read('command-' + stage + '.json'); assert.equal(c.status, 'COMMAND_SUCCEEDED'); assert.equal(c.exitCode, 0)
    }
    if (kind === 'frontend') result.passed = verifyCases(read, b, kind, d.verifyTestReport)
    const zip = await artifact(kind), dir = path.resolve('server-version', kind, 'dist')
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n')
    assert(names.length > 0 && names.every(n => !n.startsWith('/') && !n.split('/').includes('..')))
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
    execFileSync('unzip', ['-q', zip, '-d', dir])
    verifyArtifact(kind, d)
  } else if (kind === 'postgres') {
    const read = d.jsonZip(await artifact('postgres')); result.passed = verifyCases(read, b, 'backend', d.verifyTestReport)
    const migration = read('migration.json'); assert.equal(migration.status, 'PASSED'); assert.equal(migration.base, fixed.base)
    assert.equal(migration.sourceHead, fixed.checkout); assert.deepEqual(migration.preserved.map(r => r.table), b.execution.migration.preserveTables)
    for (const r of migration.preserved) { assert(r.count > 0); assert(r.columns.length > 0); assert.match(r.sha256, /^[a-f0-9]{64}$/) }
    const failure = read('phase-postgres-restore-failure.json'); assert.equal(failure.status, 'FAILED')
    assert.equal(failure.rawSha256, '800079ec637dc4b7951d448619415417f2cc30ba0cdde2ed5d5c5c43808a08c2')
    result.migration = migration; result.originalJobQualified = false; result.restoreExecuted = false
  } else if (kind === 'audit') {
    const audit = d.jsonZip(await artifact('audit'))('audit.json')
    assert.deepEqual(audit, { status: 'PASSED', threshold: 'HIGH/CRITICAL', components: [{ component: 'frontend', status: 'PASSED' }, { component: 'backend', status: 'PASSED' }] })
    result.audit = audit
  } else if (kind === 'sast') {
    const full = 'paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]'
    const original = d.git('show', fixed.checkout + ':.github/workflows/ci.yml'), current = fs.readFileSync('.github/workflows/ci.yml', 'utf8').trimEnd()
    const stage = (text, name) => { const section = text.slice(text.indexOf('  codeql:\n'), text.indexOf('\n  miniprogram:\n'));
      const start = section.indexOf('      - name: ' + name + '\n'); assert(start >= 0)
      const end = section.indexOf('\n      - ', start + 1); return section.slice(start, end < 0 ? undefined : end) }
    const oldTerm = "needs.scope.outputs.application_route == 'school-teacher' && '" + full + "'"
    const newTerm = "needs.scope.outputs.application_route == 'school-teacher' && fromJSON(needs.scope.outputs.school_teacher_plan || '{}').continuation == 'observer-run2' && '" + controlSastPaths + "' || " + oldTerm
    assert.equal(stage(current, 'initialize CodeQL'), stage(original, 'initialize CodeQL').replace(oldTerm, newTerm))
    assert.equal(stage(current, 'analyze with CodeQL'), stage(original, 'analyze with CodeQL'))
    const log = (await d.officialApi('/actions/jobs/' + job.id + '/logs', true)).toString('utf8')
    assert(log.includes('config: ' + full)); assert(log.includes('languages: javascript-typescript'))
    assert(new RegExp('\\n[0-9T:.-]+Z ' + fixed.checkout + '(?:\\r?\\n|$)').test(log))
    result.originalJobLogSha256 = hash(log); result.applicationScannedAgain = false; result.currentChangedControlScanRequired = true
  } else assert.fail('Unknown continuation kind')
  d.receipt('observer-official-' + kind + '-reuse', result)
  return result
}
function verifyArtifact(kind, d) {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('server-version', kind, 'dist/ci-build-manifest.json')))
  const [artifact, digest] = fixed.artifacts[kind]
  const r = { schemaVersion: 1, status: 'VERIFIED_OFFICIAL_' + kind.toUpperCase() + '_BUILD',
    currentHead: d.git('rev-parse', 'HEAD'), currentRun: process.env.GITHUB_RUN_ID, originalRun: fixed.run,
    originalHead: fixed.head, originalCheckout: fixed.checkout, originalJob: fixed.jobs[kind], originalJobConclusion: 'success',
    originalArtifact: artifact, originalArtifactSha256: digest, componentTree: fixed[kind + 'Tree'], manifest }
  verifyBuildReceipt(r, { head: r.currentHead, runId: r.currentRun, kind, manifest,
    componentTree: d.git('rev-parse', 'HEAD:server-version/' + kind),
    lockDigest: hash(fs.readFileSync(path.resolve('server-version', kind, 'package-lock.json'))),
    contentDigest: d.treeDigest(path.resolve('server-version', kind, 'dist')) })
  d.receipt('official-' + kind + '-build-reuse', r)
  return r
}
const restoreInput = {
  path: '.github/scripts/school-teacher-observer-restore-input.sql.gz',
  sha256: '6745446164b7b7219753a62c04dc72631bcea03eaeb77d2fc49998a0f82470c1',
  sqlSha256: '687eb5c6dd1ee38ef5f41e0b57c647c7512bf42438ca3bd5ddc9924349270e45',
  rows: 148, tables: 45,
}
async function restore(b, d) {
  verifyInputs(b, d.git); d.databaseGuard()
  const prior = JSON.parse(fs.readFileSync('school-teacher-evidence/observer-official-postgres-reuse.json'))
  assert.equal(prior.status, 'VERIFIED_OFFICIAL_SUBCHECKS'); assert.equal(prior.originalRun, fixed.run)
  assert.equal(prior.currentHead, d.git('rev-parse', 'HEAD')); assert.equal(prior.currentRun, process.env.GITHUB_RUN_ID)
  assert.equal(prior.passed, 214); assert.equal(prior.originalJobQualified, false)
  const bytes = fs.readFileSync(restoreInput.path); assert.equal(hash(bytes), restoreInput.sha256)
  const sql = require('node:zlib').gunzipSync(bytes); assert.equal(hash(sql), restoreInput.sqlSha256)
  // The old Actions service was removed after its failure, before it dumped any
  // data. This is an explicitly frozen synthetic restore INPUT from the existing
  // local service fixtures, not that lost CI database and not accepted local PASS.
  d.command('restore-fixture-schema', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], path.resolve('server-version/backend'))
  const { Client } = require('node:module').createRequire(path.resolve('server-version/backend/package.json'))('pg')
  const owner = new Client({ connectionString: process.env.DATABASE_URL }); await owner.connect()
  let preserved
  try {
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0, 'Synthetic input loads only into a new isolated schema')
    await owner.query(sql.toString('utf8'))
    const fixture = require(path.resolve('server-version/e2e/school-teacher-fixture.cjs'))
    const runtime = await fixture.restrictedRole(process.env.DATABASE_URL, 'observer_restore_' + process.env.GITHUB_RUN_ID + '_' + process.env.GITHUB_RUN_ATTEMPT)
    const tables = b.execution.migration.restoreTables.map(t => t === 'assessment_result_facts' ? { table: t, expectEmpty: true } : t)
    preserved = await d.restoreRows({ owner, url: process.env.DATABASE_URL, serviceId: process.env.CI_POSTGRES_SERVICE_ID,
      tables, checkRestored: target => d.checkRestoredRuntime(runtime, target) })
  } finally { await owner.end() }
  d.receipt('restore', { status: 'PASSED', source: 'fixed-synthetic-real-service-restore-input', input: restoreInput,
    originalCiDatabaseRecovered: false, originalBusinessAssertionsReexecuted: false,
    sourceHead: d.git('rev-parse', 'HEAD'), runId: process.env.GITHUB_RUN_ID,
    preserved, restrictedRuntimeRole: true, releaseSchemaVerified: true })
}
module.exports = { fixed, mode, controlPaths, controlSastPaths, buildManifests, restoreInput, verifyInputs, verifyJob, verifyCases, verifyBuildReceipt, reuse, verifyArtifact, restore }
