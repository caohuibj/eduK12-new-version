/** Governance-only canonical loopback HTTPS for real WebAuthn origin checks. No mocks or TLS bypass. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')
let phase = 'proxy-preflight'
process.on('uncaughtException', error => {
  const name = /^[A-Za-z][A-Za-z0-9]{0,70}Error$|^Error$/.test(error?.name || '') ? error.name : 'UnknownError'
  const code = /^(?:ERR_[A-Z_]{1,70}|E[A-Z]{2,30})$/.test(error?.code || '') ? error.code : 'UNCLASSIFIED'
  const frames = String(error?.stack || '').split('\n').slice(1).flatMap(line => {
    const m = line.match(/\/([A-Za-z0-9_.-]+\.(?:[cm]?js|ts)):(\d+):(\d+)\)?$/)
    return m ? [{file:m[1],line:Number(m[2]),column:Number(m[3])}] : []
  }).slice(0,6)
  console.error('GOVERNANCE_PROCESS_DIAGNOSTIC ' + JSON.stringify({phase,errorName:name,errorCode:code,frames,port:443,privateDetailsWithheld:true}))
  process.exit(1)
})
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.MEASUREMENT_BROWSER_ISOLATED, '1')
assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED, 'true')
assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
assert.match(process.env.GITHUB_RUN_ID || '', /^[0-9]+$/)
const hosts = new Set(['training.eduk12.top', 'survey.eduk12.top'])
phase = 'compiled-frontend-read'
const root = path.resolve(__dirname, '../frontend/dist')
assert(fs.statSync(path.join(root, 'index.html')).isFile())
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
phase = 'tls-input-decode'
function privatePem(name) {
  const encoded = process.env[name]; delete process.env[name]
  assert(typeof encoded === 'string' && encoded.length > 0 && encoded.length < 65536 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'Private TLS input required')
  return Buffer.from(encoded, 'base64')
}
const key = privatePem('GOVERNANCE_PROXY_TLS_KEY_BASE64')
const cert = privatePem('GOVERNANCE_PROXY_TLS_CERT_BASE64')
phase = 'tls-server-create'
const server = https.createServer({ key, cert }, (request, response) => {
  let url
  try { url = new URL(request.url, 'https://' + request.headers.host) } catch { response.writeHead(400).end(); return }
  if (!hosts.has(url.hostname) || url.port !== '') { response.writeHead(403).end(); return }
  if (url.pathname === '/__governance_ci_identity' && request.method === 'GET') {
    response.writeHead(200, {'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({isolated:true,sourceCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID})); return
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    const headers = { ...request.headers, host: url.hostname, 'x-forwarded-host': url.hostname, 'x-forwarded-proto': 'https' }
    if (headers.origin) {
      try {
        const origin = new URL(headers.origin)
        if (origin.protocol !== 'https:' || !hosts.has(origin.hostname) || origin.port !== '') { response.writeHead(403).end(); return }
        headers.origin = origin.origin
      } catch { response.writeHead(403).end(); return }
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 3000, path: url.pathname + url.search, method: request.method, headers }, result => {
      response.writeHead(result.statusCode, result.headers)
      result.pipe(response)
    })
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end() })
    request.pipe(upstream)
    return
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return }
  let requested
  try { requested = path.resolve(root, '.' + decodeURIComponent(url.pathname)) } catch { response.writeHead(400).end(); return }
  if (requested !== root && !requested.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(root, 'index.html')
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response)
})
phase = 'canonical-loopback-listen'
server.listen(443, '127.0.0.1', () => console.log('Isolated compiled product proxy ready'))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
