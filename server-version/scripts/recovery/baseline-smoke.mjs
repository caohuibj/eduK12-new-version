import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fingerprintTools from './runtime-fingerprint.cjs'

const stateDir = process.argv[2]
assert.ok(stateDir, 'private isolated state directory required')
const status = JSON.parse(fs.readFileSync(path.join(stateDir, 'status.json'), 'utf8'))
assert.equal(status.state, 'running')
assert.equal(new URL(status.apiUrl).hostname, '127.0.0.1')
const fixture = JSON.parse(fs.readFileSync(path.join(stateDir, 'fixture-private.json'), 'utf8'))
const runtime = JSON.parse(fs.readFileSync(path.join(stateDir, 'runtime-private.json'), 'utf8'))
const runtimeKeys = ['DATABASE_URL', 'DATABASE_URL_RUNTIME', 'REDIS_URL', 'PORT', 'CORS_ORIGIN', 'COOKIE_SECURE',
  'JWT_SECRET', 'ASSET_SIGNING_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY', 'COGNITIVE_MODULE_ENABLED',
  'BACKGROUND_WORKERS_ENABLED', 'HEAVY_PROCESSING_ENABLED', 'VIDEO_PROCESSING_ENABLED', 'ASSESSMENT_REPORT_ASYNC_ENABLED', 'UPLOAD_DIR']
const consumerEnv = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: stateDir, TMPDIR: stateDir,
  LANG: 'C.UTF-8', NODE_ENV: 'test', ...Object.fromEntries(runtimeKeys.filter(key => runtime[key] !== undefined).map(key => [key, runtime[key]])) }
assert.equal(Object.hasOwn(consumerEnv, 'DATABASE_URL_OWNER'), false)
assert.equal(new URL(consumerEnv.DATABASE_URL).username, 'eduk12_runtime')
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend')
const beforeFingerprint = fingerprintTools.fingerprint(backend)
assert.deepEqual(beforeFingerprint, status.runtimeFingerprint, 'smoke must consume the exact runtime inputs recorded at API startup')
const scriptSha256 = fingerprintTools.hashFile(fileURLToPath(import.meta.url))
const checks = []
const resultPath = path.join(stateDir, `baseline-smoke-${Date.now()}-${randomUUID()}.json`)
const check = name => { checks.push(name); console.log('PASS', name) }
let requests = 0
function client() {
  const cookies = new Map()
  async function request(route, method = 'GET', body, expected = 200, raw = false) {
    requests++
    const response = await fetch(status.apiUrl + '/api' + route, {
      method, signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json',
        ...(cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(cookies.has('ptool_csrf') ? { 'x-csrf-token': cookies.get('ptool_csrf') } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], i = pair.indexOf('=')
      cookies.set(pair.slice(0, i), pair.slice(i + 1))
    }
    const text = await response.text()
    assert.equal(response.status, expected, `${method} ${route}: ${text.slice(0, 400)}`)
    if (raw || expected !== 200) return text
    const payload = JSON.parse(text)
    assert.equal(payload.code, 0, `${route}: ${payload.message}`)
    return payload.data
  }
  return { request, async login(user, expectedRole) {
    await request('/auth/csrf')
    const result = await request('/auth/training-login', 'POST', { ...user, expectedRole })
    assert.ok(result)
  } }
}

try {
  const teacher = client(), student = client()
  await teacher.login(fixture.teacher, 'TEACHER')
  await student.login(fixture.student, 'STUDENT')
  check('real Training teacher and student cookie/CSRF login')
  let draft = await teacher.request('/questionnaire-products', 'POST', {
    requestId: randomUUID(), name: 'C02 synthetic Form baseline', questionnaireType: 'COURSE',
    courseIds: [fixture.courses[0].id], publicEnabled: false,
  })
  const id = draft.id
  const content = 'C02中文反思，含"引号"\n第二行🙂'
  draft = await teacher.request(`/questionnaire-products/${id}/items`, 'POST', {
    revision: draft.revision, item: { type: 'FORM', formType: 'text_input', formLabel: '基线反思', required: true },
  })
  const preflight = await teacher.request(`/questionnaire-products/${id}/preflight`, 'POST', { revision: draft.revision })
  assert.ok(preflight)
  await teacher.request(`/questionnaire-products/${id}/publish`, 'POST', { revision: draft.revision })
  check('authorized draft, Form item, preflight and publication')
  const { attempt } = await student.request(`/composite-assessments/${id}/attempts`, 'POST', {})
  assert.equal(attempt.currentItem.type, 'FORM_SECTION')
  const section = attempt.currentItem
  const payload = {
    submissionId: randomUUID(), attemptEpoch: attempt.attemptEpoch,
    definitionHash: section.definitionHash, contextSnapshotHash: attempt.contextSnapshotHash,
    answers: section.answers.map(item => ({ formItemId: item.formItemId, value: content })),
  }
  const submitRoute = `/composite-assessments/attempts/${attempt.id}/form-sections/${section.id}/submit`
  await student.request(submitRoute, 'POST', payload)
  const replay = await student.request(submitRoute, 'POST', payload)
  assert.equal(replay.replayed, true)
  check('real Form FINAL and identical submission replay')
  let report, reportReady = false
  for (let n = 0; n < 30; n++) {
    const reportStatus = await student.request(`/composite-assessments/attempts/${attempt.id}/report-status`)
    if (reportStatus.reportStatus?.state === 'READY') { reportReady = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.equal(reportReady, true, 'report must become READY within the bounded poll window')
  report = await teacher.request(`/composite-assessments/${id}/attempts/${attempt.id}/report`)
  const containsExactValue = value => value === content || (value && typeof value === 'object' && Object.values(value).some(containsExactValue))
  assert.ok(containsExactValue(report), 'teacher report retains synthetic Form content')
  await student.request(`/questionnaire-products/${id}/reports`, 'GET', undefined, 403)
  check('teacher report retains answers; student teacher-report route denied')
  const queued = await teacher.request(`/composite-assessments/${id}/export`, 'POST', {
    detail: 'full', format: 'csv', anonymize: true,
  })
  assert.ok(queued.batchId)
  // Execute the original compiled consumer against the HTTP-enqueued batch.
  // This is bounded functional coverage, not a queue-throughput benchmark.
  const workerLog = fs.openSync(resultPath.replace(/\.json$/, '-export-worker.log'), 'wx', 0o600)
  try {
    execFileSync(process.execPath, ['-e',
      "require('./dist/workers/exportBatchTask').runExportBatch({data:{batchId:process.argv[1]},id:'c02-'+process.argv[1],opts:{attempts:1},attemptsMade:0}).then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})",
      queued.batchId], { cwd: backend, env: consumerEnv,
      timeout: 60000, stdio: ['ignore', workerLog, workerLog] })
  } finally { fs.closeSync(workerLog) }
  const download = queued.artifacts.find(a => a.format === 'csv')
  assert.ok(download)
  const route = download.downloadUrl.replace(/^\/api/, '')
  const csv = await teacher.request(route, 'GET', undefined, 200, true)
  assert.ok(csv.includes(content.replaceAll('"', '""')), 'CSV preserves escaped quotes, Chinese and newline')
  await student.request(route, 'GET', undefined, 403)
  check('HTTP queued compiled export, exact synthetic CSV text, student download denied')
  let mixed = await teacher.request('/questionnaire-products', 'POST', {
    requestId: randomUUID(), name: 'C02 four-tool synthetic fixture', questionnaireType: 'COURSE',
    courseIds: [fixture.courses[0].id], publicEnabled: false,
  })
  for (const item of [
    { type: 'FORM', formType: 'text_input', formLabel: '组合反思' },
    { type: 'SCALE', scaleId: fixture.scaleId },
    { type: 'COGNITIVE', cognitiveAssignmentId: fixture.assignmentId },
    { type: 'SITUATIONAL', situationalInstrumentKey: 'sjt-assertiveness-golden', situationalInstrumentVersion: '1.0.0' },
  ]) mixed = await teacher.request(`/questionnaire-products/${mixed.id}/items`, 'POST', { revision: mixed.revision, item })
  const mixedPreflight = await teacher.request(`/questionnaire-products/${mixed.id}/preflight`, 'POST', { revision: mixed.revision })
  assert.equal(mixedPreflight.ok, true)
  mixed = await teacher.request(`/questionnaire-products/${mixed.id}/publish`, 'POST', { revision: mixed.revision })
  const mixedStart = await student.request(`/composite-assessments/${mixed.id}/attempts`, 'POST', {})
  assert.deepEqual(mixedStart.attempt.units.map(unit => unit.type).sort(), ['COGNITIVE', 'FORM_SECTION', 'SCALE', 'SITUATIONAL'])
  check('four-tool synthetic fixture preflight, publish and authorized admission (not completion)')
  assert.deepEqual(fingerprintTools.fingerprint(backend), beforeFingerprint, 'runtime inputs must not change during smoke')
  assert.equal(fingerprintTools.hashFile(fileURLToPath(import.meta.url)), scriptSha256, 'harness source must not change during smoke')
  fs.writeFileSync(resultPath, JSON.stringify({
    passed: true, checks, requests, head: status.head, node: process.version,
    sourceScriptSha256: scriptSha256, runtimeFingerprint: beforeFingerprint,
    scope: 'Form full baseline; four-tool authoring/admission only, no mixed completion/browser/performance claim',
  }, null, 2))
} catch (error) {
  fs.writeFileSync(resultPath, JSON.stringify({ passed: false, checks, requests, error: String(error) }, null, 2))
  throw error
}
