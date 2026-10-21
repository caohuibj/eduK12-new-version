'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { totpAt, redactDiagnostics, failureDetail, assertDeniedImage, assertExportParts, REQUIRED } = require('./scale-authoring-feedback-browser.cjs')

test('TOTP code and counter derive from one instant at the real-step boundary', () => {
  const secret = Buffer.from('12345678901234567890').toString('base64')
  assert.deepEqual(totpAt(secret, 29999), { step: 0, code: '755224' })
  assert.deepEqual(totpAt(secret, 30000), { step: 1, code: '287082' })
  assert.deepEqual(totpAt(secret, 59999), { step: 1, code: '287082' })
  assert.equal(totpAt(secret, 60000).step, 2)
})
test('diagnostics retain phase and actionable error but redact credentials and URLs', () => {
  const item = failureDetail(new Error('selector missing; token=unsafe https://example.test/r/secret#proof'), 'survey-export-csv')
  assert.equal(item.phase, 'survey-export-csv')
  assert.match(item.message, /selector missing/)
  assert(!JSON.stringify(item).includes('unsafe'))
  assert(!JSON.stringify(item).includes('example.test'))
  const value = redactDiagnostics({ accessCredential: 'test-proof', nested: ['Bearer secret-value', 'eyJabc.eyJxyz.signature'] })
  assert(!JSON.stringify(value).includes('test-proof'))
  assert(!JSON.stringify(value).includes('secret-value'))
  assert(!JSON.stringify(value).includes('signature'))
})
test('image denial is exact rejection, not a 500 or an image body under an error status', () => {
  const result = { status: 404, contentType: 'application/json', pngSignature: false, jpegSignature: false, webpSignature: false }
  assert.doesNotThrow(() => assertDeniedImage(result, 404))
  for (const changed of [{ status: 500 }, { status: 401 }, { contentType: 'image/png' }, { pngSignature: true }, { jpegSignature: true }, { webpSignature: true }]) {
    assert.throws(() => assertDeniedImage({ ...result, ...changed }, 404))
  }
})
function parts() {
  const artifact = { id: 'ticket-1', format: 'RAW_WAVE', csv: 'item_purpose\nCONTENT\nATTENTION_CHECK\nSOCIAL_DESIRABILITY\n',
    codebook: [{ purpose: 'CONTENT' }, { purpose: 'ATTENTION_CHECK', attentionTarget: 'o2' }, { purpose: 'SOCIAL_DESIRABILITY' }], manifest: { rowCount: 3 } }
  return [
    { part: 'csv', filename: 'same-batch.csv', text: '\uFEFF' + artifact.csv, artifact },
    { part: 'codebook', filename: 'same-batch_codebook.json', text: JSON.stringify(artifact.codebook), artifact },
    { part: 'manifest', filename: 'same-batch_manifest.json', text: JSON.stringify(artifact.manifest), artifact },
  ]
}
test('three downloaded files are actual matching content from one frozen ticket', () => {
  const input = parts()
  assert.equal(assertExportParts(input, { id: 'ticket-1', format: 'RAW_WAVE' }), input[0].artifact)
})
test('export rejects mixed tickets, mismatched file content and wrong batch filename', () => {
  for (const mutate of [
    input => { input[1].artifact = { ...input[1].artifact, id: 'other-ticket' } },
    input => { input[0].text = 'different CSV' },
    input => { input[1].text = '[]' },
    input => { input[2].text = '{"rowCount":0}' },
    input => { input[2].filename = 'other-batch_manifest.json' },
  ]) {
    const input = parts(); mutate(input)
    assert.throws(() => assertExportParts(input, { id: 'ticket-1', format: 'RAW_WAVE' }))
  }
})
test('negative image acceptance is a required checkpoint, not optional evidence', () => {
  assert(REQUIRED.includes('training-report-image-denies-other-user'))
  assert(REQUIRED.includes('survey-report-image-denies-missing-proof'))
})
test('real browser transport contract does not use unsupported batch download or Node request contexts', () => {
  const source = fs.readFileSync(require.resolve('./scale-authoring-feedback-browser.cjs'), 'utf8')
  assert(!source.includes('下载当前批次 CSV、Codebook 与 Manifest'))
  assert(!/\b(?:page|author|participant|learner|context)\.request\./.test(source))
  assert(source.includes("[['csv', 'CSV'], ['codebook', 'Codebook'], ['manifest', 'Manifest']]"))
  assert(source.includes("await download.path()"))
  assert(source.includes("stepUpCode.step > loginStep"))
  assert(source.includes("assert.equal(denied.length, 0)"))
})

test('Training declaration locator remains stable after React textarea value updates', () => {
  const source = fs.readFileSync(require.resolve('./scale-authoring-feedback-browser.cjs'), 'utf8')
  const locator = "author.getByPlaceholder('说明题目内容由谁提供，以及允许在本系统中使用的范围', { exact: true })"
  assert.equal(source.split(locator).length - 1, 3, 'Use the same stable identity before creation, when editing and on readback')
  assert(!source.includes("getByLabel('自有内容 / 授权声明'"), 'Nested textarea child text is part of Playwright label text after React updates')
  assert(source.includes(locator + '.count(), 0'), 'New draft must still reject unsavable definition inputs')
  assert(source.includes(locator + ".fill('Self-authored synthetic CI content only')"))
  assert(source.includes(locator + '.inputValue(), written.license.note)'), 'Persisted value equality must not be weakened')
})

test('Survey publication waits for library refresh completion, not just PATCH acknowledgement', () => {
  const source = fs.readFileSync(require.resolve('./scale-authoring-feedback-browser.cjs'), 'utf8')
  const ack = source.indexOf("phase('survey-author-save')")
  const ready = source.indexOf("await builder.getByRole('status').filter({ hasText: '草稿已保存；发布冻结将在研究波次阶段执行' }).waitFor()")
  const publication = source.indexOf("phase('survey-publication')")
  assert(ack >= 0 && ready > ack && publication > ready)
})

test('Training answer action waits for durable next-item state rather than transient radio checked', async () => {
  const { answerTrainingItem } = require('./scale-authoring-feedback-browser.cjs')
  const events = []
  const page = { getByRole(role, options) {
    return {
      async waitFor() { events.push(['wait', role, options]) },
      async click() { events.push(['click', role, options]) },
      async check() { throw new Error('Immediate post-click checked verification is incompatible with durable asynchronous selection') },
    }
  } }
  await answerTrainingItem(page, 'first', 'choice', 'second')
  assert.deepEqual(events, [
    ['wait', 'heading', { name: 'first', exact: true }],
    ['click', 'radio', { name: 'choice', exact: true }],
    ['wait', 'heading', { name: 'second', exact: true }],
  ])
})
test('Training final answer waits for selection and enabled explicit submit without auto-submitting', async () => {
  const { answerTrainingItem } = require('./scale-authoring-feedback-browser.cjs')
  const events = []
  const page = { getByRole(role, options) { return {
    async waitFor() { events.push(['wait', role, options]) },
    async click() { assert.equal(role, 'radio'); events.push(['click', role, options]) },
    async isVisible() { events.push(['visible', role, options]); return true },
  } } }
  await answerTrainingItem(page, 'last', 'choice', undefined)
  assert.deepEqual(events.slice(2), [
    ['wait', 'radio', { name: 'choice', exact: true, checked: true }],
    ['wait', 'button', { name: '完成测评', exact: true, disabled: false }],
    ['visible', 'heading', { name: 'last', exact: true }],
  ])
  const source = fs.readFileSync(require.resolve('./scale-authoring-feedback-browser.cjs'), 'utf8')
  assert(source.includes("trainingFinal.request.postDataJSON().answers.map(({ itemCode, responseValue }) => ({ itemCode, responseValue })), expectedAnswers"))
  assert(source.includes("final.request.postDataJSON().answers, { [surveyUnit.instrumentKey]: expectedSurveyAnswers }"))
})

test('API failure diagnostics retain business rejection and issue fields without bodies or credentials', () => {
  const { apiFailureDetail } = require('./scale-authoring-feedback-browser.cjs')
  const response = { status: () => 409, request: () => ({ method: () => 'POST' }), url: () => 'https://survey.test/api/public/survey/r/private-cap/attempts/one/prepare' }
  const detail = apiFailureDetail(response, { code: 'CONTENT_RELEASE_NOT_PUBLISHED', message: '请先显式发布当前修订的测量版本，再冻结波次',
    token: 'secret-body', data: { accessCredential: 'private-proof', issues: [{ path: ['items', 1], code: 'invalid_type', message: 'invalid token=unsafe', input: 'private-input' }] } })
  assert.equal(detail.status, 409); assert.equal(detail.code, 'CONTENT_RELEASE_NOT_PUBLISHED')
  assert.equal(detail.message, '请先显式发布当前修订的测量版本，再冻结波次')
  assert.equal(detail.issues[0].path, 'items.1')
  for (const secret of ['private-cap', 'secret-body', 'private-proof', 'private-input', 'unsafe']) assert(!JSON.stringify(detail).includes(secret))
  assert.equal(apiFailureDetail(response, null).message, 'Response has no safe API message')
})
function trainingReuseFixture() {
  const { TRAINING_REUSE_SOURCE } = require('./scale-authoring-feedback-browser.cjs')
  const bytes = Buffer.from('original synthetic screenshot bytes')
  const hash = require('node:crypto').createHash('sha256').update(bytes).digest('hex')
  const pairs = ['training-editor', 'training-report'].flatMap(name => [1440, 768, 390].map(width => ({ name, width })))
  return { bytes, dto: { ...TRAINING_REUSE_SOURCE, originalStatus: 'FAIL',
    checks: ['training-stable-item-operations', 'training-editor-native', 'training-quality-roundtrip', 'training-published', 'training-final-report-image', 'training-report-image-denies-other-user'],
    screenshots: pairs.map(pair => ({ ...pair, file: pair.name + '-' + pair.width + '.png', sha256: hash })),
    layoutChecks: pairs.map(pair => ({ ...pair, overflow: false })),
    accessibility: ['training-editor', 'training-report'].map(name => ({ name, version: '4.10.3', passes: 17, violations: [] })),
    computedStyles: ['training-editor', 'training-report'].map(name => ({ name })),
    participantAnswers: [{ name: 'training', answerCount: 3, matchesFinalSnapshot: true }],
    imageAuthorization: [{ name: 'training-other-user', positiveStatus: 200, deniedStatus: 404, deniedImage: false, deniedLength: 60 }], browserErrors: [], blockedExternalRequests: 0,
  } }
}
test('fixed Training reuse verifies exact source, actual screenshot bytes and every inherited gate', () => {
  const { validateTrainingReuse } = require('./scale-authoring-feedback-browser.cjs')
  const { dto, bytes } = trainingReuseFixture()
  const source = validateTrainingReuse(dto, () => bytes)
  assert.equal(source.runId, 39571934879); assert.equal(source.originalStatus, 'FAIL'); assert.equal(Object.keys(source.screenshotHashes).length, 6)
  for (const mutate of [
    d => { d.sourceRun++ }, d => { d.sourceReportSha256 = '0'.repeat(64) }, d => { d.originalStatus = 'PASS' },
    d => { d.checks.pop() }, d => { d.screenshots[0].file = '../unsafe.png' }, d => { d.layoutChecks[0].overflow = true },
    d => { d.accessibility[1].violations.push({ id: 'contrast' }) }, d => { d.participantAnswers[0].answerCount = 2 },
    d => { d.imageAuthorization[0].deniedStatus = 500 },
  ]) { const altered = structuredClone(dto); mutate(altered); assert.throws(() => validateTrainingReuse(altered, () => bytes)) }
  assert.throws(() => validateTrainingReuse(dto, () => Buffer.from('changed bytes')))
})
test('Survey explicitly publishes current revision before freezing and binds participant receipt to that release', () => {
  const source = fs.readFileSync(require.resolve('./scale-authoring-feedback-browser.cjs'), 'utf8')
  const published = source.indexOf("phase('survey-measurement-publication')")
  assert(published > source.indexOf("await builder.getByRole('status')"))
  assert(source.indexOf("phase('survey-publication')") > published)
  assert(source.includes("measurement.request.postDataJSON().revision, saved.data.revision"))
  assert(source.includes("measurement.data.version, String(saved.data.revision)"))
  assert(source.includes("frozenMeasurement.measurementReleaseId, measurement.data.releaseId"))
  assert(source.includes("name: '刷新报告与测量列表', exact: true, disabled: false"))
})
