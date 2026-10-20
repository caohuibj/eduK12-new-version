'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createResponseLoss, forwardSelection } = require('./measurement-response-loss.cjs')
const marker = 'synthetic-cookie-must-not-leak'
const request = { url: () => 'https://training.eduk12.top:3189/api/questionnaire-products/11111111-1111-4111-8111-111111111111/content-report-selection',
  method: () => 'POST', allHeaders: async () => ({ cookie: marker, 'x-csrf-token': marker }), postDataBuffer: () => Buffer.from('{"realUiBody":true}') }
test('rejected upstream and rejected browser abort never escape callback or retain raw secrets', async () => {
  let aborted = 0
  const loss = createResponseLoss(async () => { throw new Error('Cookie: ' + marker) })
  await assert.doesNotReject(loss.handler({ request: () => request, abort: async () => { aborted++; throw new Error(marker) } }))
  await loss.settled
  assert.equal(aborted, 1)
  assert.equal(loss.state.failure, 'UPSTREAM_NOT_CONFIRMED')
  assert.equal(loss.state.committed, null)
  assert.equal(loss.state.settled, true)
  assert.ok(!JSON.stringify(loss.state).includes(marker))
})
test('confirmed real upstream result is retained before response is lost', async () => {
  const actual = { trainingReportSelectionDraft: { units: [{ reportReleaseId: 'actual-upstream-release' }] } }
  let aborted = false
  const loss = createResponseLoss(async () => actual)
  await loss.handler({ request: () => request, abort: async () => { assert.equal(loss.state.committed, actual); aborted = true } })
  await loss.settled
  assert.equal(loss.state.requests, 1); assert.equal(loss.state.failure, null); assert.equal(aborted, true)
})
test('transport uses loopback with verified canonical TLS and preserves real request bytes', async () => {
  let seen, sent
  const ca = Buffer.from('explicit-job-ca')
  const requestImpl = (options, receive) => {
    seen = options
    const upstream = new EventEmitter()
    upstream.destroy = () => {}
    upstream.end = body => {
      sent = body
      process.nextTick(() => {
        const response = new EventEmitter(); response.statusCode = 200
        receive(response)
        response.emit('data', Buffer.from(JSON.stringify({ code: 0, data: { committed: true } })))
        response.emit('end')
      })
    }
    return upstream
  }
  assert.deepEqual(await forwardSelection(request, { requestImpl, ca }), { committed: true })
  assert.equal(seen.hostname, '127.0.0.1'); assert.equal(seen.port, 3189)
  assert.equal(seen.servername, 'training.eduk12.top'); assert.equal(seen.headers.host, 'training.eduk12.top:3189')
  assert.equal(seen.headers['accept-encoding'], 'identity'); assert.equal(seen.rejectUnauthorized, true); assert.equal(seen.ca, ca)
  assert.equal(seen.headers.cookie, marker); assert.deepEqual(sent, request.postDataBuffer())
})
test('transport rejects socket errors without copying headers or error message', async () => {
  const requestImpl = () => {
    const upstream = new EventEmitter()
    upstream.destroy = () => {}
    upstream.end = () => process.nextTick(() => upstream.emit('error', new Error('Cookie: ' + marker)))
    return upstream
  }
  await assert.rejects(forwardSelection(request, { requestImpl, ca: Buffer.from('job-ca') }), error => error.message === 'Isolated upstream transport failed' && !error.stack.includes(marker))
})
test('shared route safety boundary swallows continue/abort rejection and records only fixed failure', async () => {
  const { guardRouteCallback } = require('./measurement-response-loss.cjs')
  const failures = []
  let aborted = 0
  const guarded = guardRouteCallback(async route => route.continue(), () => failures.push('SAFE_CALLBACK_FAILURE'))
  await assert.doesNotReject(guarded({ continue: async () => { throw new Error(marker) }, abort: async () => { aborted++; throw new Error(marker) } }))
  assert.equal(aborted, 1); assert.deepEqual(failures, ['SAFE_CALLBACK_FAILURE'])
})
test('dynamic synthetic request secrets are masked before transport without multiline injection', () => {
  const { maskRequestSecrets } = require('./measurement-response-loss.cjs')
  const lines = []
  maskRequestSecrets({ 'x-csrf-token': 'csrf-value', cookie: 'ptool_session=session-value; ptool_csrf=csrf-value; theme=light' }, value => lines.push(value))
  assert.deepEqual(lines, ['::add-mask::csrf-value\n', '::add-mask::session-value\n'])
  const rejected = []
  maskRequestSecrets({ 'x-csrf-token': 'invalid\ncommand' }, value => rejected.push(value))
  assert.deepEqual(rejected, [])
})
test('non-allowlisted origin method path query cannot reach transport', async () => {
  let connections = 0
  const requestImpl = () => { connections++; throw new Error('Unexpected network') }
  const base = request.url()
  for (const changed of [
    { url: () => base.replace('https:', 'http:') },
    { url: () => base.replace('training.eduk12.top', 'external.invalid') },
    { url: () => base.replace(':3189', ':443') },
    { url: () => base.replace('/content-report-selection', '/other-operation') },
    { url: () => base + '?unapproved=1' },
    { method: () => 'GET' },
  ]) await assert.rejects(forwardSelection({ ...request, ...changed }, { requestImpl, ca: Buffer.from('job-ca') }))
  assert.equal(connections, 0)
})
test('upstream redirect is a failure, never followed or called a committed write', async () => {
  let connections = 0
  const requestImpl = (_options, receive) => {
    connections++
    const upstream = new EventEmitter(); upstream.destroy = () => {}
    upstream.end = () => process.nextTick(() => {
      const response = new EventEmitter(); response.statusCode = 302; response.headers = { location: 'https://external.invalid/' }
      receive(response); response.emit('end')
    })
    return upstream
  }
  await assert.rejects(forwardSelection(request, { requestImpl, ca: Buffer.from('job-ca') }), /Isolated upstream transport failed/)
  assert.equal(connections, 1)
})
test('failed browser abort after a real commit remains an explicit failure', async () => {
  const loss = createResponseLoss(async () => ({ committed: true }))
  await assert.doesNotReject(loss.handler({ request: () => request, abort: async () => { throw new Error(marker) } }))
  assert.deepEqual(loss.state.committed, { committed: true })
  assert.equal(loss.state.failure, 'BROWSER_ABORT_FAILED')
  assert.ok(!JSON.stringify(loss.state).includes(marker))
})
