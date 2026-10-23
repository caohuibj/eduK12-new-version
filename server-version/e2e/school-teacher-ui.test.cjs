/* Pure matrix/negative tests only. No browser, services, DB, installation or build. */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { appearanceKeys, imageMode, validateSelectedImages, verifyReport, originalShots, darkStates, cjkSampleIds } = require('./school-teacher-ui.cjs')
const { CHROME_LAUNCH_OPTIONS, CJK_SAMPLES } = require('./school-teacher-chrome.cjs')

test('appearance keys separate guest, synthetic accounts and product namespace', () => {
  const school = appearanceKeys('SCHOOL', 'synthetic/a'), teacher = appearanceKeys('TEACHER', 'synthetic/a')
  assert.equal(school.current, 'school:appearance:v1:synthetic%2Fa')
  assert.notEqual(school.current, school.guest); assert.notEqual(school.current, teacher.current)
  assert.notEqual(school.current, appearanceKeys('SCHOOL', 'other').current)
  assert.equal(school.otherProduct, teacher.current)
  assert.throws(() => appearanceKeys('SURVEY', 'a'))
})

test('hashed School artwork and responsive Teacher artwork retain the selected mode', () => {
  assert.equal(imageMode('SCHOOL', '/assets/huischool-campus-moonlight-ABC_def123.webp'), 'dark')
  assert.equal(imageMode('SCHOOL', '/assets/huischool-campus-sunlight-X.webp'), 'light')
  assert.equal(imageMode('TEACHER', '/huiteacher/educator-journal-small.webp'), 'light')
  assert.equal(imageMode('TEACHER', '/huiteacher/educator-journal-moonlight-small.webp'), 'dark')
  assert.equal(imageMode('TEACHER', '/huiteacher/unrelated.webp'), null)
})

test('real resource evidence rejects an unselected download, wrong current image or missing background', () => {
  const origin = 'https://teacher.eduk12.top', light = origin + '/huiteacher/educator-journal.webp'
  const dark = origin + '/huiteacher/educator-journal-moonlight.webp'
  assert.equal(validateSelectedImages('TEACHER', 'light', [light], light, [light], light).selectedOnly, true)
  for (const args of [[[], light, [light], light], [[light, dark], light, [light], light], [[light], dark, [light], light],
    [[light], light, [light, dark], light], [[light], light, [], light], [[light], light, [light], dark]])
    assert.throws(() => validateSelectedImages('TEACHER', 'light', ...args))
})

function sample() {
  const head = 'a'.repeat(40), tree = 'b'.repeat(40), runId = '40000000001'
  const manifests = Object.fromEntries(['frontend', 'backend'].map(kind => [kind, { schemaVersion: 1, kind, sha: head, runId,
    contentDigest: 'c'.repeat(64), lockDigest: 'd'.repeat(64) }]))
  const chrome = { options: CHROME_LAUNCH_OPTIONS, launchedVersion: '151.0.1.2', preflight: {
    ok: true, code: 'CHROME_PREFLIGHT_READY', schemaVersion: 1, scope: 'preinstalled-chrome-preflight', acceptance: false,
    browserLaunched: false, platform: 'linux', architecture: 'x64', nonroot: true,
    package: { name: 'google-chrome-stable', architecture: 'amd64', packageVersion: '151.0.1.2-1', browserVersion: '151.0.1.2' },
    files: ['/opt/google/chrome/chrome', '/opt/google/chrome/chrome-sandbox'].map(file => ({ path: file,
      rootOwned: true, executable: true, groupOrWorldWritable: false, permissionMode: 0o755, setuid: false })),
    playwright: { version: '1.62.1', browserType: 'chromium', executablePath: '/opt/google/chrome/chrome', lockSha256: 'e'.repeat(64), publicApiSha256: 'f'.repeat(64) },
    launchOptions: CHROME_LAUNCH_OPTIONS }, sandbox: { ok: true, code: 'CHROME_SANDBOX_VERIFIED', seccompBpf: true, suidSandbox: false, pidNamespaces: true } }
  chrome.fonts = { ok: true, code: 'CJK_FONT_PREFLIGHT_READY', schemaVersion: 1, scope: 'preinstalled-cjk-fonts',
    acceptance: false, browserLaunched: false, fonts: [{ postScriptName: 'SyntheticCjk-Regular',
      path: '/usr/share/fonts/truetype/synthetic/Cjk.ttf', faceIndex: 0, charset: [[0x4e00, 0x9fff], [0xff0c, 0xff0c]],
      rootOwned: true, groupOrWorldWritable: false, permissionMode: 0o644, sizeBytes: 1024 }] }
  const makeSession = (product, actor) => {
    const expectedFailures = [(product === 'SCHOOL' ? '/api/campus' : '/api/huiteacher') + '/auth/me:401']
    if (product === 'SCHOOL' && actor === 'author') expectedFailures.push('/api/campus/reports/student/executions/synthetic:404')
    if (actor === 'ordinary-psychology-author') expectedFailures.push('/api/huiteacher/organizations/synthetic/evaluation-targets:403')
    return { product, actor, pageErrors: [], unexpectedRequests: [], requestFailures: [], failedResponses: [], consoleErrors: [], expectedFailures,
      apiMutations: [], staticRequests: [], staticResponses: [] }
  }
  const obs = width => ({ viewport: { width, height: width === 1440 ? 900 : 844 },
    layout: { width, scrollWidth: width, secretNodes: 0, filledPasswords: false, clipped: [] },
    keyboard: { visible: true, focusVisible: true, ring: true }, accessibility: { violations: [], passes: 1, incomplete: [] } })
  const report = { schemaVersion: 1, status: 'PASSED', source: { head, tree }, runId, inputs: manifests, chrome,
    startups: [], errors: [], coverage: [], screenshots: [], keyboard: [], sessions: [], notCovered: ['Real media storage', 'Public TLS'],
    ui: { schemaVersion: 1, scope: 'bounded-brand-theme-layout', fontIssues: [], observations: [], screenshots: [], checks: [], sessions: [], notCovered: ['Real cognitive task computed-style isolation', 'CJK evidence covers four fixed real Chinese nodes, not every Unicode character or every page'] } }
  for (const product of ['SCHOOL', 'TEACHER']) {
    const p = product.toLowerCase(), prefix = 'https://' + p + '.eduk12.top'
    report.startups.push({ product, corsOrigin: prefix, ready: true, phase: 'READY' })
    for (const kind of ['SCALE', 'FORM']) {
      report.coverage.push({ product, check: 'author-' + kind, creation: 'UI', saveDiscardPreviewFreeze: 'UI', immutableVersion: true })
      report.coverage.push({ product, check: `separate-${product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'}-SELF-${kind}`, final: 'COMPLETED', localDraftResume: true,
        ...(kind === 'FORM' ? { typedAdapter: ['SINGLE', 'MULTIPLE', 'MATRIX', 'CONDITIONAL_REFUSAL', 'ROW_REFUSAL', 'TWO_SECTIONS'] } : {}) })
    }
    report.coverage.push({ product, check: 'fixed-version-preview-publish', executionCount: product === 'SCHOOL' ? 2 : 4 })
    for (const width of [1440, 390]) for (const state of originalShots)
      report.screenshots.push({ ...obs(width), file: `screenshots/${p}-${state}-${width}.png` })
    for (const control of ['checkbox', 'radio', 'radio', 'scale-option-button']) report.keyboard.push({ product, control, action: 'Space', selected: true, focusVisible: true })
    const actors = ['author', 'participant', ...(product === 'TEACHER' ? ['ordinary-psychology-author'] : [])]
    for (const actor of actors) {
      report.sessions.push(makeSession(product, actor))
      report.ui.checks.push({ product, check: 'preference-' + actor, realGuestToAccount: true, reloadPersisted: true,
        isolatedValues: { guest: 'light', current: 'light', otherAccount: 'auto', otherProduct: 'dark' } })
    }
    const add = (state, theme, width, screenshot) => {
      const row = { ...obs(width), product, state, theme, brand: { path: '/assets/' + p + '-wordmark-test.svg', symbol: '#' + p + '-wordmark', width: 200, height: 100,
        visible: true, color: theme === 'light' ? 'rgb(10, 20, 30)' : 'rgb(200, 210, 220)' } }
      row.fonts = cjkSampleIds(product, state, width).map(sampleId => ({ sampleId, fonts: [{ postScriptName: 'SyntheticCjk-Regular', isCustomFont: false, glyphCount: CJK_SAMPLES[sampleId].text.length }] }))
      if (screenshot) { row.file = `screenshots/ui-${p}-${state}-${theme}-${width}.png`; report.ui.screenshots.push(row.file) }
      report.ui.observations.push(row)
    }
    for (const mode of ['light', 'dark']) {
      const file = product === 'SCHOOL' ? `/assets/huischool-campus-${mode === 'light' ? 'sunlight' : 'moonlight'}-hash.webp`
        : `/huiteacher/educator-journal${mode === 'dark' ? '-moonlight' : ''}.webp`
      const s = makeSession(product, 'public-' + mode)
      s.staticRequests.push(prefix + file); s.staticResponses.push({ path: file, status: 200 }); report.ui.sessions.push(s)
      report.ui.checks.push({ product, check: 'cold-artwork-' + mode, selectedOnly: true, requested: [file], currentSrc: file, loginBackground: file })
      for (const width of [320, 390]) { add('public-home', mode, width, width === 320); add('public-login-empty', mode, width, false) }
    }
    for (const width of [320, 390]) {
      add('compact-workspace', 'dark', width, width === 320)
      report.ui.checks.push({ product, check: 'workspace-keyboard-' + width, collapsedAfter: true, focusVerified: true })
      for (const state of darkStates) add(state, 'dark', width, width === 390)
    }
  }
  report.coverage.push({ product: 'TEACHER', check: 'ordinary-psychology-author-real-API', compiled: true, publicationAuthorityNotElevated: true })
  report.ui.checks.push({ product: 'TEACHER', check: 'school-management-anchor', focusVerified: true })
  return { report, identity: { head, tree, runId, ...manifests } }
}
function png(file) {
  const width = Number(/-(\d+)\.png$/.exec(file)[1]), bytes = Buffer.alloc(33)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes); bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(width === 1440 ? 900 : 844, 20)
  return bytes
}
test('complete exact-source report accepts original matrix plus bounded UI evidence', () => {
  const s = sample(), accepted = verifyReport(s.report, s.identity, png)
  assert.equal(accepted.coverage, 11); assert.equal(accepted.screenshots, 40); assert.equal(accepted.sessions, 5)
  assert.equal(accepted.keyboardSpace, 8); assert.equal(accepted.uiScreenshots, 12); assert.equal(accepted.uiObservations, 32)
})
test('old artifacts, source substitution, missing core evidence and arbitrary expected failures are rejected', () => {
  for (const mutate of [r => { r.buildReuse = {} }, r => { r.inputs.frontend.sha = '0'.repeat(40) }, r => { r.runId = '1' },
    r => { r.source.tree = '0'.repeat(40) }, r => r.coverage.pop(), r => r.screenshots.pop(), r => r.keyboard.pop(), r => r.sessions.pop(),
    r => r.sessions[0].expectedFailures.push('/api/campus/anything:500'), r => r.sessions[0].failedResponses.push({ path: '/api/campus/error', status: 500 }),
    r => { r.coverage.find(c => c.check === 'author-FORM').immutableVersion = false }]) {
    const s = sample(); s.report = structuredClone(s.report); mutate(s.report)
    assert.throws(() => verifyReport(s.report, s.identity, png))
  }
})
test('missing or relaxed Chrome and sandbox proof never becomes acceptance', () => {
  for (const mutate of [r => { r.chrome.preflight.ok = false }, r => { r.chrome.options.chromiumSandbox = false },
    r => { r.chrome.launchedVersion = '150.0.1.2' }, r => { r.chrome.sandbox.seccompBpf = false }, r => { r.chrome.sandbox.pidNamespaces = false },
    r => { r.chrome.preflight.files[0].rootOwned = false }]) {
    const s = sample(); s.report = structuredClone(s.report); mutate(s.report)
    assert.throws(() => verifyReport(s.report, s.identity, png))
  }
})
test('UI omission, wrong image, secret field, clipped focus and contrast failures are rejected', () => {
  for (const mutate of [r => r.ui.observations.pop(), r => r.ui.screenshots.pop(), r => r.ui.checks.pop(), r => r.ui.sessions.pop(),
    r => { r.ui.observations[0].brand.width = 0 }, r => { r.ui.observations[0].layout.filledPasswords = true },
    r => r.ui.observations[0].layout.clipped.push({ tag: 'BUTTON' }), r => { r.ui.observations[0].keyboard.visible = false },
    r => r.ui.observations[0].accessibility.violations.push({ id: 'color-contrast' }),
    r => { r.ui.checks.find(c => c.check === 'preference-author').isolatedValues.guest = 'dark' },
    r => r.ui.sessions[0].staticRequests.push('https://school.eduk12.top/assets/huischool-campus-moonlight-FAIL.webp'),
    r => r.ui.sessions[0].apiMutations.push({ path: '/api/campus/auth/login', method: 'POST' })]) {
    const s = sample(); s.report = structuredClone(s.report); mutate(s.report)
    assert.throws(() => verifyReport(s.report, s.identity, png))
  }
})
test('screenshot reader is restricted to exact PNG names and matching viewport dimensions', () => {
  const s = sample()
  assert.throws(() => verifyReport(s.report, s.identity, () => Buffer.from('not a PNG')))
  assert.throws(() => verifyReport(s.report, s.identity, () => png('wrong-320.png')))
  s.report.ui.observations[0].file = '../private/fixture.json'
  assert.throws(() => verifyReport(s.report, s.identity, png))
})
