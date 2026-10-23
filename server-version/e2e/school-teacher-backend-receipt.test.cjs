/* Pure fixed-producer receipt tests. No filesystem, Git, network or browser. */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { OFFICIAL_FRONTEND, OFFICIAL_BACKEND, BACKEND_FIXTURE_EXCEPTION, computeBackendCompileDigest,
  validateOfficialBackendReceipt, validateReportBuildInputs } = require('./school-teacher-ui.cjs')
const clone = value => JSON.parse(JSON.stringify(value))
function sample(reuseBackend = true, reuseFrontend = true) {
  const head = 'a'.repeat(40), tree = 'b'.repeat(40), runId = '40000000002'
  const manifest = kind => ({ schemaVersion: 1, kind, sha: head, runId, lockDigest: 'c'.repeat(64), contentDigest: 'd'.repeat(64) })
  const frontend = manifest('frontend'), backend = manifest('backend')
  const options = { head, tree, runId, frontend, backend }, report = { source: { head, tree }, runId, inputs: { frontend, backend } }
  for (const [kind, reuse, fixed] of [['frontend', reuseFrontend, OFFICIAL_FRONTEND], ['backend', reuseBackend, OFFICIAL_BACKEND]]) {
    if (!reuse) continue
    const m = options[kind]; m.sha = fixed.originalCheckout; m.runId = String(fixed.originalRun)
    const key = kind === 'frontend' ? 'officialFrontendReuse' : 'officialBackendReuse'
    options[key] = { schemaVersion: 1, status: `VERIFIED_OFFICIAL_${kind.toUpperCase()}_BUILD`, currentHead: head, currentRun: runId, ...fixed, manifest: m }
    options[kind + 'LockDigest'] = m.lockDigest; options[kind + 'ContentDigest'] = m.contentDigest
    if (kind === 'frontend') options.frontendTree = fixed.frontendTree
    else options.backendCompileDigest = fixed.backendCompileDigest
    report[key] = clone(options[key])
  }
  return { options, report }
}
test('fixed completed BE compile preserves failed job and original manifest with independent current inputs', () => {
  for (const frontendReused of [false, true]) {
    const s = sample(true, frontendReused), before = JSON.stringify(s)
    assert.equal(validateOfficialBackendReceipt(s.options.officialBackendReuse, s.options), s.options.officialBackendReuse)
    assert.deepEqual(validateReportBuildInputs(s.report, s.options), { ok: true, code: 'BROWSER_BUILD_INPUTS_VERIFIED' })
    assert.equal(s.report.officialBackendReuse.originalJobConclusion, 'failure')
    assert.notEqual(s.report.inputs.backend.sha, s.report.source.head)
    assert.equal(JSON.stringify(s), before)
  }
})
test('fresh backend keeps previous fresh and frontend-only-reuse contracts', () => {
  for (const reuseFrontend of [false, true]) {
    const s = sample(false, reuseFrontend)
    assert.equal(validateReportBuildInputs(s.report, s.options).ok, true)
    s.options.backend.sha = OFFICIAL_BACKEND.originalCheckout
    assert.throws(() => validateReportBuildInputs(s.report, s.options))
  }
})
test('backend receipt rejects every altered fixed identity conclusion or extra field', () => {
  for (const key of [...Object.keys(OFFICIAL_BACKEND), 'schemaVersion', 'status']) {
    const s = sample(), receipt = s.options.officialBackendReuse
    receipt[key] = typeof receipt[key] === 'number' ? receipt[key] + 1 : 'wrong'
    assert.throws(() => validateOfficialBackendReceipt(receipt, s.options), key)
  }
  const s = sample(); s.options.officialBackendReuse.extra = true
  assert.throws(() => validateOfficialBackendReceipt(s.options.officialBackendReuse, s.options))
})
test('backend receipt rejects changed current identity closure lock dist or original manifest', () => {
  for (const key of ['head', 'runId', 'backendCompileDigest', 'backendLockDigest', 'backendContentDigest']) {
    const s = sample(); s.options[key] = key === 'runId' ? '40000000003' : 'e'.repeat(s.options[key].length)
    assert.throws(() => validateOfficialBackendReceipt(s.options.officialBackendReuse, s.options), key)
  }
  for (const key of ['sha', 'runId', 'kind', 'lockDigest', 'contentDigest']) {
    const s = sample(); s.options.backend = { ...s.options.backend, [key]: 'wrong' }
    assert.throws(() => validateOfficialBackendReceipt(s.options.officialBackendReuse, s.options), key)
  }
  const s = sample(); delete s.options.backendContentDigest
  assert.throws(() => validateOfficialBackendReceipt(s.options.officialBackendReuse, s.options))
})
test('report cannot self-authorize backend reuse revive old diagnostic receipts or rewrite producer', () => {
  const s = sample(); delete s.options.officialBackendReuse
  assert.throws(() => validateReportBuildInputs(s.report, s.options))
  const t = sample(); t.report.buildReuse = {}
  assert.throws(() => validateReportBuildInputs(t.report, t.options))
  const u = sample(); u.report.officialBackendReuse.originalArtifact++
  assert.throws(() => validateReportBuildInputs(u.report, u.options))
  const v = sample(); v.options.backend.sha = v.options.head; v.report.officialBackendReuse = clone(v.options.officialBackendReuse)
  assert.throws(() => validateReportBuildInputs(v.report, v.options))
})
test('backend compile digest pins the new runtime policy and preserves all other nonfixture rows', () => {
  const line = (file, blob = 'a'.repeat(40)) => `100644 blob ${blob}\tserver-version/backend/${file}`
  const production = line('src/app.ts'), lock = line('package-lock.json'), schema = line('prisma/schema.prisma')
  const otherTest = line('src/__tests__/other.test.ts'), fixture = line(BACKEND_FIXTURE_EXCEPTION.replace('server-version/backend/', ''))
  const policy = line('scripts/runtime-table-policy.json', 'ace85218711a03301aef8b4626f0cf9951cb7b4e')
  const oldPolicy = policy.replace('ace85218711a03301aef8b4626f0cf9951cb7b4e', 'c7a33ee0e2d700ba39a9a99a82c6a5cb052a08f8')
  const rows = [lock, schema, policy, otherTest, fixture, production], text = rows.join('\n') + '\n'
  const expected = createHash('sha256').update([lock, schema, oldPolicy, otherTest, production].join('\n') + '\n').digest('hex')
  assert.equal(computeBackendCompileDigest(text.replace(policy, oldPolicy), { historical: true }), expected)
  assert.equal(computeBackendCompileDigest(text, { historical: true }), expected)
  assert.equal(computeBackendCompileDigest(text), expected)
  assert.equal(computeBackendCompileDigest(text.replace(fixture, fixture.replace('a'.repeat(40), 'b'.repeat(40)))), expected)
  for (const row of [lock, schema, otherTest, production])
    assert.notEqual(computeBackendCompileDigest(text.replace(row, row.replace('a'.repeat(40), 'c'.repeat(40)))), expected)
  for (const invalid of [text.replace(fixture + '\n', ''), text + fixture + '\n', text.slice(0, -1), text.replace('server-version/backend/src/app.ts', 'elsewhere/app.ts')])
    assert.throws(() => computeBackendCompileDigest(invalid))
})

test('runtime policy normalization rejects stale current unknown missing duplicate or wrong-mode inputs', () => {
  const path = 'server-version/backend/scripts/runtime-table-policy.json'
  const oldBlob = 'c7a33ee0e2d700ba39a9a99a82c6a5cb052a08f8', newBlob = 'ace85218711a03301aef8b4626f0cf9951cb7b4e'
  const policy = `100644 blob ${newBlob}\t${path}`
  const fixture = `100644 blob ${'a'.repeat(40)}\t${BACKEND_FIXTURE_EXCEPTION}`
  const app = `100644 blob ${'b'.repeat(40)}\tserver-version/backend/src/app.ts`
  const text = [policy, fixture, app].join('\n') + '\n'
  assert.throws(() => computeBackendCompileDigest(text.replace(newBlob, oldBlob)))
  for (const invalid of [text.replace(newBlob, 'c'.repeat(40)), text.replace(policy + '\n', ''),
    text + policy + '\n', text.replace(policy, policy.replace('100644', '100755')),
    text.replace(path, path + '.other')]) {
    assert.throws(() => computeBackendCompileDigest(invalid))
    assert.throws(() => computeBackendCompileDigest(invalid, { historical: true }))
  }
  assert.throws(() => computeBackendCompileDigest(text, { historical: 'true' }))
})
