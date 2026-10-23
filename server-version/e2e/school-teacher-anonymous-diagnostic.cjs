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
async function fonts() {
  context()
  const { prepareFonts } = await import('../../.github/scripts/school-teacher-checks.mjs')
  prepareFonts()
}
async function run() {
  context()
  const repo = path.resolve(__dirname, '../..'), dist = path.join(process.env.RUNNER_TEMP, 'school-anonymous-fixed-dist')
  const out = path.join(repo, 'school-anonymous-evidence'); fs.mkdirSync(out, { recursive: true })
  const report = { schemaVersion: 1, acceptance: false, scope: 'anonymous-static-console-diagnostic', source: process.env.GITHUB_SHA,
    artifact: ARTIFACT, skippedChecks: { axe: 'Four anonymous checks completed in run 39890148285; not repeated or requalified here' }, steps: [], staticCss: [], cssResponses: [], console: [], pageErrors: [], unexpected: [], observations: [], primaryFailure: null, cleanupFailure: null }
  let browser, cdp, phase = 'artifact-verification'
  async function step(label, operation) {
    phase = label + ':before'
    report.steps.push({ phase, consoleCount: report.console.length })
    const result = await operation()
    // Let async console delivery settle without executing another acceptance check.
    await new Promise(resolve => setTimeout(resolve, 100))
    phase = label + ':after'
    report.steps.push({ phase, consoleCount: report.console.length })
    return result
  }
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
      const bytes = fs.readFileSync(file), contentType = mime[path.extname(file)] || 'application/octet-stream'
      if (u.pathname.endsWith('.css') && report.staticCss.length < 100) report.staticCss.push({ phase, path: u.pathname, contentType, sha256: sha(bytes) })
      return route.fulfill({ status: 200, contentType, body: bytes })
    })
    const p = await c.newPage(); p.setDefaultTimeout(15000)
    p.on('console', m => { if (m.type() === 'error' && report.console.length < 100) report.console.push({ phase, type: m.type(), text: clean(m.text()), hash: sha(m.text()), location: location(m.location()) }) })
    p.on('pageerror', e => { if (report.pageErrors.length < 20) report.pageErrors.push({ phase, name: e.name, text: clean(e.message), hash: sha(e.message) }) })
    p.on('response', response => { const u = new URL(response.url()); if (u.origin === origin && u.pathname.endsWith('.css') && report.cssResponses.length < 100) report.cssResponses.push({ phase, path: u.pathname, status: response.status(), contentType: response.headers()['content-type'] || '' }) })
    // Initialize the actual font-inspection domains before loading any stylesheet.
    // Reuse this session for real rendered-font queries; never hide console errors.
    cdp = await step('pre-navigation:cdp-session', () => c.newCDPSession(p))
    await step('pre-navigation:DOM-enable', () => cdp.send('DOM.enable'))
    await step('pre-navigation:CSS-enable', () => cdp.send('CSS.enable'))
    for (const pathname of ['/', '/login']) {
      phase = 'navigate:' + pathname; await p.goto(origin + pathname); await p.waitForLoadState('networkidle')
      if (pathname === '/') await p.locator('.hs-campus-art').waitFor()
      else await p.getByLabel('用户名', { exact: true }).waitFor()
      for (const width of [320, 390]) {
        phase = `layout:${pathname}:${width}`; await p.setViewportSize({ width, height: 844 })
        await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(x => x.decode())) })
        assert.equal(await p.locator('input').evaluateAll(xs => xs.some(x => x.value)), false, 'Diagnostic stays anonymous with zero entered values')
        const prefix = `observe:${pathname}:${width}`, observation = { path: pathname, width }
        observation.layout = await step(prefix + ':layout', () => p.evaluate(() => {
      const forbidden = document.querySelectorAll('.ht-secret,.hs-secret,.ht-mfa-setup').length
      const filledPasswords = [...document.querySelectorAll('input[type="password"]')].some(el => el.value.length > 0)
      const clipped = [...document.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(el => {
        const r = el.getBoundingClientRect(), css = getComputedStyle(el)
        if (!r.width || !r.height || css.visibility === 'hidden' || (r.left >= -1 && r.right <= innerWidth + 1)) return false
        // A deliberate, bounded inner scroll area (e.g. a matrix) is not page overflow.
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const p = parent.getBoundingClientRect(), style = getComputedStyle(parent)
          if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth && p.left >= -1 && p.right <= innerWidth + 1) return false
        }
        return true
      }).map(el => ({ tag: el.tagName, role: el.getAttribute('role') }))
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, secretNodes: forbidden, filledPasswords, clipped }

        }))
        assert.equal(observation.layout.secretNodes, 0); assert.equal(observation.layout.filledPasswords, false)
        observation.brand = await step(prefix + ':brand-bbox-style', async () => {
          const logo = p.getByRole('img', { name: 'School @eduk12.top', exact: true }), use = logo.locator('use')
          await use.waitFor({ state: 'attached' })
          await p.waitForFunction(() => {
            const use = [...document.querySelectorAll('.hs-app svg use')].find(el => el.closest('svg')?.getAttribute('aria-label') === 'School @eduk12.top')
            try { const b = use?.getBBox(); return Boolean(b && b.width > 0 && b.height > 0) } catch { return false }
          })
          const href = await use.getAttribute('href'), url = new URL(href, origin)
          assert.equal(url.origin, origin); assert.equal(url.hash, '#school-wordmark')
          return use.evaluate(el => { const b = el.getBBox(), css = getComputedStyle(el.closest('svg')); return { width: b.width, height: b.height, color: css.color, visible: css.visibility !== 'hidden' && css.display !== 'none' } })
        })
        if (pathname === '/login' && width === 320) {
            const { root } = await step(prefix + ':DOM-document', () => cdp.send('DOM.getDocument'))
            observation.fonts = []
            for (const [sampleId, selector] of [['school-serif', '.hs-main-auth h1'], ['school-sans', '.hs-main-auth .hs-field > span']]) {
              assert.equal(await p.locator(selector).first().isVisible(), true)
              assert.equal(await p.locator(selector).first().textContent(), chrome.CJK_SAMPLES[sampleId].text)
              const { nodeId } = await step(prefix + ':' + sampleId + ':DOM-query', () => cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }))
              const response = await step(prefix + ':' + sampleId + ':CSS-platform-fonts', () => cdp.send('CSS.getPlatformFontsForNode', { nodeId }))
              observation.fonts.push({ sampleId, fonts: response.fonts.map(({ postScriptName, isCustomFont, glyphCount }) => ({ postScriptName, isCustomFont, glyphCount })) })
            }
        }
        await step(prefix + ':Tab', () => p.keyboard.press('Tab'))
        observation.keyboard = await step(prefix + ':focus-ring', () => p.evaluate(() => { const el = document.activeElement, css = getComputedStyle(el), r = el.getBoundingClientRect(); return {
          visible: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1,
          focusVisible: el.matches(':focus-visible'), ring: (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0) || css.boxShadow !== 'none' } }))
        if (pathname === '/' && width === 320) {
          assert.equal(await p.locator('input').evaluateAll(xs => xs.some(x => x.value)), false)
          await step(prefix + ':screenshot', () => p.screenshot({ path: path.join(out, 'anonymous-home-light-320.png'), fullPage: true }))
        }
        report.observations.push(observation)
      }
      if (pathname === '/') report.hero = await step('home:hero-candidates', () => p.locator('.hs-campus-art').evaluate(el => ({ currentSrc: el.currentSrc, candidates: [el.src, ...el.srcset.split(',').filter(Boolean).map(part => new URL(part.trim().split(/\s+/)[0], location.href).href)] })))
      else report.background = await step('login:background-style', () => p.locator('.hs-main-auth').evaluate(el => {
        const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(el, '::before').backgroundImage)
        return match ? new URL(match[1], location.href).href : ''
      }))
    }
    phase = 'finished'; report.status = 'DIAGNOSED'
  } catch (e) { report.status = 'FAILED'; report.primaryFailure = { phase, name: e.name, text: clean(String(e)), hash: sha(String(e)) } }
  finally {
    try { if (cdp) await cdp.detach() } catch (e) { report.cleanupFailure = { stage: 'cdp-detach', name: e.name, hash: sha(String(e)) } }
    try { if (browser) await browser.close() } catch (e) { report.cleanupFailure = { stage: 'browser-close', name: e.name, hash: sha(String(e)), prior: report.cleanupFailure } }
    fs.writeFileSync(path.join(out, 'anonymous-console.json'), JSON.stringify(report, null, 2))
  }
  // Diagnostics can collect errors, but must never report acceptance or make an unknown error successful.
  if (report.status !== 'DIAGNOSED' || report.cleanupFailure || report.pageErrors.length || report.unexpected.length || report.console.some(x => !/^Failed to load resource:/.test(x.text) || x.location.path !== '/api/campus/auth/me')) process.exitCode = 1
}
if (require.main === module) { const command = process.argv[2]; Promise.resolve().then(() => { assert.ok(['restore', 'fonts', 'run'].includes(command)); return command === 'restore' ? restore() : command === 'fonts' ? fonts() : run() }).catch(e => { console.error('Anonymous diagnostic stopped: ' + sha(String(e))); process.exitCode = 1 }) }
module.exports = { BRANCH, ARTIFACT, allowed, clean, location }
