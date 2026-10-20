'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const https = require('node:https')

function maskRequestSecrets(headers, write = value => process.stdout.write(value)) {
  const values = [headers['x-csrf-token']]
  for (const cookie of String(headers.cookie || '').split(';')) {
    const split = cookie.indexOf('=')
    if (split >= 0 && /(?:session|csrf)/i.test(cookie.slice(0, split))) values.push(cookie.slice(split + 1).trim())
  }
  for (const value of new Set(values.filter(value => typeof value === 'string' && value.length && value.length < 8192 && !/[\r\n]/.test(value)))) {
    write('::add-mask::' + value + '\n')
  }
}

// Only this synthetic fault-injection POST is forwarded outside Chromium.
// route.fetch uses Node transport, which does not inherit Chromium's DNS rules
// or profile-only NSS trust. Keep the real HTTPS ingress, canonical SNI/Host,
// normal certificate verification and this job's explicit CA, but connect only
// to loopback. No redirects, certificate bypass, external DNS or DTO mocks.
async function forwardSelection(request, { requestImpl = https.request, ca = fs.readFileSync(process.env.MEASUREMENT_BROWSER_TLS_CA) } = {}) {
  const url = new URL(request.url())
  assert.equal(url.origin, 'https://training.eduk12.top:3189')
  assert.match(url.pathname, /^\/api\/questionnaire-products\/[a-f0-9-]{36}\/content-report-selection$/)
  assert.equal(url.search, '')
  assert.equal(request.method(), 'POST')
  const headers = await request.allHeaders()
  if(process.env.GITHUB_ACTIONS === 'true')maskRequestSecrets(headers)
  // Node's raw HTTPS client does not decode browser gzip/br representations.
  // Identity changes only response encoding, never the UI's write body or auth.
  const body = request.postDataBuffer()
  return new Promise((resolve, reject) => {
    let settled = false, timer
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (error) reject(new Error('Isolated upstream transport failed'))
      else resolve(value)
    }
    let upstream
    try {
      upstream = requestImpl({ hostname: '127.0.0.1', port: 3189, servername: 'training.eduk12.top',
        method: 'POST', path: url.pathname, headers: { ...headers, host: url.host, 'accept-encoding': 'identity' },
        ca, rejectUnauthorized: true }, response => {
        const chunks = []; let bytes = 0
        response.on('error', () => finish(true))
        response.on('aborted', () => finish(true))
        response.on('data', chunk => {
          bytes += chunk.length
          if (bytes > 1024 * 1024) { finish(true); response.destroy(); return }
          chunks.push(chunk)
        })
        response.on('end', () => {
          try {
            if (response.statusCode !== 200) { finish(true); return }
            const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (envelope.code !== 0 || !envelope.data) { finish(true); return }
            finish(false, envelope.data)
          } catch { finish(true) }
        })
      })
      upstream.on('error', () => finish(true))
      timer = setTimeout(() => { finish(true); upstream.destroy() }, 20000)
      upstream.end(body)
    } catch { finish(true) }
  })
}

// A Playwright route callback must NEVER leak a rejected Promise: raw errors
// can contain Cookie and CSRF headers. Communicate only a fixed failure code
// to the awaited main flow, and always attempt to unblock the real browser.
function createResponseLoss(forward = forwardSelection) {
  const state = { requests: 0, committed: null, failure: null, settled: false }
  let resolve
  const settled = new Promise(done => { resolve = done })
  const handler = async route => {
    try {
      if (route.request().method() !== 'POST') throw new Error('Unexpected method')
      state.requests++
      state.committed = await forward(route.request())
      if (!state.committed) state.failure = 'UPSTREAM_NOT_COMMITTED'
    } catch { state.failure = 'UPSTREAM_NOT_CONFIRMED' }
    finally {
      try { await route.abort('failed') }
      catch { state.failure ||= 'BROWSER_ABORT_FAILED' }
      state.settled = true
      resolve()
    }
  }
  return { state, handler, settled }
}
function guardRouteCallback(handler, recordFailure) {
  return async route => {
    try { await handler(route) }
    catch {
      try { recordFailure() } catch { /* Never emit raw callback errors. */ }
      try { await route.abort('failed') } catch { /* Main flow records failure. */ }
    }
  }
}
module.exports = { forwardSelection, createResponseLoss, guardRouteCallback, maskRequestSecrets }
