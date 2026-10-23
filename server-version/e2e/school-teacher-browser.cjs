/* Minimum real-browser School/Teacher acceptance, prepared for isolated Actions.
 * Run AFTER school-teacher-fixture.cjs seed, migrations and ONE current-source
 * production build per component. This script performs no build or installation.
 *
 * Browser documents/static assets are explicitly synthetic route responses from
 * SCHOOL_TEACHER_FRONTEND_DIST (default ../frontend/dist). Every /api response
 * comes from the real production-mode backend with the official restricted DB
 * principal. API bodies/authorization are NEVER mocked. route.fetch/fulfill's
 * native APIResponse preserves individual Set-Cookie headers, CSRF and Origin.
 * There is no TLS listener, CA change, ignoreHTTPSErrors or security-warning
 * bypass. This is NOT acceptance of public DNS, TLS, reverse proxy or deployment.
 *
 * Required besides fixture env: REDIS_URL=redis://127.0.0.1:<port>/0 and
 * SCHOOL_TEACHER_ARTIFACTS_VERIFIED=1 only after ci-artifact.mjs verify succeeds
 * for same-run components or their fixed qualified official build receipts. Original producer manifest identities are preserved.
 * Optional: SCHOOL_TEACHER_BACKEND_PORT=3187,
 * SCHOOL_TEACHER_EVIDENCE_DIR=<repo>/school-teacher-evidence,
 * SCHOOL_TEACHER_FRONTEND_DIST=<downloaded production artifact directory>.
 * Upload ONLY the evidence directory, never SCHOOL_TEACHER_PRIVATE_DIR.
 * No auth screenshots/traces/HAR/storageState or request bodies are emitted.
 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { randomUUID, createHmac } = require('node:crypto')
const { readFixture, sourceIdentity, backend, repo, sha } = require('./school-teacher-fixture.cjs')
const { prepareRenderedCjk, createUiChecks, verifyReport, validateOfficialFrontendReceipt, validateOfficialBackendReceipt, computeBackendCompileDigest } = require('./school-teacher-ui.cjs')
const { preflightChrome, verifyChromeSandbox, inspectCjkFonts, CHROME_LAUNCH_OPTIONS } = require('./school-teacher-chrome.cjs')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const origins = { SCHOOL: 'https://school.eduk12.top', TEACHER: 'https://teacher.eduk12.top' }
const prefixes = { SCHOOL: '/api/campus', TEACHER: '/api/huiteacher' }
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
const reusedBuildSource = { head: 'a541e986c85310b655f290df4a8090de75fb4c6e', run: '39795298845' }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }

function backendEnvironment(fixture, root, port, redisUrl, product, host = process.env) {
  assert.ok(Object.hasOwn(origins, product), 'Use one reviewed product origin per backend process')
  // Keep the production single-origin contract. Never concatenate origins or
  // relax product Origin/CSRF checks for a synthetic browser transport.
  return { PATH: host.PATH, HOME: host.HOME, TZ: 'UTC', NODE_ENV: 'production', PORT: String(port),
    DATABASE_URL: fixture.runtimeUrl, REDIS_URL: redisUrl, CORS_ORIGIN: origins[product],
    COOKIE_SECURE: 'true', TRUST_PROXY_HOPS: '1', ...fixture.secrets, UPLOAD_DIR: path.join(root, 'uploads'),
    ASSET_MIGRATION_COMPLETE: 'true', BACKGROUND_WORKERS_ENABLED: 'false', HUITEACHER_WORKSPACE_ENABLED: 'true', SOCKET_REDIS_REQUIRED: 'false' }
}

function validateBuildReuse(receipt, identity, runId) {
  assert.equal(receipt.status, 'VERIFIED_OFFICIAL_BUILDS')
  assert.equal(receipt.currentHead, identity.head); assert.equal(receipt.currentRun, runId)
  assert.equal(receipt.sourceHead, reusedBuildSource.head); assert.equal(receipt.sourceRun, reusedBuildSource.run)
  assert.ok(receipt.components?.frontend && receipt.components?.backend)
  return receipt
}

function validateBuildManifest(data, kind, identity, runId, reuse) {
  assert.equal(data.schemaVersion, 1); assert.equal(data.kind, kind)
  assert.equal(data.sha, reuse ? reuse.sourceHead : identity.head)
  assert.equal(data.runId, reuse ? reuse.sourceRun : runId)
  assert.match(data.contentDigest, /^[a-f0-9]{64}$/); assert.match(data.lockDigest, /^[a-f0-9]{64}$/)
  if (reuse) assert.deepEqual(data, reuse.components[kind], 'Verified producer manifest must remain byte-for-byte represented')
  return data
}

function classifyStartupLog(text) {
  // Exact allowlisted markers only. Never return captured text, stack paths,
  // connection strings, environment values, credentials, or request bodies.
  const markers = [
    ['CONFIG_CORS_ORIGIN_INVALID', 'CORS_ORIGIN must be one exact HTTP(S) origin'],
    ['CONFIG_COOKIE_SECURE_REQUIRED', 'COOKIE_SECURE=true is required for HTTPS production'],
    ['CONFIG_TRUST_PROXY_REQUIRED', 'TRUST_PROXY_HOPS must match the production single ingress'],
    ['CONFIG_ASSET_MIGRATION_REQUIRED', 'ASSET_MIGRATION_COMPLETE=true is required before starting production'],
    ['REDIS_INITIALIZATION_FAILED', 'CacheService Redis 初始化失败'],
    ['MODULE_NOT_FOUND', "code: 'MODULE_NOT_FOUND'"],
    ['NATIVE_MODULE_LOAD_FAILED', "code: 'ERR_DLOPEN_FAILED'"],
    ['PORT_IN_USE', 'EADDRINUSE'],
  ]
  return markers.filter(([, marker]) => text.includes(marker)).map(([code]) => code)
}

function classifyBrowserLaunchError(error) {
  const text = String(error)
  const patterns = {
    sandboxUnavailable: /No usable sandbox/i.test(text),
    namespaceDenied: /(?:Failed to move to new namespace|Failed to (?:unshare|create)[^\n]*namespace)[^\n]*(?:Operation not permitted|Permission denied)/i.test(text),
    appArmorDenied: /apparmor\s*=\s*["']?DENIED\b|AppArmor (?:denied|denial)\b/i.test(text),
    executableMissing: /Executable doesn't exist at|spawn [^\n]* ENOENT/.test(text),
    sharedLibraryMissing: /error while loading shared libraries|cannot open shared object file/i.test(text),
    hostDependenciesMissing: /Host system is missing dependencies to run browsers/i.test(text),
    rootSandboxUnsupported: /Running as root without --no-sandbox is not supported/i.test(text),
    processClosed: /Target page, context or browser has been closed|Browser closed/i.test(text),
    launchTimeout: /Timeout [0-9]+ms exceeded/i.test(text),
  }
  const codeFor = { sandboxUnavailable: 'SANDBOX_UNAVAILABLE', namespaceDenied: 'NAMESPACE_DENIED', appArmorDenied: 'APPARMOR_DENIAL_MARKER',
    executableMissing: 'EXECUTABLE_MISSING', sharedLibraryMissing: 'SHARED_LIBRARY_MISSING', hostDependenciesMissing: 'HOST_DEPENDENCIES_MISSING',
    rootSandboxUnsupported: 'ROOT_SANDBOX_UNSUPPORTED', processClosed: 'PROCESS_CLOSED', launchTimeout: 'LAUNCH_TIMEOUT' }
  const codes = Object.entries(patterns).filter(([, matched]) => matched).map(([key]) => codeFor[key])
  const allowedErrnos = ['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EMFILE']
  const errno = allowedErrnos.includes(error?.code) ? error.code : /\b(?:spawn|errno|code)\b[^\n]*?\b(ENOENT|EACCES|EPERM|ENOMEM|EMFILE)\b/.exec(text)?.[1]
  if (errno) codes.push('SPAWN_' + errno)
  const exit = /process did exit: exitCode=(-?\d+)\b/.exec(text)?.[1]
  const exitCode = exit !== undefined && Number.isSafeInteger(Number(exit)) ? Number(exit) : null
  const signal = /process did exit:[^\n]*?signal=(SIGABRT|SIGSEGV|SIGTRAP|SIGKILL|SIGTERM|SIGILL|SIGBUS)\b/.exec(text)?.[1] || null
  return { codes: codes.length ? codes : ['UNKNOWN_LAUNCH_FAILURE'], patterns, spawnErrno: errno || null, exitCode, signal, errorHash: sha(text) }
}

function browserLaunchEnvironment(read = file => fs.readFileSync(file, 'utf8'), facts = process) {
  const optional = file => { try { return read(file).trim() } catch { return null } }
  const integer = file => { const text = optional(file); return text !== null && /^\d{1,15}$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null }
  const release = optional('/etc/os-release') || ''
  const osField = name => {
    const value = release.split('\n').find(line => line.startsWith(name + '='))?.slice(name.length + 1).replace(/^"|"$/g, '')
    return name === 'ID' ? (['ubuntu', 'debian'].includes(value) ? value : null)
      : value && /^\d+(?:\.\d+){0,2}$/.test(value) ? value : null
  }
  const appArmor = optional('/sys/module/apparmor/parameters/enabled')
  const uid = typeof facts.geteuid === 'function' ? facts.geteuid() : null
  return { platform: ['linux', 'darwin', 'win32'].includes(facts.platform) ? facts.platform : 'other',
    architecture: ['x64', 'arm64'].includes(facts.arch) ? facts.arch : 'other', nodeVersion: /^v\d+\.\d+\.\d+$/.test(facts.version) ? facts.version : null,
    effectiveUid: Number.isSafeInteger(uid) && uid >= 0 ? uid : null,
    osId: osField('ID'), osVersion: osField('VERSION_ID'),
    appArmorEnabled: appArmor === 'Y' ? true : appArmor === 'N' ? false : null,
    restrictUnprivilegedUserNamespaces: integer('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),
    unprivilegedUserNamespacesEnabled: integer('/proc/sys/kernel/unprivileged_userns_clone'),
    maxUserNamespaces: integer('/proc/sys/user/max_user_namespaces') }
}

function validateLaunchDiagnosticContext(env, event) {
  for (const key of ['CI', 'GITHUB_ACTIONS']) assert.equal(env[key], 'true')
  assert.equal(env.GITHUB_REPOSITORY, 'caohuibj/eduK12-new-version')
  assert.equal(env.GITHUB_REF, 'refs/heads/ci/school-teacher-browser-20261022')
  assert.equal(env.GITHUB_EVENT_NAME, 'push')
  assert.equal(event.deleted, false)
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/)
}

async function runLaunchDiagnostic() {
  // Deliberately before, and independent of, readFixture/build restore/DB seed.
  // This mode cannot establish any School/Teacher product acceptance result.
  validateLaunchDiagnosticContext(process.env, JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')))
  const source = sourceIdentity(), out = path.join(repo, 'school-teacher-evidence')
  fs.mkdirSync(out, { recursive: true })
  const report = { schemaVersion: 1, scope: 'browser-launch-only', acceptance: false, source, runId: process.env.GITHUB_RUN_ID,
    status: 'RUNNING', stage: 'playwright-load', flags: { headless: true, chromiumSandbox: true },
    environment: browserLaunchEnvironment(), executable: null, browserVersion: null, diagnostic: null }
  let browser
  try {
    const base = path.join(repo, '.github/release-tools/node_modules/playwright-core')
    const { chromium } = require(base)
    const version = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).version
    report.playwrightVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : null
    const file = chromium.executablePath()
    let exists = false, executable = false, mode = null
    try { const stat = fs.statSync(file); exists = stat.isFile(); mode = stat.mode & 0o777 } catch { /* Record only booleans. */ }
    try { fs.accessSync(file, fs.constants.X_OK); executable = true } catch { /* Never print paths or OS errors. */ }
    report.executable = { defaultExecutableExists: exists, defaultExecutableAccessible: executable, permissionMode: mode,
      note: 'Public default executable metadata; headless mode may select the separately installed headless shell.' }
    const registry = JSON.parse(fs.readFileSync(path.join(base, 'browsers.json'), 'utf8')).browsers
    report.packageBrowserExpectations = registry.filter(row => ['chromium', 'chromium-headless-shell'].includes(row.name))
      .map(row => ({ name: row.name, version: /^\d+(?:\.\d+){3}$/.test(row.browserVersion) ? row.browserVersion : null,
        revision: /^\d+$/.test(String(row.revision)) ? String(row.revision) : null }))
    report.stage = 'browser-launch'
    // Exactly the journey's existing settings. No fallback, certificate bypass,
    // alternate runner/browser, sandbox change or security-setting mutation.
    browser = await chromium.launch({ headless: true, chromiumSandbox: true })
    assert.equal(browser.isConnected(), true, 'Launched browser must remain connected')
    const browserVersion = browser.version()
    report.browserVersion = /^\d+(?:\.\d+){3}$/.test(browserVersion) ? browserVersion : null
    report.stage = 'browser-close'
    await browser.close(); browser = undefined
    report.status = 'LAUNCH_READY'; report.stage = 'complete'
  } catch (error) {
    report.status = 'FAILED'; report.diagnostic = classifyBrowserLaunchError(error)
  } finally {
    if (browser) { try { await browser.close() } catch { /* Preserve the first safe diagnostic. */ } }
    fs.writeFileSync(path.join(out, 'browser-launch.json'), JSON.stringify(report, null, 2) + '\n')
  }
  return report.status === 'LAUNCH_READY' ? 0 : 1
}

function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(char); assert.ok(index >= 0)
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step))
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(), offset = hash[19] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}

async function run() {
  const { root, value: fixture } = readFixture()
  const { chromium } = require('../../.github/release-tools/node_modules/playwright-core')
  const axeSource = fs.readFileSync(path.join(repo, '.github/release-tools/node_modules/axe-core/axe.min.js'), 'utf8')
  const dist = fs.realpathSync(process.env.SCHOOL_TEACHER_FRONTEND_DIST || path.join(__dirname, '../frontend/dist'))
  assert.ok(fs.existsSync(path.join(dist, 'index.html')))
  const port = Number(process.env.SCHOOL_TEACHER_BACKEND_PORT || 3187)
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535)
  const redis = new URL(process.env.REDIS_URL)
  assert.equal(redis.protocol, 'redis:'); assert.ok(['127.0.0.1', 'localhost'].includes(redis.hostname))
  const out = path.resolve(process.env.SCHOOL_TEACHER_EVIDENCE_DIR || path.join(repo, 'school-teacher-evidence'))
  assert.ok(out !== root && !out.startsWith(root + path.sep) && !root.startsWith(out + path.sep), 'Never upload fixture secrets')
  fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true })
  assert.equal(process.env.SCHOOL_TEACHER_ARTIFACTS_VERIFIED, '1', 'Reuse verified current-run artifacts; do not silently consume a local build')
  // Historical diagnostic dual-build reuse is never accepted. Each official
  // component exception requires its fixed receipt and independent current bytes.
  assert.equal(fs.existsSync(path.join(out, 'reused-builds.json')), false, 'No historical diagnostic-build reuse')
  const manifest = (kind, dir) => validateBuildManifest(JSON.parse(fs.readFileSync(path.join(dir, 'ci-build-manifest.json'), 'utf8')),
    kind, fixture.identity, process.env.GITHUB_RUN_ID, null)
  const receiptPath = path.join(out, 'official-frontend-build-reuse.json')
  let buildEvidence = {}, frontendManifest
  if (fs.existsSync(receiptPath)) {
    assert.ok(fs.lstatSync(receiptPath).isFile() && !fs.lstatSync(receiptPath).isSymbolicLink())
    assert.equal(fs.realpathSync(receiptPath), receiptPath)
    const officialFrontendReuse = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
    const { treeDigest } = await import(pathToFileURL(path.join(repo, '.github/scripts/ci-artifact.mjs')).href)
    frontendManifest = JSON.parse(fs.readFileSync(path.join(dist, 'ci-build-manifest.json'), 'utf8'))
    buildEvidence = { officialFrontendReuse,
      frontendTree: execFileSync('git', ['rev-parse', 'HEAD:server-version/frontend'], { cwd: repo, encoding: 'utf8' }).trim(),
      frontendLockDigest: sha(fs.readFileSync(path.join(repo, 'server-version/frontend/package-lock.json'))),
      frontendContentDigest: treeDigest(dist) }
    validateOfficialFrontendReceipt(officialFrontendReuse, { ...fixture.identity, runId: process.env.GITHUB_RUN_ID,
      frontend: frontendManifest, ...buildEvidence })
  } else frontendManifest = manifest('frontend', dist)
  const backendReceiptPath = path.join(out, 'official-backend-build-reuse.json')
  let backendManifest
  if (fs.existsSync(backendReceiptPath)) {
    assert.ok(fs.lstatSync(backendReceiptPath).isFile() && !fs.lstatSync(backendReceiptPath).isSymbolicLink())
    assert.equal(fs.realpathSync(backendReceiptPath), backendReceiptPath)
    const officialBackendReuse = JSON.parse(fs.readFileSync(backendReceiptPath, 'utf8'))
    const { treeDigest } = await import(pathToFileURL(path.join(repo, '.github/scripts/ci-artifact.mjs')).href)
    backendManifest = JSON.parse(fs.readFileSync(path.join(backend, 'dist/ci-build-manifest.json'), 'utf8'))
    Object.assign(buildEvidence, { officialBackendReuse,
      backendCompileDigest: computeBackendCompileDigest(execFileSync('git', ['ls-tree', '-r', 'HEAD', '--', 'server-version/backend'], { cwd: repo, encoding: 'utf8' })),
      backendLockDigest: sha(fs.readFileSync(path.join(backend, 'package-lock.json'))),
      backendContentDigest: treeDigest(path.join(backend, 'dist')) })
    validateOfficialBackendReceipt(officialBackendReuse, { ...fixture.identity, runId: process.env.GITHUB_RUN_ID,
      backend: backendManifest, ...buildEvidence })
  } else backendManifest = manifest('backend', path.join(backend, 'dist'))
  const report = { schemaVersion: 1, source: fixture.identity, runId: process.env.GITHUB_RUN_ID,
    inputs: { frontend: frontendManifest, backend: backendManifest },
    ...(buildEvidence.officialFrontendReuse ? { officialFrontendReuse: buildEvidence.officialFrontendReuse } : {}),
    ...(buildEvidence.officialBackendReuse ? { officialBackendReuse: buildEvidence.officialBackendReuse } : {}),
    startups: [], chrome: null, ui: {},
    transport: 'Synthetic canonical-origin static documents; unmodified real loopback backend API responses. No public TLS/DNS/deployment assertion.',
    runtime: 'Official runtime-role-defaults/contract and release-schema checks; API never uses owner principal.',
    coverage: [], screenshots: [], keyboard: [], errors: [], notCovered: ['Real media upload/storage/delivery and report images', 'Parent/teacher-observer/revocation matrix',
      'Public deployment TLS, DNS, reverse proxy', 'MFA enrollment UI visuals (real enrollment API is used)', 'Manual construction of every question (real saved definition template API is used)'],
    sessions: [], status: 'RUNNING' }
  const ui = createUiChecks({ report: report.ui, out, axeSource, getFontInventory: () => report.chrome.fonts })
  let browser, app, privateLog, lastSafeSession, bodyFailed = false, stage = 'chrome-preflight'
  async function stopBackend() {
    const current = app
    if (current?.pid && current.exitCode === null && current.signalCode === null) {
      const exited = new Promise(resolve => current.once('exit', resolve))
      current.kill('SIGTERM')
      await Promise.race([exited, pause(10000)])
      if (current.exitCode === null && current.signalCode === null) { current.kill('SIGKILL'); await exited }
    }
    if (privateLog !== undefined) { fs.closeSync(privateLog); privateLog = undefined }
    app = undefined
  }
  async function startBackend(product) {
    await stopBackend()
    stage = product + '-backend-start'
    const logPath = path.join(root, 'backend-' + product.toLowerCase() + '.log')
    privateLog = fs.openSync(logPath, 'wx', 0o600)
    const env = backendEnvironment(fixture, root, port, redis.href, product)
    const startup = { product, corsOrigin: env.CORS_ORIGIN, ready: false, phase: 'PRODUCTION_ENTRYPOINT' }
    report.startups.push(startup)
    app = spawn(process.execPath, ['dist/index.js'], { cwd: backend, env, stdio: ['ignore', privateLog, privateLog] })
    let spawnError = false, spawnCode = null
    app.once('error', error => { spawnError = true; spawnCode = ['EACCES', 'ENOENT', 'EPERM'].includes(error.code) ? error.code : 'OTHER' })
    const fail = code => {
      const fd = fs.openSync(logPath, 'r'), bytes = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 65536))
      try { fs.readSync(fd, bytes, 0, bytes.length, 0) } finally { fs.closeSync(fd) }
      startup.phase = code
      startup.diagnostic = { code, exitCode: app.exitCode, signal: app.signalCode, spawnCode,
        knownCauses: classifyStartupLog(bytes.toString('utf8')), boundedLogDigest: sha(bytes) }
      throw new Error(product + ':' + code)
    }
    for (let i = 0; i < 90; i++) {
      if (spawnError) fail('BACKEND_SPAWN_FAILED')
      if (app.exitCode !== null || app.signalCode !== null) fail('BACKEND_EXIT_BEFORE_READY')
      startup.ready = await new Promise(resolve => {
        const req = http.get({ hostname: '127.0.0.1', port, path: '/ready', timeout: 1000 }, res => { res.resume(); resolve(res.statusCode === 200) })
        req.on('error', () => resolve(false)); req.on('timeout', () => req.destroy())
      })
      if (startup.ready) { startup.phase = 'READY'; return }
      await pause(500)
    }
    fail('BACKEND_READINESS_TIMEOUT')
  }
  try {
    // Read-only installed-channel verification. Never install or fall back.
    const preflight = preflightChrome({ repo, diagnostics: true })
    report.chrome = { options: CHROME_LAUNCH_OPTIONS, preflight, sandbox: null, launchedVersion: null }
    assert.equal(preflight.ok, true, 'Official Chrome preflight failed')
    stage = 'cjk-font-preflight'
    report.chrome.fonts = inspectCjkFonts()
    // Font limitations are recorded, not a reason to skip the real business journey.
    stage = 'browser-launch'
    browser = await chromium.launch(CHROME_LAUNCH_OPTIONS)
    report.chrome.launchedVersion = browser.version()
    assert.equal(report.chrome.launchedVersion, preflight.package.browserVersion, 'Launched official Chrome must match inspected installed version')
    stage = 'browser-sandbox-evidence'
    report.chrome.sandbox = await verifyChromeSandbox(browser)
    assert.equal(report.chrome.sandbox.ok, true, 'Runtime sandbox evidence missing or unsafe')
    // Do not inherit production credentials, external storage, mail or telemetry.

    async function session(product, user, label, options = {}) {
      lastSafeSession = null
      const origin = origins[product], prefix = prefixes[product]
      const context = await browser.newContext({ viewport: options.anonymous ? { width: 320, height: 844 } : viewports[0], reducedMotion: 'reduce', serviceWorkers: 'block' })
      const appearanceKeys = await ui.prepare(context, product, user, options.mode)
      const audit = { product, actor: label, pageErrors: [], consoleErrors: [], unexpectedRequests: [], failedResponses: [], requestFailures: [],
        staticRequests: [], staticResponses: [], apiMutations: [] }
      ;(options.anonymous ? report.ui.sessions : report.sessions).push(audit)
      const expectedFailures = new Set([prefix + '/auth/me:401'])
      await context.routeWebSocket('**/*', socket => {
        audit.unexpectedRequests.push('WebSocket:' + new URL(socket.url()).origin)
        socket.close()
      })
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url())
        if (url.origin !== origin) { audit.unexpectedRequests.push(url.origin + url.pathname); return route.abort('blockedbyclient') }
        if (url.pathname.startsWith('/api/')) {
          if (!url.pathname.startsWith(prefix + '/')) { audit.unexpectedRequests.push(url.pathname); return route.abort('blockedbyclient') }
          try {
            const headers = await req.allHeaders()
            // Preserve the actual browser Origin/CSRF/cookies; emulate only the
            // normal trusted proxy transport, never change application policy.
            headers.host = url.host; headers['x-forwarded-proto'] = 'https'; headers['x-forwarded-host'] = url.host
            delete headers['x-forwarded-for']; headers['accept-encoding'] = 'identity'
            const response = await route.fetch({ url: 'http://127.0.0.1:' + port + url.pathname + url.search,
              headers, maxRedirects: 0, timeout: 30000 })
            const location = response.headers().location
            assert.ok(!location || new URL(location, origin).origin === origin, 'API may not redirect to an external origin')
            // Use APIResponse, NOT a headers object: preserve all Set-Cookie values.
            await route.fulfill({ response })
          } catch (error) {
            audit.requestFailures.push({ path: url.pathname, transportErrorHash: sha(String(error)) })
            await route.abort('failed')
          }
          return
        }
        if (!['GET', 'HEAD'].includes(req.method())) { audit.unexpectedRequests.push(url.pathname); return route.abort('blockedbyclient') }
        const decoded = decodeURIComponent(url.pathname)
        assert.ok(!decoded.includes('\0') && !decoded.includes('\\'))
        let file = path.resolve(dist, '.' + decoded)
        assert.ok(file.startsWith(dist + path.sep) || file === dist)
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          if (path.extname(decoded)) return route.fulfill({ status: 404, body: 'Not found' })
          file = path.join(dist, 'index.html')
        }
        assert.ok(fs.realpathSync(file).startsWith(dist + path.sep))
        return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on('pageerror', error => audit.pageErrors.push({ name: error.name, hash: sha(error.message) }))
      page.on('console', msg => { if (msg.type() === 'error') audit.consoleErrors.push({ hash: sha(msg.text()),
        network: /^Failed to load resource:/.test(msg.text()), path: msg.location().url ? new URL(msg.location().url, origin).pathname : '' }) })
      page.on('request', req => {
        const url = new URL(req.url())
        if (url.origin === origin && !url.pathname.startsWith('/api/')) audit.staticRequests.push(url.origin + url.pathname)
        if (url.origin === origin && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method()))
          audit.apiMutations.push({ path: url.pathname, method: req.method() })
      })
      page.on('response', res => {
        const url = new URL(res.url())
        if (res.status() >= 400) audit.failedResponses.push({ path: url.pathname, status: res.status() })
        if (url.origin === origin && !url.pathname.startsWith('/api/')) audit.staticResponses.push({ path: url.pathname, status: res.status() })
      })
      page.on('requestfailed', req => { if (req.failure()?.errorText !== 'net::ERR_ABORTED') audit.requestFailures.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText }) })
      const s = { product, prefix, origin, page, context, audit, expectedFailures, appearanceKeys, authenticated: false }
      s.api = async (uri, method = 'GET', data, statuses = [200]) => {
        for (const status of statuses.filter(status => status >= 400)) expectedFailures.add(prefix + uri.split('?')[0] + ':' + status)
        const result = await page.evaluate(async ({ endpoint, csrfPath, method, data }) => {
          const headers = { 'Content-Type': 'application/json' }
          if (method !== 'GET') {
            const csrf = await (await fetch(csrfPath, { credentials: 'same-origin' })).json()
            headers['X-CSRF-Token'] = csrf.data.csrfToken
          }
          const response = await fetch(endpoint, { method, credentials: 'same-origin', headers,
            ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
          return { status: response.status, body: await response.json() }
        }, { endpoint: prefix + uri, csrfPath: prefix + '/auth/csrf', method, data })
        assert.ok(statuses.includes(result.status), `${label}: ${method} ${uri} returned ${result.status}`)
        if (result.status === 200) assert.equal(result.body.code, 0, `${label}: ${method} ${uri} application error`)
        return result.status === 200 ? result.body.data : result
      }
      s.click = async (locator, uri, method = 'POST') => {
        const pending = page.waitForResponse(res => new URL(res.url()).pathname === prefix + uri && res.request().method() === method)
        await locator.click()
        const response = await pending; assert.equal(response.status(), 200, `${method} ${uri}`)
        const body = await response.json(); assert.equal(body.code, 0, `${method} ${uri} application error`)
        return body.data
      }
      s.close = async () => {
        let validationFailed = false
        try {
        await page.waitForLoadState('networkidle')
        audit.expectedFailures = [...expectedFailures]
        assert.deepEqual(audit.failedResponses.filter(row => !expectedFailures.has(row.path + ':' + row.status)), [], 'No unexpected HTTP errors')
        assert.deepEqual(audit.consoleErrors.filter(row => !row.network || !audit.failedResponses.some(response =>
          response.path === row.path && expectedFailures.has(response.path + ':' + response.status))), [], 'No unexpected browser console errors')
        } catch (error) { validationFailed = true; throw error } finally {
          try { await context.close() } catch (error) {
            report.errors.push({ stage: 'session-context-close', name: 'CleanupError', messageHash: sha(String(error)),
              note: 'Context cleanup failed; no raw exception is published.' })
            if (!validationFailed) throw new Error('Browser session context cleanup failed')
          }
        }
      }
      await prepareRenderedCjk(page)
      if (options.anonymous) {
        await page.goto(origin + '/')
        return s
      }
      await page.goto(origin + '/login')
      await page.locator((product === 'SCHOOL' ? '.hs-app' : '.ht-app') + '[data-theme="light"]').waitFor()
      s.guestThemeVerified = true
      await page.getByLabel(product === 'SCHOOL' ? '用户名' : '教育账号', { exact: true }).fill(user.username)
      await page.getByLabel('密码', { exact: true }).fill(user.password)
      const form = page.locator('form').filter({ has: page.getByLabel('密码', { exact: true }) })
      const logged = await s.click(form.getByRole('button', { name: '登录', exact: true }), '/auth/login')
      assert.equal(Boolean(logged.mfaRequired), label !== 'participant', 'Privileged fixture actors must complete the real MFA boundary')
      if (logged.mfaRequired) {
        assert.equal(logged.enrolled, false, 'Fresh fixture must not reuse an enrolled credential')
        const enrolled = await s.api('/auth/mfa/setup', 'POST', {})
        s.mfaSecret = new URL(enrolled.otpauthUri).searchParams.get('secret'); assert.ok(s.mfaSecret)
        s.mfaStep = Math.floor(Date.now() / 30000)
        await s.api('/auth/mfa/confirm', 'POST', { code: totp(s.mfaSecret, s.mfaStep) })
      }
      const me = await s.api('/auth/me'); assert.equal(me.id, user.id)
      assert.equal(me.role, user.role)
      const cookies = (await context.cookies(origin)).filter(c => c.name === (product === 'SCHOOL' ? 'huischool_session' : 'huiteacher_session'))
      assert.equal(cookies.length, 1); assert.equal(cookies[0].secure, true); assert.equal(cookies[0].httpOnly, true)
      await page.reload(); s.authenticated = true; lastSafeSession = s
      await ui.preference(s)
      s.stepUp = async () => {
        assert.ok(s.mfaSecret, 'Privileged action must retain the real verified MFA challenge')
        if (Math.floor(Date.now() / 30000) === s.mfaStep) await pause(30000 - Date.now() % 30000 + 50)
        s.mfaStep = Math.floor(Date.now() / 30000)
        await s.api('/auth/mfa/step-up', 'POST', { code: totp(s.mfaSecret, s.mfaStep) })
      }
      return s
    }

    async function shot(s, name) {
      const journeyStage = stage
      assert.equal(s.authenticated, true, 'No authentication/MFA screenshots')
      assert.equal(await s.page.locator(s.product === 'SCHOOL' ? '.hs-app' : '.ht-app').getAttribute('data-theme'), 'light', 'Stable light baseline')
      for (const viewport of viewports) {
        stage = s.product + '-' + name + '-light-' + viewport.width
        await s.page.setViewportSize(viewport)
        await s.page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())) })
        const layout = await s.page.evaluate(() => {
          const scrollWidth = document.documentElement.scrollWidth
          // Bounded structural diagnostics only: never text, values, filenames or URLs.
          const overflowElements = scrollWidth > innerWidth + 1 ? [...document.querySelectorAll('body *')].flatMap(element => {
            const rect = element.getBoundingClientRect()
            if (!rect.width || !rect.height || (rect.left >= -1 && rect.right <= innerWidth + 1)) return []
            return [{ tag: element.tagName, classes: [...element.classList].filter(token => /^(?:education-private-|scale-feedback-|hs-|ht-|survey-form-)[a-z-]+$/.test(token)).slice(0, 8),
              left: rect.left, right: rect.right, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }]
          }).slice(0, 20) : []
          return { width: innerWidth, scrollWidth, overflowElements,
            secretNodes: document.querySelectorAll('.ht-secret,.hs-secret,.ht-mfa-setup').length }
        })
        assert.equal(layout.secretNodes, 0, 'Do not capture authentication secrets')
        await s.page.keyboard.press('Tab')
        const keyboard = await s.page.evaluate(() => {
          const element = document.activeElement, style = getComputedStyle(element), rect = element.getBoundingClientRect()
          return { tag: element.tagName, focusVisible: element.matches(':focus-visible'),
            visible: rect.width > 0 && rect.height > 0, ring: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none' }
        })
        if (!await s.page.evaluate(() => Boolean(window.axe))) await s.page.addScriptTag({ content: axeSource })
        const accessibility = await s.page.evaluate(async () => {
          const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
          return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })),
            passes: result.passes.length, incomplete: result.incomplete.map(v => v.id) }
        })
        const file = `${s.product.toLowerCase()}-${name}-${viewport.width}.png`
        await s.page.screenshot({ path: path.join(out, 'screenshots', file), fullPage: true })
        report.screenshots.push({ file: 'screenshots/' + file, viewport, layout, keyboard, accessibility })
        assert.ok(layout.scrollWidth <= layout.width + 1, `${name} horizontal overflow at ${viewport.width}`)
        assert.equal(keyboard.visible && keyboard.focusVisible && keyboard.ring, true, `${name} keyboard focus at ${viewport.width}`)
        assert.deepEqual(accessibility.violations, [], `${name} WCAG A/AA browser violations at ${viewport.width}`)
      }
      await s.page.setViewportSize(viewports[0])
      stage = s.product + '-' + name + '-dark-supplement'
      await ui.supplement(s, name)
      stage = journeyStage
    }
    async function keyboardCheck(s, locator, pressed = false) {
      await locator.focus(); await locator.press('Space')
      if (pressed) assert.equal(await locator.getAttribute('aria-pressed'), 'true', 'Keyboard Space selects the scale option')
      else assert.equal(await locator.isChecked(), true, 'Keyboard Space selects the native control')
      assert.equal(await locator.evaluate(el => document.activeElement === el && el.matches(':focus-visible')), true, 'Keyboard focus remains visible')
      report.keyboard.push({ product: s.product, action: 'Space', control: pressed ? 'scale-option-button' : await locator.getAttribute('type'), selected: true, focusVisible: true })
    }
    async function toolsPage(s, f) {
      if (s.product === 'SCHOOL') await s.page.goto(s.origin + '/workspace/private-tools?organizationId=' + f.organizationId)
      else await s.page.getByRole('navigation', { name: 'Teacher 工作台' }).getByRole('button', { name: '我的工具', exact: true }).click()
      await s.page.getByRole('region', { name: '我的私有工具', exact: true }).waitFor()
    }
    async function previewForm(s) {
      const p = s.page, group = prompt => p.getByRole('group', { name: new RegExp('^' + prompt) })
      await group('合成单选条件题').getByRole('radio', { name: '合成选项乙', exact: true }).check()
      assert.equal(await group('合成条件拒答题').count(), 0)
      await group('合成单选条件题').getByRole('radio', { name: '合成选项甲', exact: true }).check()
      await group('合成条件拒答题').getByRole('checkbox', { name: '不愿回答', exact: true }).check()
      await group('合成多选题').getByRole('checkbox', { name: '合成选项甲', exact: true }).check()
      await group('合成多选题').getByRole('checkbox', { name: '合成选项乙', exact: true }).check()
      const matrix = group('合成矩阵题')
      assert.equal(await matrix.getByRole('checkbox', { name: '不愿回答', exact: true }).count(), 0, 'No invalid whole-matrix refusal')
      const row = matrix.getByRole('group', { name: '合成矩阵第一行', exact: true }), refusal = row.getByRole('checkbox', { name: '不愿回答本行' })
      await refusal.check(); await refusal.uncheck()
      assert.equal(await row.getByRole('radio', { name: '合成选项甲' }).isEnabled(), true)
      await refusal.check()
      await matrix.getByRole('group', { name: '合成矩阵第二行', exact: true }).getByRole('radio', { name: '合成选项乙' }).check()
      await group('合成分节确认题').getByRole('textbox').fill('合成第二分节确认')
    }
    async function authorTool(s, f, kind) {
      const p = s.page, base = '/organizations/' + f.organizationId + '/private-tools'
      const title = `${s.product} 合成${kind} ${fixture.suffix}`
      await toolsPage(s, f)
      const studio = p.getByRole('region', { name: '我的私有工具', exact: true })
      await studio.getByLabel('工具名称', { exact: true }).fill(title)
      await studio.getByRole('combobox', { name: '类型', exact: true }).selectOption(kind)
      const draft = await s.click(studio.getByRole('button', { name: '创建私有工具' }), base)
      const uri = base + '/' + draft.id
      await s.api(uri, 'PUT', { expectedRevision: draft.revision, title, definition: f.definitions[kind.toLowerCase()] })
      await s.click(studio.getByRole('button', { name: '重新读取草稿' }), uri, 'GET')
      if (kind === 'FORM') {
        const outline = studio.getByRole('navigation', { name: '表单区段与题目', exact: true })
        await outline.getByRole('button', { name: '编辑题目：合成矩阵题', exact: true }).click()
        await shot(s, 'form-author-editor')
        await outline.getByRole('button', { name: '编辑题目：合成单选条件题', exact: true }).click()
      }
      const input = studio.getByLabel('工具名称', { exact: true }), savedTitle = title + ' 已保存'
      await input.fill(savedTitle)
      await s.click(studio.getByRole('button', { name: '保存草稿', exact: true }), uri, 'PUT')
      await input.fill(title + ' 取消修改')
      p.once('dialog', dialog => dialog.dismiss())
      await studio.getByRole('button', { name: '返回我的工具', exact: true }).click()
      assert.equal(await input.inputValue(), title + ' 取消修改', 'Cancel navigation preserves draft')
      p.once('dialog', dialog => dialog.accept())
      await s.click(studio.getByRole('button', { name: '重新读取草稿', exact: true }), uri, 'GET')
      assert.equal(await input.inputValue(), savedTitle, 'Explicit discard restores saved server revision')
      const checked = await s.click(studio.getByRole('button', { name: '检查定义', exact: true }), uri + '/validate')
      assert.equal(checked.valid, true)
      await studio.getByRole('button', { name: '试填预览', exact: true }).click()
      if (kind === 'SCALE') await keyboardCheck(s, studio.getByRole('radio', { name: '合成量表选项乙', exact: true }))
      else await previewForm(s)
      const previewRequest = p.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === s.prefix + uri + '/preview')
      const preview = await s.click(studio.getByRole('button', { name: '检查试填结果' }), uri + '/preview')
      const sentPreview = (await previewRequest).postDataJSON()
      assert.equal(preview.contentHash, checked.contentHash)
      assert.equal(preview.previewOnly, true); assert.equal(preview.persistedAnswers, false)
      if (kind === 'FORM') {
        assert.deepEqual(preview.result.rawAnswers.multiple, ['a', 'b'])
        assert.equal(Object.hasOwn(sentPreview.answers, 'matrix'), false, 'Preview input must use validated row keys, not a matrix summary')
        assert.deepEqual(preview.result.rawAnswers.matrix, { r2: 'b' })
        for (const itemKey of ['conditional', 'matrix:r1']) assert.ok(preview.result.missing.some(item => item.itemKey === itemKey && item.reason === 'REFUSED'))
      }
      await shot(s, kind.toLowerCase() + '-author-preview')
      const version = await s.click(studio.getByRole('button', { name: '固定私有版本', exact: true }), uri + '/freeze')
      assert.equal(version.contentHash, checked.contentHash)
      await input.fill(title + ' 后续草稿')
      await s.click(studio.getByRole('button', { name: '保存草稿', exact: true }), uri, 'PUT')
      const history = await s.api(uri + '/versions'), frozen = history.list.find(row => row.id === version.id)
      assert.equal(frozen.contentHash, version.contentHash); assert.equal(frozen.title, savedTitle)
      await studio.getByRole('button', { name: '返回我的工具', exact: true }).click()
      report.coverage.push({ product: s.product, check: 'author-' + kind, creation: 'UI', definitionTemplate: 'real authenticated PUT',
        saveDiscardPreviewFreeze: 'UI', immutableVersion: true })
      return { ...version, toolId: draft.id, title: savedTitle }
    }
    async function workflowPage(s, f, w) {
      if (s.product === 'SCHOOL') {
        await s.page.goto(s.origin + '/workspace/activities?organizationId=' + f.organizationId)
        await s.page.getByRole('combobox', { name: '选择已有活动', exact: true }).selectOption(w.id)
        await s.page.getByRole('button', { name: w.runName + ' · 准备中', exact: true }).click()
        return s.page
      }
      await s.page.reload()
      await s.page.getByRole('navigation', { name: 'Teacher 工作台' }).getByRole('button', { name: '学校改进', exact: true }).click()
      await ui.schoolManagementAnchor(s)
      const event = s.page.getByRole('region', { name: '评价活动', exact: true }).locator('article.ht-event').filter({ has: s.page.locator('strong').filter({ hasText: w.title }) })
      await event.getByRole('button', { name: '查看任务配置', exact: true }).click()
      return event
    }
    async function publish(s, f, versions) {
      const base = '/organizations/' + f.organizationId, title = s.product + ' 合成活动 ' + fixture.suffix, runName = '合成固定版本批次'
      let w
      if (s.product === 'SCHOOL') {
        const activity = await s.api(base + '/activities', 'POST', { title, purpose: 'STUDENT_WELLBEING' })
        const parent = base + '/activities/' + activity.id
        await s.api(parent + '/participants', 'POST', { classUnitIds: [f.classUnitId], requestKey: randomUUID(), expectedVersion: activity.version })
        const run = await s.api(parent + '/runs', 'POST', { name: runName })
        w = { id: activity.id, parent, endpoint: parent + '/runs/' + run.id, title, runName, runId: run.id }
      } else {
        const target = await s.api(base + '/evaluation-targets', 'POST', { kind: 'ORGANIZATION', name: '合成本校教师' })
        const event = await s.api(base + '/evaluation-events', 'POST', { title, kind: 'ASSESSMENT', targetId: target.id })
        const parent = base + '/evaluation-events/' + event.id
        const run = await s.api(parent + '/run', 'POST', { name: runName })
        w = { id: event.id, parent, endpoint: parent + '/run', title, runName, runId: run.runId, eventVersion: event.version }
      }
      let scope = await workflowPage(s, f, w)
      for (const [kind, version] of Object.entries(versions)) {
        const label = kind === 'SCALE' ? '量表' : '表单', picker = scope.getByRole('region', { name: '我的' + label + '固定版本', exact: true })
        await picker.getByRole('button', { name: '读取我的固定' + label, exact: true }).click()
        await picker.getByRole('combobox', { name: '我的' + label + ' · 固定版本', exact: true }).selectOption(version.id)
        await picker.getByRole('combobox', { name: '本次作答方式', exact: true }).selectOption('SELF')
        await s.click(picker.getByRole('button', { name: '加入我的固定' + label, exact: true }), w.endpoint + '/tracks')
      }
      const previewLabel = s.product === 'SCHOOL' ? '预览合法参与者数量' : '预览任务配置'
      const preview = await s.click(scope.getByRole('button', { name: previewLabel, exact: true }), w.endpoint + '/preview')
      assert.equal(preview.tracks.length, 2)
      assert.ok(preview.tracks.every(track => track.executionCount === (s.product === 'SCHOOL' ? 1 : 2)))
      if (s.product === 'TEACHER') {
        const rendered = scope.getByRole('region', { name: '任务配置预览', exact: true })
        await rendered.getByText('预计作答任务：4 个', { exact: true }).waitFor()
      } else await scope.getByRole('status').filter({ hasText: '预览：' }).waitFor()
      await shot(s, 'fixed-version-selection-preview')
      await s.stepUp()
      if (s.product === 'SCHOOL') {
        const detail = await s.api(w.parent), submitted = await s.api(w.parent + '/submit', 'POST', { expectedVersion: detail.version })
        await s.api(w.parent + '/govern', 'POST', { action: 'OPEN', expectedVersion: submitted.version })
      } else await s.api(w.parent + '/transition', 'POST', { action: 'OPEN', expectedVersion: w.eventVersion })
      scope = await workflowPage(s, f, w)
      await s.click(scope.getByRole('button', { name: previewLabel, exact: true }), w.endpoint + '/preview')
      s.page.once('dialog', dialog => dialog.accept())
      const result = await s.click(scope.getByRole('button', { name: s.product === 'SCHOOL' ? '正式发布本人测评' : '发布教师评价任务', exact: true }), w.endpoint + '/publish')
      assert.equal(result.executionCount, s.product === 'SCHOOL' ? 2 : 4)
      report.coverage.push({ product: s.product, check: 'fixed-version-preview-publish', executionCount: result.executionCount, schoolPublisherIsNonAdmin: s.product === 'SCHOOL' })
      return w
    }
    async function participant(s, f, w, author, versions) {
      const p = s.page
      if (s.product === 'SCHOOL') await p.goto(s.origin + '/workspace/tasks')
      const list = async kind => s.product === 'SCHOOL' ? (await s.api('/my/activity-tasks?page=1&pageSize=25')).list.filter(t => t.activityId === w.id)
        : (await s.api(kind === 'SCALE' ? '/my-scale-tasks' : '/my-private-form-tasks')).list.filter(t => t.eventId === w.id || t.eventTitle === w.title)
      const encountered = new Set()
      for (const requestedKind of ['SCALE', 'FORM']) {
        const items = await list(requestedKind)
        let kind = s.product === 'SCHOOL' ? null : requestedKind
        const task = s.product === 'SCHOOL' ? items.find(t => t.status !== 'COMPLETED')
          : items.find(t => (t.title || t.formTitle) === versions[kind].title)
        assert.ok(task, 'Published fixed-version task must be assigned to the separate real participant')
        const executionId = task.executionId || task.id
        let schoolIndex = items.findIndex(t => t.id === executionId)
        const card = () => s.product === 'SCHOOL'
          ? p.locator('article.hs-task-card').filter({ hasText: w.title }).nth(schoolIndex)
          : p.locator('article.ht-event').filter({ hasText: versions[kind].title })
        const open = async () => {
          const loaded = p.waitForResponse(r => r.request().method() === 'GET' && new RegExp('^' + s.prefix + '/(?:private-form-)?composite-attempts/[^/]+$').test(new URL(r.url()).pathname))
          await card().getByRole('button', { name: s.product === 'SCHOOL' ? '开始／继续官方测评' : kind === 'SCALE' ? '进入本人自评' : '打开本人表单', exact: true }).click()
          if (s.product === 'SCHOOL') {
            const consent = p.getByRole('checkbox', { name: '我已阅读本次测评的用途与可见性说明，自愿同意作答。', exact: true })
            if (await consent.count()) await consent.check()
            await p.getByRole('button', { name: '开始或继续正式测评', exact: true }).click()
          }
          const response = await loaded; assert.equal(response.status(), 200)
          const body = await response.json(); assert.equal(body.code, 0)
          const actualKind = body.data.currentItem.type === 'SCALE' ? 'SCALE' : body.data.currentItem.type === 'FORM_SECTION' ? 'FORM' : null
          assert.ok(actualKind, 'Only the published SCALE or FORM may run')
          if (kind) assert.equal(actualKind, kind); else kind = actualKind
          await (kind === 'SCALE' ? p.getByRole('region', { name: /^量表题目 / }) : p.locator('.form-player')).waitFor()
          return body.data
        }
        const dto = await open()
        assert.equal(encountered.has(kind), false, 'Both distinct private tool kinds must execute')
        encountered.add(kind)
        if (kind === 'SCALE') {
          await keyboardCheck(s, p.getByRole('button', { name: '合成量表选项乙', exact: true }), true)
          await shot(s, 'scale-answer')
          await p.getByRole('button', { name: '保存并退出', exact: true }).click(); await open()
          assert.equal(await p.getByRole('button', { name: '合成量表选项乙', exact: true }).getAttribute('aria-pressed'), 'true')
          const pending = p.waitForResponse(r => r.request().method() === 'POST' && /\/scale\/submit$/.test(new URL(r.url()).pathname))
          await p.getByRole('button', { name: '提交整份量表', exact: true }).click()
          assert.equal((await pending).status(), 200)
        } else {
          const fields = dto.currentItem.formAnswers || dto.currentItem.answers
          assert.deepEqual(fields.map(field => field.type), ['SINGLE', 'SHORT_TEXT', 'MULTIPLE', 'MATRIX'])
          assert.ok(fields.every(field => field.type === field.formDefinition.type))
          const player = () => p.locator('.form-player')
          await keyboardCheck(s, player().getByRole('radio', { name: '合成选项乙', exact: true }))
          await player().getByRole('button', { name: '下一字段', exact: true }).click()
          await player().getByRole('group', { name: /合成多选题/ }).waitFor()
          await player().getByRole('button', { name: '上一字段', exact: true }).click()
          await player().getByRole('radio', { name: '合成选项甲', exact: true }).check()
          await p.getByRole('button', { name: '保存并退出', exact: true }).click(); await open()
          assert.equal(await player().getByRole('radio', { name: '合成选项甲', exact: true }).isChecked(), true)
          await shot(s, 'typed-single-restored')
          await player().getByRole('button', { name: '下一字段', exact: true }).click()
          const refuse = player().getByRole('checkbox', { name: '我选择不回答这一题', exact: true })
          await refuse.check(); await refuse.uncheck()
          assert.equal(await player().getByRole('textbox').isEnabled(), true)
          await refuse.check(); await player().getByRole('button', { name: '下一字段', exact: true }).click()
          await player().getByRole('checkbox', { name: '合成选项甲', exact: true }).check()
          await player().getByRole('checkbox', { name: '合成选项乙', exact: true }).check()
          await shot(s, 'typed-multiple')
          await player().getByRole('button', { name: '下一字段', exact: true }).click()
          const row = player().getByRole('group', { name: '合成矩阵第一行', exact: true }), rowRefusal = row.getByRole('checkbox', { name: '不愿回答本行' })
          await rowRefusal.check(); await rowRefusal.uncheck()
          assert.equal(await row.getByRole('radio', { name: '合成选项甲' }).isEnabled(), true)
          await keyboardCheck(s, rowRefusal)
          await player().getByRole('group', { name: '合成矩阵第二行', exact: true }).getByRole('radio', { name: '合成选项乙' }).check()
          await shot(s, 'typed-matrix-row-refusal')
          for (const section of [1, 2]) {
            const pending = p.waitForResponse(r => r.request().method() === 'POST' && /\/form-sections\/[^/]+\/submit$/.test(new URL(r.url()).pathname))
            await player().getByRole('button', { name: '提交整个区段', exact: true }).click()
            const response = await pending; assert.equal(response.status(), 200)
            if (section === 1) {
              const payload = response.request().postDataJSON(), values = Object.fromEntries(payload.answers.map(answer => [answer.formItemId, answer.value]))
              const field = key => fields.find(item => item.formDefinition.itemKey === key).formItemId
              assert.equal(values[field('choice')], 'a')
              assert.deepEqual(values[field('conditional')], { _surveyRefusal: true })
              assert.deepEqual(values[field('multiple')], ['a', 'b'])
              assert.deepEqual(values[field('matrix')], { r1: { _surveyRefusal: true }, r2: 'b' })
            }
            if (section === 1) { await player().getByLabel(/合成分节确认题/).fill('合成第二分节确认') }
          }
        }
        if (s.product === 'SCHOOL') {
          await p.getByRole('button', { name: '返回我的校园活动', exact: true }).click()
          schoolIndex = (await list(kind)).findIndex(t => t.id === executionId)
          await card().getByText('状态：已完成', { exact: true }).waitFor()
        } else if (kind === 'FORM') await p.getByRole('button', { name: '返回任务列表', exact: true }).click()
        const complete = (await list(kind)).find(t => (t.executionId || t.id) === executionId)
        assert.equal(complete.status, 'COMPLETED')
        if (kind === 'SCALE') {
          const reportPath = s.product === 'SCHOOL' ? '/reports/student/executions/' + executionId : '/run-executions/' + executionId + '/personal-summary'
          const feedback = await s.click(card().getByRole('button', { name: s.product === 'SCHOOL' ? '查看我的测评反馈' : '查看本人反馈', exact: true }), reportPath, 'GET')
          assert.equal(feedback.kind, 'EDUCATION_SCALE_PERSONAL_REPORT'); assert.equal(feedback.state, 'READY')
          assert.equal(feedback.mode, 'INDIVIDUAL_SUMMARY'); assert.equal(feedback.unitReports.length, 1)
          await shot(s, 'personal-fixed-version-report')
          await p.getByRole('button', { name: s.product === 'SCHOOL' ? '关闭我的反馈' : '关闭本人反馈', exact: true }).click()
          const denied = await author.api(reportPath, 'GET', undefined, s.product === 'SCHOOL' ? [404] : [200])
          if (s.product === 'TEACHER') assert.deepEqual(denied, { mode: 'NONE', state: 'WITHHELD' })
        } else {
          assert.equal(await card().getByRole('button', { name: '查看本人反馈', exact: true }).count(), 0)
          if (s.product === 'SCHOOL') {
            const feedback = await s.click(card().getByRole('button', { name: '查看我的测评反馈', exact: true }), '/reports/student/executions/' + executionId, 'GET')
            assert.ok(feedback.state === 'COMPLETED' || feedback.state === 'WITHHELD', 'FORM must not fabricate a scored report')
            assert.equal(feedback.unitReports, undefined); assert.equal(feedback.metrics, undefined)
            await p.getByRole('button', { name: '关闭我的反馈', exact: true }).click()
          }
          await shot(s, 'form-completed-no-score')
        }
        report.coverage.push({ product: s.product, check: 'separate-' + f.participant.role + '-SELF-' + kind,
          final: 'COMPLETED', localDraftResume: true, typedAdapter: kind === 'FORM' ? ['SINGLE', 'MULTIPLE', 'MATRIX', 'CONDITIONAL_REFUSAL', 'ROW_REFUSAL', 'TWO_SECTIONS'] : undefined })
      }
      assert.deepEqual([...encountered].sort(), ['FORM', 'SCALE'])
    }

    const completedProducts = await runRealmJourneys(['SCHOOL', 'TEACHER'], {
      journey: async product => {
        await startBackend(product)
        const f = fixture.products[product]
        stage = product + '-public-theme-layout'
        await ui.publicChecks(session, product)
        stage = product + '-author-login'
        const author = await session(product, f.author, 'author')
        stage = product + '-workspace-layout'; await ui.workspace(author)
        const capability = await author.api('/organizations/' + f.organizationId + '/tool-authoring-capabilities')
        assert.equal(capability.canAuthor, true)
        if (product === 'SCHOOL') {
          const context = await author.api('/organizations/' + f.organizationId + '/context')
          assert.equal(context.access.orgRole, 'MEMBER'); assert.equal(context.access.canGovern, false)
          assert.ok(context.access.capabilities.includes('PSYCHOLOGY_STAFF'))
        }
        const versions = {}
        for (const kind of ['SCALE', 'FORM']) { stage = product + '-author-' + kind; versions[kind] = await authorTool(author, f, kind) }
        stage = product + '-publish'; const w = await publish(author, f, versions)
        stage = product + '-participant-login'; const learner = await session(product, f.participant, 'participant')
        const canAuthor = await learner.api('/organizations/' + f.organizationId + '/tool-authoring-capabilities')
        assert.equal(canAuthor.canAuthor, false)
        stage = product + '-participant-answer-report'; await participant(learner, f, w, author, versions)
        await learner.close(); await author.close()
        if (product === 'TEACHER') {
          // Teacher admin management is NOT evidence of ordinary psychology authorship.
          stage = 'TEACHER-nonadmin-psychology-author'
          const f = fixture.products.TEACHER, psych = await session('TEACHER', f.psychAuthor, 'ordinary-psychology-author')
          const me = await psych.api('/auth/me'), organization = me.organizations.find(row => row.organizationId === f.organizationId)
          assert.equal(organization.orgRole, 'MEMBER'); assert.equal(organization.productAdmin, false)
          const base = '/organizations/' + f.organizationId
          assert.equal((await psych.api(base + '/tool-authoring-capabilities')).canAuthor, true)
          const draft = await psych.api(base + '/private-tools', 'POST', { kind: 'FORM', title: '普通心理教师合成编制' })
          const uri = base + '/private-tools/' + draft.id
          const saved = await psych.api(uri, 'PUT', { expectedRevision: draft.revision, title: draft.title, definition: f.definitions.form })
          assert.equal((await psych.api(uri + '/validate', 'POST', {})).valid, true)
          await psych.api(uri + '/freeze', 'POST', { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
          await psych.api(base + '/evaluation-targets', 'POST', { kind: 'ORGANIZATION', name: '不得提升发布权限' }, [403])
          report.coverage.push({ product: 'TEACHER', check: 'ordinary-psychology-author-real-API', compiled: true, publicationAuthorityNotElevated: true })
          await psych.close()
        }
      },
      onFailure: async (product, error) => {
        report.status = 'FAILED'
        report.errors.push({ stage, name: error.name, messageHash: sha(String(error)),
          note: 'Realm journey failed; dependent steps stopped. No raw exception is published.' })
        if (lastSafeSession?.authenticated && !lastSafeSession.page.isClosed()) {
          try {
            const unsafe = await lastSafeSession.page.locator('input[type=password],.ht-secret,.hs-secret,.ht-mfa-setup').count()
            if (!unsafe) await lastSafeSession.page.screenshot({ path: path.join(out, 'screenshots', product.toLowerCase() + '-failure.png'), fullPage: true })
          } catch { /* Preserve the original sanitized failure. */ }
        }
      },
      cleanup: async product => {
        // Never route a still-live realm page into the next realm's backend.
        let firstError
        for (const context of browser.contexts()) {
          try { await context.close() } catch (error) { firstError ||= error }
        }
        try { await stopBackend() } catch (error) { firstError ||= error }
        lastSafeSession = null
        if (firstError) { stage = product + '-realm-cleanup'; throw firstError }
      },
    })
    stage = 'realm-journey-summary'
    assert.deepEqual(completedProducts, ['SCHOOL', 'TEACHER'], 'Every realm journey must pass')
    for (const audit of [...report.sessions, ...report.ui.sessions]) {
      assert.deepEqual(audit.pageErrors, [], 'No browser application exceptions')
      assert.deepEqual(audit.unexpectedRequests, [], 'No external or cross-product traffic')
      assert.deepEqual(audit.requestFailures, [], 'No failed transport')
      // Exact expected denials were checked by each session's close method.
    }
    stage = 'final-evidence-verification'
    report.status = 'PASSED'
    verifyReport(report, { ...fixture.identity, runId: process.env.GITHUB_RUN_ID, ...report.inputs, ...buildEvidence }, file => fs.readFileSync(path.join(out, file)))
  } catch (error) {
    bodyFailed = true
    report.status = 'FAILED'; report.errors.push({ stage, name: error.name, messageHash: sha(String(error)),
      note: 'No raw auth-bearing exception/body/trace is published. Inspect the failing stage and status records.' })
    if (lastSafeSession?.authenticated && !lastSafeSession.page.isClosed()) {
      try {
        const unsafe = await lastSafeSession.page.locator('input[type=password],.ht-secret,.hs-secret,.ht-mfa-setup').count()
        if (!unsafe) await lastSafeSession.page.screenshot({ path: path.join(out, 'screenshots', 'failure.png'), fullPage: true })
      } catch { /* A broken renderer must not hide the original sanitized failure. */ }
    }
    throw new Error('School/Teacher browser acceptance failed at ' + stage + '; see sanitized evidence, not fixture secrets')
  } finally {
    // Attempt every cleanup and evidence write without replacing the primary failure.
    let cleanupFailed = false
    for (const [cleanupStage, cleanup] of [
      ['browser-close', async () => { if (browser) await browser.close() }],
      ['backend-stop', stopBackend],
    ]) {
      try { await cleanup() } catch (error) {
        cleanupFailed = true
        report.status = 'FAILED'
        report.errors.push({ stage: cleanupStage, name: 'CleanupError', messageHash: sha(String(error)),
          note: 'Cleanup failed; no raw exception is published.' })
      }
    }
    try { fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2)) } catch {
      cleanupFailed = true
      report.status = 'FAILED'
    }
    if (!bodyFailed && cleanupFailed) throw new Error('Browser acceptance cleanup or evidence publication failed')
  }
}

// Continue only independent realms, and only after successful isolation cleanup.
async function runRealmJourneys(products, { journey, onFailure, cleanup }) {
  const completed = []
  for (const product of products) {
    try {
      await journey(product)
      completed.push(product)
    } catch (error) {
      await onFailure(product, error)
    } finally {
      await cleanup(product)
    }
  }
  return completed
}

function browserCliMode(args) {
  if (args.length === 0) return 'journey'
  assert.deepEqual(args, ['--launch-diagnostic'], 'Unknown browser command; no action was started')
  return 'launch-diagnostic'
}

if (require.main === module) {
  const task = Promise.resolve().then(() => browserCliMode(process.argv.slice(2)) === 'launch-diagnostic'
    ? runLaunchDiagnostic().then(code => { process.exitCode = code }) : run())
  task.catch(error => {
    console.error('School/Teacher diagnostic or acceptance did not complete; inspect its sanitized report if present. Error digest: ' + sha(String(error)))
    process.exitCode = 1
  })
}
module.exports = { totp, backendEnvironment, validateBuildReuse, validateBuildManifest, classifyStartupLog,
  classifyBrowserLaunchError, browserLaunchEnvironment, runLaunchDiagnostic, browserCliMode, validateLaunchDiagnosticContext, verifyReport }
