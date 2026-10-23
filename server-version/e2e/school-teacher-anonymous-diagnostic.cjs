'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { createHash } = require('node:crypto'), { execFileSync } = require('node:child_process')
const BRANCH = 'ci/school-teacher-console-20261023', REPO = 'caohuibj/eduK12-new-version'
const ARTIFACT = { id: 12466106464, run: 39870012962, sha: 'bdfeec8e3b06220e5a611d607caa167badcdf6c9dd35827ea2c379fd6b352b35', size: 21207434 }
const sha = x => createHash('sha256').update(x).digest('hex')
function allowed(env, event) {
  return env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.GITHUB_JOB === 'launch-diagnostic' && env.GITHUB_REPOSITORY === REPO &&
    env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/' + BRANCH && event?.deleted === false &&
    event?.repository?.full_name === REPO && event?.after === env.GITHUB_SHA && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')
}
function clean(text) {
  return String(text).slice(0, 4096).replace(/https?:\/\/[^\s"'<>]+/g, raw => {
    try { const u = new URL(raw); return u.origin + u.pathname } catch { return '[URL]' }
  }).replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[AUTH]')
    .replace(/\b(?:token|password|secret|authorization|cookie|credential|csrf)[\w-]*\s*[:=]\s*[^\s,;]+/gi, '[CREDENTIAL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\b[A-Za-z0-9_+=/-]{48,}\b/g, '[LONG_VALUE]').slice(0, 1024)
}
function location(loc) {
  let pathname = ''
  try { const u = new URL(loc.url); pathname = u.origin === 'https://school.eduk12.top' ? u.pathname : '[NONLOCAL]' } catch {}
  return { path: pathname, line: Number.isSafeInteger(loc.lineNumber) ? loc.lineNumber : -1, column: Number.isSafeInteger(loc.columnNumber) ? loc.columnNumber : -1 }
}
function context() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  assert.ok(allowed(process.env, event), 'Exact anonymous diagnostic push only')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), process.env.GITHUB_SHA)
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'server-version/e2e', '.github'], { encoding: 'utf8' }).trim(), '')
}
async function verifyDist(dir) {
  const { treeDigest, verifyManifest } = await import('../../.github/scripts/ci-artifact.mjs')
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'ci-build-manifest.json'), 'utf8'))
  verifyManifest(manifest, { schemaVersion: 1, sha: 'dadcef2d497ed51f4d75458c12b46bbb2fc6d82b', runId: '39870012962', kind: 'frontend',
    lockDigest: 'ee290a304e22c10e760cc55eb55bb6815cb34fb57773c0af77985450306916fe',
    contentDigest: 'e1883adff3ece61c1c95a415986ddfbe27676c0f3acbaabb51947094bf5ea6f7' }, treeDigest(dir))
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD:server-version/frontend'], { encoding: 'utf8' }).trim(), 'c1e34b8fdd1a0127a155a208187a8c6bb2f8760f')
  assert.equal(sha(fs.readFileSync('server-version/frontend/package-lock.json')), manifest.lockDigest)
}
async function restore() {
  context()
  const meta = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/actions/artifacts/${ARTIFACT.id}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 }))
  assert.equal(meta.id, ARTIFACT.id); assert.equal(meta.expired, false); assert.equal(meta.size_in_bytes, ARTIFACT.size)
  assert.equal(meta.workflow_run.id, ARTIFACT.run); assert.equal(meta.digest, 'sha256:' + ARTIFACT.sha)
  const bytes = execFileSync('gh', ['api', `repos/${REPO}/actions/artifacts/${ARTIFACT.id}/zip`], { maxBuffer: 32 * 1024 * 1024 })
  assert.equal(bytes.length, ARTIFACT.size); assert.equal(sha(bytes), ARTIFACT.sha)
  const dir = path.join(process.env.RUNNER_TEMP, 'school-anonymous-fixed-dist'); assert.equal(fs.existsSync(dir), false)
  fs.mkdirSync(dir, { mode: 0o700 }); const zip = dir + '.zip'; fs.writeFileSync(zip, bytes, { mode: 0o600, flag: 'wx' })
  execFileSync('python3', ['-c', `import zipfile,sys,pathlib,stat
with zipfile.ZipFile(sys.argv[1]) as z:
 names=set();total=0
 for x in z.infolist():
  p=pathlib.PurePosixPath(x.filename);total+=x.file_size
  assert not p.is_absolute() and '..' not in p.parts and x.filename not in names and not stat.S_ISLNK(x.external_attr>>16)
  assert total<64*1024*1024 and x.file_size<32*1024*1024
  names.add(x.filename)
 z.extractall(sys.argv[2])`, zip, dir])
  assert.ok(fs.existsSync(path.join(dir, 'assets/SchoolApp-Cpx47Nof.js')))
  await verifyDist(dir)
}
async function run() {
  context()
  const repo = path.resolve(__dirname, '../..'), dist = path.join(process.env.RUNNER_TEMP, 'school-anonymous-fixed-dist')
  const out = path.join(repo, 'school-anonymous-evidence'); fs.mkdirSync(out, { recursive: true })
  const report = { schemaVersion: 1, acceptance: false, scope: 'anonymous-static-console-diagnostic', source: process.env.GITHUB_SHA,
    artifact: ARTIFACT, console: [], pageErrors: [], unexpected: [], observations: [], primaryFailure: null, cleanupFailure: null }
  let browser, phase = 'artifact-verification'
  try {
    await verifyDist(dist); phase = 'preflight'
    const chrome = require('./school-teacher-chrome.cjs'); report.preflight = chrome.preflightChrome({ repo, diagnostics: true })
    assert.equal(report.preflight.ok, true)
    const { chromium } = require(path.join(repo, '.github/release-tools/node_modules/playwright-core'))
    phase = 'launch'; browser = await chromium.launch(chrome.CHROME_LAUNCH_OPTIONS)
    assert.equal(browser.version(), report.preflight.package.browserVersion)
    phase = 'sandbox'; report.sandbox = await chrome.verifyChromeSandbox(browser); assert.equal(report.sandbox.ok, true)
    const c = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    await c.addInitScript(() => localStorage.setItem('school:appearance:v1:guest', 'light'))
    await c.routeWebSocket('**/*', ws => { report.unexpected.push({ type: 'websocket' }); ws.close() })
    const origin = 'https://school.eduk12.top'
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' }
    await c.route('**/*', async route => {
      const r = route.request(), u = new URL(r.url())
      if (u.origin !== origin || !['GET', 'HEAD'].includes(r.method())) { report.unexpected.push({ type: 'blocked-request', location: location({ url: r.url() }) }); return route.abort() }
      if (u.pathname === '/api/campus/auth/me') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 401, message: 'Unauthorized' }) })
      if (u.pathname.startsWith('/api/')) { report.unexpected.push({ type: 'blocked-api', location: location({ url: r.url() }) }); return route.abort() }
      const decoded = decodeURIComponent(u.pathname); assert.ok(!decoded.includes('\\') && !decoded.includes('\0'))
      let file = path.resolve(dist, '.' + decoded); assert.ok(file === dist || file.startsWith(dist + path.sep))
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (path.extname(decoded)) return route.fulfill({ status: 404, body: 'Not found' })
        file = path.join(dist, 'index.html')
      }
      assert.ok(fs.realpathSync(file).startsWith(dist + path.sep))
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) })
    })
    const p = await c.newPage(); p.setDefaultTimeout(15000)
    p.on('console', m => { if (m.type() === 'error' && report.console.length < 100) report.console.push({ phase, type: m.type(), text: clean(m.text()), hash: sha(m.text()), location: location(m.location()) }) })
    p.on('pageerror', e => { if (report.pageErrors.length < 20) report.pageErrors.push({ phase, name: e.name, text: clean(e.message), hash: sha(e.message) }) })
    for (const pathname of ['/', '/login']) {
      phase = 'navigate:' + pathname; await p.goto(origin + pathname); await p.waitForLoadState('networkidle')
      for (const width of [320, 390]) {
        phase = `layout:${pathname}:${width}`; await p.setViewportSize({ width, height: 844 })
        await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(x => x.decode())) })
        assert.equal(await p.locator('input').evaluateAll(xs => xs.some(x => x.value)), false, 'Diagnostic stays anonymous with zero entered values')
        phase = `axe:${pathname}:${width}`
        if (!await p.evaluate(() => Boolean(window.axe))) await p.addScriptTag({ path: path.join(repo, '.github/release-tools/node_modules/axe-core/axe.min.js') })
        const result = await p.evaluate(async () => { const a = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }); return { violations: a.violations.map(x => x.id), incomplete: a.incomplete.map(x => x.id) } })
        report.observations.push({ phase, ...result })
      }
    }
    phase = 'finished'; report.status = 'DIAGNOSED'
  } catch (e) { report.status = 'FAILED'; report.primaryFailure = { phase, name: e.name, text: clean(String(e)), hash: sha(String(e)) } }
  finally {
    try { if (browser) await browser.close() } catch (e) { report.cleanupFailure = { name: e.name, hash: sha(String(e)) } }
    fs.writeFileSync(path.join(out, 'anonymous-console.json'), JSON.stringify(report, null, 2))
  }
  // Diagnostics can collect errors, but must never report acceptance or make an unknown error successful.
  if (report.status !== 'DIAGNOSED' || report.cleanupFailure || report.pageErrors.length || report.unexpected.length || report.console.some(x => !/^Failed to load resource:/.test(x.text) || x.location.path !== '/api/campus/auth/me')) process.exitCode = 1
}
if (require.main === module) { const command = process.argv[2]; Promise.resolve().then(() => { assert.ok(['restore', 'run'].includes(command)); return command === 'restore' ? restore() : run() }).catch(e => { console.error('Anonymous diagnostic stopped: ' + sha(String(e))); process.exitCode = 1 }) }
module.exports = { BRANCH, ARTIFACT, allowed, clean, location }
