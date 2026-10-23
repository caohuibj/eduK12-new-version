/* Pure tests only: in-memory files, injected subprocess/public API and fake DOM.
 * No browser, app, database, package query, process or filesystem write occurs.
 * Prepared only; run separately when the exact candidate is authorized.
 */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { CHROME_BINARY, CHROME_SANDBOX, CHROME_LAUNCH_OPTIONS, parseChromePackage,
  parseChromeVersion, ownsChromeFile, trustedExecutable, preflightChrome,
  parseChromeSandbox, verifyChromeSandbox, validateChromeEvidence } = require('./school-teacher-chrome.cjs')

const SECRET = 'synthetic-secret-that-must-never-be-serialized'
const repo = '/synthetic/repo'
const tools = path.join(repo, '.github/release-tools'), base = path.join(tools, 'node_modules/playwright-core')
const apiFile = path.join(base, 'index.js')
const packageOutput = 'google-chrome-stable\tinstall ok installed\tamd64\t123.4.5678.90-1\n'
const versionOutput = 'Google Chrome 123.4.5678.90\n'
const sandboxText = (layer = 'Namespace', pid = 'Yes', seccomp = 'Yes') =>
  `Sandbox Status\nLayer 1 Sandbox\t${layer}\nPID namespaces\t${pid}\nNetwork namespaces\tYes\nSeccomp-BPF sandbox\t${seccomp}\nSeccomp-BPF sandbox supports TSYNC\tYes\nYou are adequately sandboxed.`
const fileStat = (overrides = {}) => ({ uid: 0, mode: 0o100755, isFile: () => true,
  isSymbolicLink: () => false, isDirectory: () => false, ...overrides })
const directoryStat = () => fileStat({ mode: 0o40755, isFile: () => false, isDirectory: () => true })

function fixture() {
  const files = new Map([
    [path.join(tools, 'package.json'), JSON.stringify({ dependencies: { 'playwright-core': '1.2.3' } })],
    [path.join(tools, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
      '': { dependencies: { 'playwright-core': '1.2.3' } },
      'node_modules/playwright-core': { version: '1.2.3', integrity: 'sha512-' + 'a'.repeat(86) + '==' },
    } })],
    [path.join(base, 'package.json'), JSON.stringify({ name: 'playwright-core', version: '1.2.3', exports: { '.': { require: './index.js' } } })],
    [apiFile, '// synthetic public API source'],
  ])
  const stats = new Map(['/opt', '/opt/google', '/opt/google/chrome'].map(name => [name, directoryStat()]))
  for (const file of [CHROME_BINARY, CHROME_SANDBOX, apiFile]) stats.set(file, fileStat())
  const calls = [], realpaths = new Map()
  const state = { packageOutput, versionOutput, apiBrowserName: 'chromium', apiLoads: 0, commands: [] }
  const deps = {
    process: { platform: 'linux', arch: 'x64', getuid: () => 1001, geteuid: () => 1001 },
    fs: {
      readFileSync: file => { assert.ok(files.has(file)); return files.get(file) },
      lstatSync: file => { assert.ok(stats.has(file)); return stats.get(file) },
      realpathSync: file => realpaths.get(file) || file,
      accessSync: (file, mode) => { assert.ok([CHROME_BINARY, CHROME_SANDBOX].includes(file)); assert.equal(mode, 1) },
    },
    spawnSync: (file, args, options) => {
      calls.push({ file, args, options })
      assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' })
      assert.equal(options.shell, undefined)
      assert.equal(options.timeout, 10000)
      assert.equal(options.maxBuffer, 16384)
      if (file === '/usr/bin/dpkg-query' && args[0] === '-W') {
        assert.equal(args[2], 'google-chrome-stable')
        return { status: 0, stdout: state.packageOutput }
      }
      if (file === '/usr/bin/dpkg-query' && args[0] === '-S' && [CHROME_BINARY, CHROME_SANDBOX].includes(args[1]))
        return { status: 0, stdout: state.ownerOutput || 'google-chrome-stable: ' + args[1] + '\n' }
      assert.equal(file, CHROME_BINARY); assert.deepEqual(args, ['--version'])
      return { status: 0, stdout: state.versionOutput }
    },
    loadPlaywright: directory => {
      assert.equal(directory, base); state.apiLoads++
      return { chromium: { name: () => state.apiBrowserName, launch: () => { assert.fail('Pure preflight must never launch') } } }
    },
  }
  return { files, stats, calls, realpaths, state, deps, run: (env = { UNRELATED_SECRET: SECRET }) => preflightChrome({ repo, env, deps }) }
}

test('launch options are immutable, sandboxed Chrome with no flags or fallback', () => {
  assert.deepEqual(CHROME_LAUNCH_OPTIONS, { executablePath: CHROME_BINARY, headless: true, chromiumSandbox: true })
  assert.equal(Object.isFrozen(CHROME_LAUNCH_OPTIONS), true)
  assert.throws(() => { CHROME_LAUNCH_OPTIONS.chromiumSandbox = false }, TypeError)
})

test('strict package/version parsing accepts only installed amd64 stable Chrome', () => {
  assert.deepEqual(parseChromePackage(packageOutput), { name: 'google-chrome-stable', architecture: 'amd64',
    packageVersion: '123.4.5678.90-1', browserVersion: '123.4.5678.90' })
  assert.equal(parseChromeVersion(versionOutput), '123.4.5678.90')
  for (const value of [null, '', SECRET, packageOutput.replace('installed', 'unpacked'),
    packageOutput.replace('amd64', 'arm64'), packageOutput.replace('-stable', '-beta'),
    packageOutput + packageOutput, packageOutput.replace('123.4.5678.90-1', SECRET),
    packageOutput.replace('123.4.5678.90-1', '123.4.5678.90-privateTOKEN')]) assert.equal(parseChromePackage(value), null)
  for (const value of [null, '', SECRET, 'Chromium 123.4.5678.90\n', 'Google Chrome for Testing 123.4.5678.90\n',
    versionOutput + SECRET, versionOutput + versionOutput, 'Google Chrome 123.4\n']) assert.equal(parseChromeVersion(value), null)
})

test('package ownership cannot be supplied by a wrapper, foreign package or multiple matches', () => {
  assert.equal(ownsChromeFile('google-chrome-stable: ' + CHROME_BINARY + '\n', CHROME_BINARY), true)
  assert.equal(ownsChromeFile('google-chrome-stable:amd64: ' + CHROME_SANDBOX + '\n', CHROME_SANDBOX), true)
  for (const text of ['other-package: ' + CHROME_BINARY + '\n', 'google-chrome-stable: /usr/bin/google-chrome\n',
    'google-chrome-stable: ' + CHROME_BINARY + '\n' + SECRET, 'google-chrome-stable, other: ' + CHROME_BINARY + '\n'])
    assert.equal(ownsChromeFile(text, CHROME_BINARY), false)
  assert.equal(ownsChromeFile('google-chrome-stable: /tmp/chrome\n', '/tmp/chrome'), false)
})

test('regular executable metadata rejects symlinks, nonroot ownership and writable modes', () => {
  for (const stat of [fileStat({ uid: 1001 }), fileStat({ mode: 0o100775 }), fileStat({ mode: 0o100757 }),
    fileStat({ mode: 0o100644 }), fileStat({ isSymbolicLink: () => true }), fileStat({ isFile: () => false })])
    assert.equal(trustedExecutable(stat), false)
  assert.equal(trustedExecutable(fileStat()), true)
  assert.equal(trustedExecutable(fileStat({ mode: 0o104755 })), true)
})

test('preflight uses installed package, exact owned files and public API without private registry', () => {
  const f = fixture(), result = f.run()
  assert.equal(result.ok, true); assert.equal(result.code, 'CHROME_PREFLIGHT_READY')
  assert.equal(result.acceptance, false); assert.equal(result.browserLaunched, false)
  assert.equal(result.playwright.version, '1.2.3'); assert.equal(result.playwright.executablePath, CHROME_BINARY)
  assert.match(result.playwright.publicApiSha256, /^[a-f0-9]{64}$/)
  assert.equal(f.state.apiLoads, 1)
  assert.deepEqual(f.calls.map(call => [call.file, call.args[0]]), [
    ['/usr/bin/dpkg-query', '-W'], ['/usr/bin/dpkg-query', '-S'], ['/usr/bin/dpkg-query', '-S'], [CHROME_BINARY, '--version'],
  ])
  const json = JSON.stringify(result)
  assert.equal(json.includes(SECRET), false); assert.equal(json.includes(repo), false)
  assert.deepEqual(result.files.map(row => row.path), [CHROME_BINARY, CHROME_SANDBOX])
})

test('sandbox helper installed mode is observed, not rewritten or forced to setuid', () => {
  for (const mode of [0o100755, 0o104755]) {
    const f = fixture(); f.stats.set(CHROME_SANDBOX, fileStat({ mode }))
    const result = f.run(); assert.equal(result.ok, true)
    assert.equal(result.files[1].permissionMode, mode & 0o7777)
    assert.equal(result.files[1].setuid, (mode & 0o4000) !== 0)
  }
})

test('unsupported platform, root or environment overrides stop before any external read', () => {
  for (const facts of [{ platform: 'darwin' }, { arch: 'arm64' }, { getuid: () => 0 }, { geteuid: () => 0 }, { geteuid: undefined }]) {
    const f = fixture(); Object.assign(f.deps.process, facts)
    assert.equal(f.run().ok, false); assert.equal(f.calls.length, 0); assert.equal(f.state.apiLoads, 0)
  }
  for (const key of ['CHROME_DEVEL_SANDBOX', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NODE_OPTIONS', 'NODE_PATH']) {
    const f = fixture(), result = f.run({ [key]: SECRET })
    assert.deepEqual(result, { ok: false, code: 'CHROME_EXECUTION_OVERRIDE_PRESENT' }); assert.equal(f.calls.length, 0)
  }
})

test('bad package/version/ownership, untrusted files or path drift fail closed with fixed codes', () => {
  const cases = [
    ['CHROME_PACKAGE_NOT_INSTALLED', f => { f.state.packageOutput = SECRET }],
    ['CHROME_PACKAGE_OWNERSHIP_MISMATCH', f => { f.state.ownerOutput = SECRET }],
    ['CHROME_BINARY_VERSION_UNAVAILABLE', f => { f.state.versionOutput = SECRET }],
    ['CHROME_PACKAGE_VERSION_MISMATCH', f => { f.state.versionOutput = 'Google Chrome 123.4.5678.91\n' }],
    ['CHROME_FILE_UNTRUSTED', f => { f.stats.set(CHROME_BINARY, fileStat({ mode: 0o100777 })) }],
    ['CHROME_SANDBOX_FILE_UNTRUSTED', f => { f.stats.set(CHROME_SANDBOX, fileStat({ uid: 1001 })) }],
    ['CHROME_FILE_UNTRUSTED', f => { f.realpaths.set('/opt/google', '/tmp/' + SECRET) }],
    ['CHROME_FILE_UNTRUSTED', f => { f.realpaths.set(CHROME_BINARY, '/tmp/' + SECRET) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.state.apiBrowserName = 'firefox' }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.realpaths.set(apiFile, '/tmp/' + SECRET) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.files.delete(apiFile) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.files.set(path.join(base, 'package.json'), JSON.stringify({ name: 'playwright-core', version: '1.2.3' })) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.stats.set(apiFile, fileStat({ isSymbolicLink: () => true })) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.deps.loadPlaywright = () => ({}) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.deps.loadPlaywright = () => ({ chromium: { name: () => 'chromium' } }) }],
    ['CHROME_PLAYWRIGHT_API_UNAVAILABLE', f => { f.deps.loadPlaywright = () => { throw new Error(SECRET) } }],
  ]
  for (const [code, change] of cases) {
    const f = fixture(); change(f)
    assert.deepEqual(f.run(), { ok: false, code })
    assert.equal(JSON.stringify(f.run()).includes(SECRET), false)
  }
})

test('missing/mismatched installed package or lock fails before public API evaluation', () => {
  for (const file of [path.join(tools, 'package.json'), path.join(tools, 'package-lock.json'), path.join(base, 'package.json')]) {
    const f = fixture(); f.files.set(file, JSON.stringify({ secret: SECRET, version: '9.9.9' }))
    assert.deepEqual(f.run(), { ok: false, code: 'CHROME_PLAYWRIGHT_LOCK_MISMATCH' })
    assert.equal(f.state.apiLoads, 0)
  }
})

test('subprocess errors, timeout, nonzero status and secret output never leak', () => {
  for (const response of [{ status: 1, stdout: SECRET, stderr: SECRET }, { status: null, signal: 'SIGTERM', stdout: SECRET },
    { status: 0, error: new Error(SECRET), stdout: SECRET }, { status: 0, stdout: 'x'.repeat(16385) }]) {
    const f = fixture(); f.deps.spawnSync = () => response
    assert.deepEqual(f.run(), { ok: false, code: 'CHROME_PACKAGE_NOT_INSTALLED' })
  }
  const f = fixture(); f.deps.spawnSync = () => { throw new Error(SECRET) }
  assert.deepEqual(f.run(), { ok: false, code: 'CHROME_PACKAGE_NOT_INSTALLED' })
})

test('sandbox parser requires real Seccomp-BPF and an active layer 1, supporting current and legacy rows', () => {
  assert.deepEqual(parseChromeSandbox(sandboxText()), { ok: true, code: 'CHROME_SANDBOX_VERIFIED',
    seccompBpf: true, suidSandbox: false, pidNamespaces: true })
  assert.equal(parseChromeSandbox(sandboxText('SUID', 'No')).ok, true)
  assert.equal(parseChromeSandbox('SUID Sandbox\nYes\nPID namespaces\nYes\nSeccomp-BPF sandbox\nYes').ok, true)
  assert.equal(parseChromeSandbox('SUID Sandbox\tNo\nNamespace Sandbox\tYes\nPID namespaces\tYes\nSeccomp-BPF sandbox\tYes').ok, true)
  for (const text of ['', SECRET, sandboxText('None', 'No'), sandboxText('Namespace', 'No'), sandboxText('SUID', 'Yes', 'No'),
    sandboxText().replace('Seccomp-BPF sandbox\tYes\n', ''), sandboxText().replace('PID namespaces\tYes\n', ''),
    sandboxText().replace('Layer 1 Sandbox\tNamespace\n', ''), sandboxText().replace('Seccomp-BPF sandbox\tYes', 'Seccomp-BPF sandbox\tMaybe'),
    sandboxText() + '\nSeccomp-BPF sandbox\tYes', sandboxText() + '\nSeccomp-BPF sandbox\tNo',
    sandboxText() + '\nSUID Sandbox\tYes', sandboxText('None', 'Yes'),
    sandboxText() + '\nYou are NOT adequately sandboxed.', 'x'.repeat(16385)]) {
    const result = parseChromeSandbox(text)
    assert.equal(result.ok, false); assert.deepEqual(Object.keys(result).sort(), ['code', 'ok'])
  }
  assert.equal(JSON.stringify(parseChromeSandbox(sandboxText() + '\n' + SECRET)).includes(SECRET), false)
})

function fakeBrowser({ text = sandboxText(), url = 'chrome://sandbox/', readError = false, closeError = false } = {}) {
  const events = []
  const context = { newPage: async () => ({
    goto: async (target, options) => { assert.equal(target, 'chrome://sandbox'); assert.equal(options.timeout, 10000); events.push('goto') },
    url: () => url,
    locator: selector => { assert.equal(selector, 'body'); return { innerText: async () => {
      events.push('read'); if (readError) throw new Error(SECRET); return text
    } } },
  }), close: async () => { events.push('close'); if (closeError) throw new Error(SECRET) } }
  return { events, browser: { isConnected: () => true, newContext: async () => { events.push('context'); return context } } }
}

test('sandbox verification reads only the internal plain DOM in an isolated context and closes it', async () => {
  const f = fakeBrowser(), result = await verifyChromeSandbox(f.browser)
  assert.equal(result.ok, true); assert.deepEqual(f.events, ['context', 'goto', 'read', 'close'])
})

test('sandbox wrong URL, unavailable DOM and cleanup errors fail without exception content', async () => {
  for (const [options, code] of [
    [{ url: 'https://example.invalid/' + SECRET }, 'CHROME_SANDBOX_URL_MISMATCH'],
    [{ readError: true }, 'CHROME_SANDBOX_READ_FAILED'],
    [{ closeError: true }, 'CHROME_SANDBOX_CONTEXT_CLOSE_FAILED'],
    [{ text: SECRET }, 'CHROME_SANDBOX_STATUS_MISSING'],
  ]) {
    const f = fakeBrowser(options), result = await verifyChromeSandbox(f.browser)
    assert.deepEqual(result, { ok: false, code }); assert.equal(f.events.at(-1), 'close')
    assert.equal(JSON.stringify(result).includes(SECRET), false)
  }
})

test('report validation requires exact safe schema, package/path/mode/version facts and affirmative sandbox evidence', () => {
  const evidence = () => ({ options: { ...CHROME_LAUNCH_OPTIONS }, preflight: JSON.parse(JSON.stringify(fixture().run())),
    sandbox: { ...parseChromeSandbox(sandboxText()) } })
  assert.deepEqual(validateChromeEvidence(evidence()), { ok: true, code: 'CHROME_EVIDENCE_VERIFIED' })
  const mutations = [
    e => { e.options.chromiumSandbox = false }, e => { e.options.args = ['--no-sandbox'] },
    e => { e.options.executablePath = '/tmp/other-browser' }, e => { delete e.options.executablePath; e.options.channel = 'chrome' },
    e => { e.preflight = { ok: true } }, e => { e.preflight.code = 'READY' },
    e => { e.preflight.nonroot = false }, e => { e.preflight.acceptance = true },
    e => { e.preflight.browserLaunched = true }, e => { e.preflight.platform = 'darwin' },
    e => { e.preflight.package.name = 'chromium' }, e => { e.preflight.package.browserVersion = '999.0.0.0' },
    e => { e.preflight.files.pop() }, e => { e.preflight.files[0].path = '/tmp/' + SECRET },
    e => { e.preflight.files[0].permissionMode = 0o777 }, e => { e.preflight.files[0].setuid = true },
    e => { e.preflight.files[0].rootOwned = false }, e => { e.preflight.files[0].executable = false },
    e => { e.preflight.playwright.browserType = 'firefox' }, e => { e.preflight.playwright.publicApiSha256 = SECRET },
    e => { e.preflight.playwright.lockSha256 = SECRET }, e => { e.preflight.playwright.version = SECRET },
    e => { e.preflight.playwright.lockSha256 = [e.preflight.playwright.lockSha256] },
    e => { e.preflight.launchOptions.executablePath = '/tmp/chromium' }, e => { e.preflight.extra = SECRET },
    e => { e.sandbox = { ok: true } }, e => { e.sandbox.seccompBpf = false },
    e => { e.sandbox.pidNamespaces = false }, e => { e.sandbox.pidNamespaces = 'Yes' },
    e => { e.sandbox.raw = SECRET },
  ]
  for (const mutate of mutations) {
    const e = evidence(); mutate(e)
    assert.deepEqual(validateChromeEvidence(e), { ok: false, code: 'CHROME_EVIDENCE_INVALID' })
  }
})
