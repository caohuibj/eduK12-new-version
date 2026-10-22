/* Pure receipt/build-identity tests; no FS, Git, network or browser execution. */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { OFFICIAL_FRONTEND, validateOfficialFrontendReceipt, validateReportBuildInputs } = require('./school-teacher-ui.cjs')
const clone = value => JSON.parse(JSON.stringify(value))
function sample(reused = true) {
  const head = 'a'.repeat(40), tree = 'b'.repeat(40), runId = '40000000001'
  const manifest = kind => ({ schemaVersion: 1, kind, sha: head, runId, lockDigest: 'c'.repeat(64), contentDigest: 'd'.repeat(64) })
  const frontend = manifest('frontend'), backend = manifest('backend')
  const options = { head, tree, runId, frontend, backend }
  const report = { source: { head, tree }, runId, inputs: { frontend, backend } }
  if (reused) {
    frontend.sha = OFFICIAL_FRONTEND.originalCheckout; frontend.runId = String(OFFICIAL_FRONTEND.originalRun)
    const receipt = { schemaVersion: 1, status: 'VERIFIED_OFFICIAL_FRONTEND_BUILD', currentHead: head, currentRun: runId,
      ...OFFICIAL_FRONTEND, manifest: frontend }
    Object.assign(options, { officialFrontendReuse: receipt, frontendTree: OFFICIAL_FRONTEND.frontendTree,
      frontendLockDigest: frontend.lockDigest, frontendContentDigest: frontend.contentDigest })
    report.officialFrontendReuse = clone(receipt)
  }
  return { options, report }
}
test('official frontend receipt preserves original producer manifest while backend is fresh', () => {
  const s = sample(), before = JSON.stringify(s)
  assert.equal(validateOfficialFrontendReceipt(s.options.officialFrontendReuse, s.options), s.options.officialFrontendReuse)
  assert.deepEqual(validateReportBuildInputs(s.report, s.options), { ok: true, code: 'BROWSER_BUILD_INPUTS_VERIFIED' })
  assert.equal(JSON.stringify(s), before)
  assert.notEqual(s.report.inputs.frontend.sha, s.report.source.head)
  assert.equal(s.report.inputs.backend.sha, s.report.source.head)
})
test('ordinary current-run frontend and backend keep the existing build identity contract', () => {
  const s = sample(false)
  assert.deepEqual(validateReportBuildInputs(s.report, s.options), { ok: true, code: 'BROWSER_BUILD_INPUTS_VERIFIED' })
})
test('official frontend receipt rejects each altered fixed producer identity or extra field', () => {
  for (const key of Object.keys(OFFICIAL_FRONTEND)) {
    const s = sample(), receipt = s.options.officialFrontendReuse
    receipt[key] = typeof receipt[key] === 'number' ? receipt[key] + 1 : '0'.repeat(receipt[key].length)
    assert.throws(() => validateOfficialFrontendReceipt(receipt, s.options), key)
  }
  const s = sample(); s.options.officialFrontendReuse.extra = true
  assert.throws(() => validateOfficialFrontendReceipt(s.options.officialFrontendReuse, s.options))
})
test('official frontend receipt rejects changed checkout run source tree lock or dist bytes', () => {
  for (const key of ['head', 'runId', 'frontendTree', 'frontendLockDigest', 'frontendContentDigest']) {
    const s = sample(); s.options[key] = key === 'runId' ? '40000000002' : 'e'.repeat(s.options[key].length)
    assert.throws(() => validateOfficialFrontendReceipt(s.options.officialFrontendReuse, s.options), key)
  }
  for (const key of ['sha', 'runId', 'kind', 'lockDigest', 'contentDigest']) {
    const s = sample(); s.options.frontend = { ...s.options.frontend, [key]: 'wrong' }
    assert.throws(() => validateOfficialFrontendReceipt(s.options.officialFrontendReuse, s.options), key)
  }
})
test('report cannot supply its own reuse authority or revive historical dual-build reuse', () => {
  const s = sample(); delete s.options.officialFrontendReuse
  assert.throws(() => validateReportBuildInputs(s.report, s.options))
  const t = sample(); t.report.buildReuse = {}
  assert.throws(() => validateReportBuildInputs(t.report, t.options))
  const u = sample(); u.report.officialFrontendReuse.originalArtifact++
  assert.throws(() => validateReportBuildInputs(u.report, u.options))
})
test('frontend exception cannot rewrite its manifest or permit a reused backend', () => {
  const s = sample(); s.options.backend.sha = OFFICIAL_FRONTEND.originalCheckout
  assert.throws(() => validateReportBuildInputs(s.report, s.options))
  const t = sample(); t.options.frontend.sha = t.options.head; t.options.officialFrontendReuse.manifest = t.options.frontend
  t.report.officialFrontendReuse = clone(t.options.officialFrontendReuse)
  assert.throws(() => validateReportBuildInputs(t.report, t.options))
  const u = sample(); delete u.options.frontendContentDigest
  assert.throws(() => validateReportBuildInputs(u.report, u.options))
})
