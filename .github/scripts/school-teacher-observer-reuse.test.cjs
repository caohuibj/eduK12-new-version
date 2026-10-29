'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const reuse = require('./school-teacher-observer-reuse.cjs')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const b = () => JSON.parse(fs.readFileSync('.github/scripts/school-teacher-self-bindings.json'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('PR385 continuation pins completed source, whole consumer trees and exact invocation inputs', () => {
  assert.deepEqual(reuse.verifyInputs(b(), git), { frontend: reuse.fixed.frontendTree, backend: reuse.fixed.currentBackendTree, unchangedAssertionsExceptUnconsumedCli: reuse.fixed.toolingPath })
  for (const mutate of [x => x.base = 'a'.repeat(40), x => x.execution.officialContinuation.run++,
    x => x.execution.backend.batches[1].expectedPassed.pop(), x => x.execution.migration.restoreTables.pop()]) {
    const changed = b(); mutate(changed); assert.throws(() => reuse.verifyInputs(changed, git))
  }
  for (const read of [
    (...args) => args[0] === 'diff' ? '.github/scripts/unknown.mjs' : git(...args),
    (...args) => args[1] === 'HEAD:server-version/backend' ? 'b'.repeat(40) : git(...args),
  ]) assert.throws(() => reuse.verifyInputs(b(), read))
})
function official(kind) {
  const run = { id: reuse.fixed.run, head_sha: reuse.fixed.head, head_branch: reuse.fixed.branch,
    path: '.github/workflows/ci.yml', event: 'pull_request', run_attempt: 1, status: 'completed', conclusion: 'failure', pull_requests: [{ number: 385 }] }
  const names = { frontend: 'school-teacher / frontend', backend: 'school-teacher / backend-self',
    postgres: 'school-teacher / postgres-self', audit: 'school-teacher / security', sast: 'codeql (javascript/typescript SAST)' }
  const job = { id: reuse.fixed.jobs[kind], run_id: run.id, head_sha: run.head_sha, name: names[kind],
    status: 'completed', conclusion: kind === 'postgres' ? 'failure' : 'success', completed_at: '2026-10-29T10:00:00Z',
    steps: ['prove nonempty upgrade from this candidate exact main baseline', 'execute current affected backend and PostgreSQL assertions with real capacity guard',
      'initialize CodeQL', 'analyze with CodeQL'].map(name => ({ name, status: 'completed', conclusion: 'success' })) }
  job.steps.push({ name: 'restore once from the current qualified native and declared PostgreSQL facts', status: 'completed', conclusion: 'failure' })
  return { run, job, now: Date.parse('2026-10-29T10:01:00Z') }
}
test('official subchecks retain failed parent identity and reject foreign expired or uncompleted jobs', () => {
  for (const kind of Object.keys(reuse.fixed.jobs)) {
    const f = official(kind); assert.equal(reuse.verifyJob(f.run, f.job, kind, f.now), true)
    for (const mutate of [x => x.run.run_attempt++, x => x.run.pull_requests = [{ number: 382 }], x => x.run.head_sha = 'c'.repeat(40),
      x => x.job.status = 'in_progress', x => x.job.conclusion = 'skipped', x => x.job.head_sha = 'd'.repeat(40),
      x => x.now += 86400000]) {
      const changed = structuredClone(f); mutate(changed); assert.throws(() => reuse.verifyJob(changed.run, changed.job, kind, changed.now))
    }
  }
  const f = official('postgres'); f.job.steps[1].conclusion = 'failure'; assert.throws(() => reuse.verifyJob(f.run, f.job, 'postgres', f.now))
})
function build(kind) {
  const manifest = structuredClone(reuse.buildManifests[kind]), head = 'e'.repeat(40), runId = '40850000000'
  const [originalArtifact, originalArtifactSha256] = reuse.fixed.artifacts[kind]
  const receipt = { schemaVersion: 1, status: 'VERIFIED_OFFICIAL_' + kind.toUpperCase() + '_BUILD', currentHead: head, currentRun: runId,
    originalRun: reuse.fixed.run, originalHead: reuse.fixed.head, originalCheckout: reuse.fixed.checkout, originalJob: reuse.fixed.jobs[kind],
    originalJobConclusion: 'success', originalArtifact, originalArtifactSha256, componentTree: reuse.fixed[kind + 'Tree'], manifest }
  const identity = { head, runId, kind, manifest, componentTree: receipt.componentTree, lockDigest: manifest.lockDigest, contentDigest: manifest.contentDigest }
  return { receipt, identity }
}
test('unchanged official frontend keeps its original manifest and rejects fabricated identity bytes or consumer trees', () => {
  for (const kind of ['frontend']) {
    const f = build(kind); assert.equal(reuse.verifyBuildReceipt(f.receipt, f.identity), f.receipt)
    for (const mutate of [x => x.receipt.originalArtifact++, x => x.receipt.originalJobConclusion = 'failure',
      x => x.receipt.currentRun = '1', x => x.identity.componentTree = 'f'.repeat(40), x => x.identity.contentDigest = 'a'.repeat(64),
      x => { x.receipt.manifest.sha = x.identity.head; x.identity.manifest.sha = x.identity.head }]) {
      const changed = structuredClone(f); mutate(changed); assert.throws(() => reuse.verifyBuildReceipt(changed.receipt, changed.identity))
    }
  }
})
test('browser consumer accepts the independently verified PR385 producers without relabelling them', () => {
  const ui = require('../../server-version/e2e/school-teacher-ui.cjs'), front = build('frontend')
  const backend = { schemaVersion: 1, kind: 'backend', sha: front.identity.head, runId: front.identity.runId, contentDigest: 'b'.repeat(64), lockDigest: 'c'.repeat(64) }
  const options = { head: front.identity.head, tree: 'f'.repeat(40), runId: front.identity.runId,
    frontend: front.receipt.manifest, backend,
    officialFrontendReuse: front.receipt,
    frontendTree: front.identity.componentTree,
    frontendLockDigest: front.identity.lockDigest, frontendContentDigest: front.identity.contentDigest,
    backendLockDigest: backend.lockDigest, backendContentDigest: backend.contentDigest }
  const report = { source: { head: options.head, tree: options.tree }, runId: options.runId,
    inputs: { frontend: options.frontend, backend: options.backend },
    officialFrontendReuse: front.receipt }
  assert.equal(ui.validateReportBuildInputs(report, options).ok, true)
  const changed = structuredClone(report); changed.inputs.backend.sha = reuse.fixed.checkout
  assert.throws(() => ui.validateReportBuildInputs(changed, options))
})
test('restore fixture is fixed synthetic data with a complete 148-row SQL FK closure, never a local PASS attestation', () => {
  const zipped = fs.readFileSync(reuse.restoreInput.path); assert.equal(hash(zipped), reuse.restoreInput.sha256)
  const sql = require('node:zlib').gunzipSync(zipped); assert.equal(hash(sql), reuse.restoreInput.sqlSha256)
  const rows = sql.toString().split('\n').filter(s => s.startsWith('INSERT INTO public.'))
  assert.equal(rows.length, 148); assert.equal(new Set(rows.map(s => s.split('"')[1])).size, 45)
  assert.equal(rows.filter(s => s.startsWith('INSERT INTO public."users"')).length, 32)
  for (const row of rows.filter(s => s.startsWith('INSERT INTO public."users"'))) {
    const raw = row.split(", '")[1].split("'::json);")[0].replaceAll("''", "'")
    assert.match(JSON.parse(raw).username, /^(ed|p3_|p4_|team-expert-|huischool_|student-std-system-)/)
  }
  assert(!b().execution.migration.restoreTables.includes('cognitive_trials'))
  assert(b().execution.migration.restoreTables.includes('cognitive_raw_submissions'))
})
