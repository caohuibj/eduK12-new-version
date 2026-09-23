/** Disposable loopback fault injector: drop the first successful FINAL reply after upstream commit. */
import http from 'node:http'

if (process.env.NODE_ENV !== 'test' || process.env.PERF_ISOLATED_TEST_MODE !== '1') {
  throw new Error('lost-response proxy requires isolated test mode')
}
const upstream = new URL(process.env.PERF_UPSTREAM_URL || '')
if (!['127.0.0.1', 'localhost', '::1'].includes(upstream.hostname)
  || upstream.username || upstream.password || upstream.search || upstream.hash) {
  throw new Error('upstream must be credential-free loopback URL')
}
const port = Number(process.env.PERF_PROXY_PORT || 53003)
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('invalid proxy port')
let dropped = false

const server = http.createServer(async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const headers = { ...request.headers }
    delete headers.host
    delete headers.connection
    const target = new URL(request.url || '/', upstream)
    const upstreamResponse = await fetch(target, {
      method: request.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    })
    const bytes = Buffer.from(await upstreamResponse.arrayBuffer())
    if (!dropped && request.method === 'POST' && /\/submit$/.test(target.pathname)
      && upstreamResponse.status >= 200 && upstreamResponse.status < 300) {
      dropped = true
      console.log(JSON.stringify({ event: 'committed_response_dropped', status: upstreamResponse.status }))
      response.destroy()
      return
    }
    const outgoing = Object.fromEntries(upstreamResponse.headers)
    delete outgoing.connection
    delete outgoing['transfer-encoding']
    response.writeHead(upstreamResponse.status, outgoing)
    response.end(bytes)
  } catch (error) {
    if (!response.headersSent) response.writeHead(502)
    response.end()
    console.error(error instanceof Error ? error.message : String(error))
  }
})
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'proxy_ready', port, upstream: upstream.origin }))
})
