/** Test-only loopback TLS/static/API transport. No API mocks or TLS bypass. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.MEASUREMENT_BROWSER_ISOLATED, '1')
assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED, 'true')
const hosts = new Set(['training.eduk12.top', 'survey.eduk12.top'])
const root = path.resolve(__dirname, '../frontend/dist')
assert(fs.statSync(path.join(root, 'index.html')).isFile())
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const server = https.createServer({ key: fs.readFileSync(process.env.MEASUREMENT_BROWSER_TLS_KEY), cert: fs.readFileSync(process.env.MEASUREMENT_BROWSER_TLS_CERT) }, (request, response) => {
  let url
  try { url = new URL(request.url, 'https://' + request.headers.host) } catch { response.writeHead(400).end(); return }
  if (!hosts.has(url.hostname) || url.port !== '3189') { response.writeHead(403).end(); return }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    const headers = { ...request.headers, host: url.hostname, 'x-forwarded-host': url.hostname, 'x-forwarded-proto': 'https' }
    if (headers.origin) {
      try {
        const origin = new URL(headers.origin)
        if (origin.protocol !== 'https:' || !hosts.has(origin.hostname) || origin.port !== '3189') { response.writeHead(403).end(); return }
        headers.origin = origin.origin.replace(':3189', '')
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
server.listen(3189, '127.0.0.1', () => console.log('Isolated compiled product proxy ready'))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
