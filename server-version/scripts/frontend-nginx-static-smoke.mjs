#!/usr/bin/env node
// Check the built production server, whose MIME behavior differs from Vite preview.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const image = process.argv[2]
assert(image, 'Pass the built frontend image tag')
const name = `eduk12-static-smoke-${randomUUID().slice(0, 8)}`
const network = `${name}-net`
let containerCreated = false
let networkCreated = false
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60000 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `docker ${args[0]} failed: ${result.stderr}`)
  return result.stdout.trim()
}
try {
  docker(['network', 'create', network]); networkCreated = true
  docker(['run', '-d', '--name', name, '--network', network, '--memory', '128m', '--cpus', '0.25', '-p', '127.0.0.1::80', image]); containerCreated = true
  docker(['exec', name, 'nginx', '-t'])
  const port = docker(['port', name, '80/tcp'])
  assert.match(port, /^127\.0\.0\.1:\d+$/)
  const base = `http://${port}`
  let root
  for (let attempt = 0; attempt < 40; attempt++) {
    try { root = await fetch(base, { signal: AbortSignal.timeout(2000) }); if (root.ok) break } catch {}
    await delay(250)
  }
  assert(root?.ok, 'Production Nginx did not serve the frontend')
  const html = await root.text()
  const csp = root.headers.get('content-security-policy')
  assert(csp?.includes("worker-src 'self' blob:"), 'Keep the reviewed worker policy')
  assert(!/script-src[^;]*'unsafe-eval'/.test(csp), 'Do not weaken the script policy')
  const workers = docker(['exec', name, 'find', '/usr/share/nginx/html/assets', '-maxdepth', '1', '-type', 'f', '-name', '*.mjs']).split('\n').filter(Boolean)
  assert(workers.some(p => /\/pdf\.worker\.[^/]+\.mjs$/.test(p)), 'A real PDF worker must be emitted')
  const paths = [...new Set([
    ...workers.map(p => p.replace('/usr/share/nginx/html', '')),
    ...Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g), m => m[1]),
  ])]
  assert(paths.some(p => p.endsWith('.js')) && paths.some(p => p.endsWith('.css')), 'Check ordinary JS/CSS too')
  for (const path of paths) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200, `${path} must exist`)
    const expected = path.endsWith('.css') ? 'text/css' : 'application/javascript'
    assert.equal(response.headers.get('content-type')?.split(';')[0], expected, `${path} MIME`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path} nosniff`)
    assert.equal(response.headers.get('content-security-policy'), csp, `${path} CSP inheritance`)
    assert((await response.arrayBuffer()).byteLength > 0, `${path} body`)
  }
  for (const path of ['/assets/uiqa-missing-worker.mjs', '/uploads/uiqa-blocked-worker.mjs', '/api/metrics']) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 404, `${path} must stay closed and not become SPA HTML`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path} error nosniff`)
    assert.equal(response.headers.get('content-security-policy'), csp, `${path} error CSP`)
    await response.arrayBuffer()
  }
  console.log(JSON.stringify({ status: 'PASS', image, staticAssetsChecked: paths.length, emittedModuleWorkers: workers.length, cspUnchanged: true, nosniffPreserved: true, missingAndBlockedPathsChecked: 3 }))
} finally {
  if (containerCreated) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 30000 })
  if (networkCreated) spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore', timeout: 30000 })
}
