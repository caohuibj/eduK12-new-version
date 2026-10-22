/* Prepared Chrome-channel preflight, not a browser launch or installation.
 * CLI: node server-version/e2e/school-teacher-chrome.cjs preflight
 * Reads existing package/files/registry, Chrome --version and installed fontconfig; writes one
 * sanitized chrome-preflight.json. Success is NOT sandbox or journey acceptance.
 * No fallback, install, custom flags, permission changes or security changes.
 *
 * Primary references for the channel, package query and Linux sandbox rows:
 * https://playwright.dev/docs/browsers#google-chrome--microsoft-edge
 * https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/index.ts
 * https://manpages.debian.org/bookworm/dpkg/dpkg-query.1.en.html
 * https://github.com/chromium/chromium/blob/main/sandbox/linux/README.md
 * https://github.com/chromium/chromium/blob/main/chrome/browser/resources/sandbox_internals/sandbox_internals.ts
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')

const CHROME_BINARY = '/opt/google/chrome/chrome'
const CHROME_SANDBOX = '/opt/google/chrome/chrome-sandbox'
const CHROME_PACKAGE = 'google-chrome-stable'
const CHROME_LAUNCH_OPTIONS = Object.freeze({ channel: 'chrome', headless: true, chromiumSandbox: true })
const fail = code => Object.freeze({ ok: false, code })
const digest = value => createHash('sha256').update(value).digest('hex')
const safeText = (value, limit = 16384) => typeof value === 'string' && value.length <= limit

function parseChromePackage(text) {
  if (!safeText(text, 256)) return null
  // Google's stable package uses a numeric upstream version and revision. Do
  // not echo free-form distro/vendor suffixes into evidence.
  const match = /^google-chrome-stable(?::amd64)?\tinstall ok installed\tamd64\t((?:\d+:)?(\d+(?:\.\d+){3})(?:-\d+)?)\r?\n?$/.exec(text)
  return match ? { name: CHROME_PACKAGE, architecture: 'amd64', packageVersion: match[1], browserVersion: match[2] } : null
}

function parseChromeVersion(text) {
  if (!safeText(text, 128)) return null
  return /^Google Chrome (\d+(?:\.\d+){3})[ \t]*\r?\n?$/.exec(text)?.[1] || null
}

function ownsChromeFile(text, file) {
  if (![CHROME_BINARY, CHROME_SANDBOX].includes(file) || !safeText(text, 256)) return false
  return text === CHROME_PACKAGE + ': ' + file + '\n' || text === CHROME_PACKAGE + ':amd64: ' + file + '\n'
}

function trustedExecutable(stat) {
  return !!stat && stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 &&
    Number.isSafeInteger(stat.mode) && (stat.mode & 0o111) !== 0 && (stat.mode & 0o022) === 0
}

function preflightChrome({ repo = path.resolve(__dirname, '../..'), env = process.env, deps = {} } = {}) {
  // Injection is for pure tests. Production callers supply only repo/env.
  const io = deps.fs || fs, run = deps.spawnSync || spawnSync, facts = deps.process || process
  const loadRegistry = deps.loadRegistry || (file => require(file).registry)
  let code = 'CHROME_PREFLIGHT_INPUT_INVALID'
  try {
    if (typeof repo !== 'string' || !path.isAbsolute(repo) || !env || typeof env !== 'object') return fail(code)
    if (facts.platform !== 'linux' || facts.arch !== 'x64') return fail('CHROME_PLATFORM_UNSUPPORTED')
    const uid = facts.getuid?.(), euid = facts.geteuid?.()
    if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(euid) || uid <= 0 || euid <= 0) return fail('CHROME_NONROOT_REQUIRED')
    // Do not silently inherit an alternate helper or executable/library hook.
    if (['CHROME_DEVEL_SANDBOX', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NODE_OPTIONS', 'NODE_PATH'].some(key => env[key]))
      return fail('CHROME_EXECUTION_OVERRIDE_PRESENT')
    const query = (file, args) => {
      const result = run(file, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
        stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } })
      if (!result || result.error || result.signal || result.status !== 0 || !safeText(result.stdout)) throw new Error('QUERY_FAILED')
      return result.stdout
    }
    code = 'CHROME_PACKAGE_NOT_INSTALLED'
    const pkg = parseChromePackage(query('/usr/bin/dpkg-query', ['-W', '-f=${binary:Package}\t${Status}\t${Architecture}\t${Version}\n', CHROME_PACKAGE]))
    if (!pkg) return fail(code)

    code = 'CHROME_FILE_UNTRUSTED'
    for (const directory of ['/opt', '/opt/google', '/opt/google/chrome']) {
      const stat = io.lstatSync(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || io.realpathSync(directory) !== directory)
        return fail(code)
    }
    const files = []
    for (const file of [CHROME_BINARY, CHROME_SANDBOX]) {
      code = file === CHROME_BINARY ? 'CHROME_FILE_UNTRUSTED' : 'CHROME_SANDBOX_FILE_UNTRUSTED'
      const stat = io.lstatSync(file)
      if (!trustedExecutable(stat) || io.realpathSync(file) !== file) return fail(code)
      io.accessSync(file, fs.constants.X_OK)
      code = 'CHROME_PACKAGE_OWNERSHIP_MISMATCH'
      if (!ownsChromeFile(query('/usr/bin/dpkg-query', ['-S', file]), file)) return fail(code)
      files.push({ path: file, rootOwned: true, executable: true, groupOrWorldWritable: false,
        permissionMode: stat.mode & 0o7777, setuid: (stat.mode & 0o4000) !== 0 })
    }
    // A namespace sandbox may be selected without using the setuid helper.
    // Observe its installed mode, never assume 4755 or change it.
    code = 'CHROME_BINARY_VERSION_UNAVAILABLE'
    const browserVersion = parseChromeVersion(query(CHROME_BINARY, ['--version']))
    if (!browserVersion) return fail(code)
    if (browserVersion !== pkg.browserVersion) return fail('CHROME_PACKAGE_VERSION_MISMATCH')

    code = 'CHROME_PLAYWRIGHT_LOCK_MISMATCH'
    const root = io.realpathSync(repo)
    const tools = path.join(root, '.github/release-tools'), base = path.join(tools, 'node_modules/playwright-core')
    const lockText = io.readFileSync(path.join(tools, 'package-lock.json'), 'utf8')
    const lock = JSON.parse(lockText), declared = JSON.parse(io.readFileSync(path.join(tools, 'package.json'), 'utf8'))
    const installed = JSON.parse(io.readFileSync(path.join(base, 'package.json'), 'utf8'))
    const locked = lock.packages?.['node_modules/playwright-core']
    if (installed.name !== 'playwright-core' || !/^\d+\.\d+\.\d+$/.test(installed.version) ||
        locked?.version !== installed.version || declared.dependencies?.['playwright-core'] !== installed.version ||
        lock.packages?.['']?.dependencies?.['playwright-core'] !== installed.version ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(locked.integrity || '')) return fail(code)
    code = 'CHROME_CHANNEL_REGISTRY_UNAVAILABLE'
    const registryFile = path.join(base, 'lib/server/registry/index.js')
    if (io.realpathSync(base) !== base || io.realpathSync(registryFile) !== registryFile || !io.lstatSync(registryFile).isFile()) return fail(code)
    const registrySource = io.readFileSync(registryFile, 'utf8')
    // Read this installed, lock-version-matched registry, not bundled Chromium's
    // chromium.executablePath(), a shell wrapper, PATH lookup or a guessed path.
    const channel = loadRegistry(registryFile)?.findExecutable('chrome')
    if (channel?.name !== 'chrome' || channel.browserName !== 'chromium' || typeof channel.executablePath !== 'function') return fail(code)
    code = 'CHROME_CHANNEL_PATH_MISMATCH'
    const channelPath = channel.executablePath()
    if (channelPath !== CHROME_BINARY || io.realpathSync(channelPath) !== CHROME_BINARY) return fail(code)
    return Object.freeze({ ok: true, code: 'CHROME_PREFLIGHT_READY', schemaVersion: 1,
      scope: 'preinstalled-chrome-preflight', acceptance: false, browserLaunched: false,
      platform: 'linux', architecture: 'x64', nonroot: true, package: pkg, files,
      playwright: { version: installed.version, channel: 'chrome', executablePath: CHROME_BINARY,
        lockSha256: digest(lockText), registrySha256: digest(registrySource) }, launchOptions: CHROME_LAUNCH_OPTIONS })
  } catch { return fail(code) }
}

function parseChromeSandbox(text) {
  if (!safeText(text)) return fail('CHROME_SANDBOX_STATUS_INVALID')
  const rows = new Map(), lines = text.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean)
  const labels = /^(Layer 1 Sandbox|SUID [Ss]andbox|Namespace Sandbox|PID namespaces|Seccomp-BPF sandbox supports TSYNC|Seccomp-BPF sandbox)(?:[ \t]+(.+))?$/
  for (let i = 0; i < lines.length; i++) {
    const match = labels.exec(lines[i])
    if (!match) continue
    const key = match[1] === 'SUID sandbox' ? 'SUID Sandbox' : match[1]
    const value = match[2] === undefined ? lines[++i] : match[2]
    if (rows.has(key) || !value) return fail('CHROME_SANDBOX_STATUS_AMBIGUOUS')
    rows.set(key, value.trim())
  }
  for (const [key, value] of rows) {
    if (!(key === 'Layer 1 Sandbox' ? ['SUID', 'Namespace', 'None'] : ['Yes', 'No']).includes(value))
      return fail('CHROME_SANDBOX_STATUS_AMBIGUOUS')
  }
  if (!rows.has('Seccomp-BPF sandbox') || !rows.has('PID namespaces') ||
      (!rows.has('Layer 1 Sandbox') && !rows.has('SUID Sandbox'))) return fail('CHROME_SANDBOX_STATUS_MISSING')
  const layer = rows.get('Layer 1 Sandbox'), legacySuid = rows.get('SUID Sandbox'), namespace = rows.get('Namespace Sandbox')
  if ((layer && legacySuid && (layer === 'SUID') !== (legacySuid === 'Yes')) ||
      (layer === 'None' && (namespace === 'Yes' || rows.get('PID namespaces') === 'Yes')) ||
      (layer === 'Namespace' && namespace === 'No') ||
      (legacySuid === 'No' && namespace === 'No' && rows.get('PID namespaces') === 'Yes')) return fail('CHROME_SANDBOX_STATUS_AMBIGUOUS')
  const suidSandbox = layer === 'SUID' || legacySuid === 'Yes'
  const pidNamespaces = rows.get('PID namespaces') === 'Yes'
  const seccompBpf = rows.get('Seccomp-BPF sandbox') === 'Yes'
  if (!seccompBpf || (!suidSandbox && !pidNamespaces)) return fail('CHROME_SANDBOX_NOT_ACTIVE')
  if (lines.includes('You are NOT adequately sandboxed.')) return fail('CHROME_SANDBOX_NOT_ACTIVE')
  return Object.freeze({ ok: true, code: 'CHROME_SANDBOX_VERIFIED', seccompBpf, suidSandbox, pidNamespaces })
}

async function verifyChromeSandbox(browser) {
  let context, result = fail('CHROME_SANDBOX_READ_FAILED')
  try {
    if (!browser || browser.isConnected() !== true) return result
    // A fresh context has no application routing, authentication or page content.
    context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('chrome://sandbox', { waitUntil: 'domcontentloaded', timeout: 10000 })
    if (!['chrome://sandbox', 'chrome://sandbox/'].includes(page.url())) return fail('CHROME_SANDBOX_URL_MISMATCH')
    result = parseChromeSandbox(await page.locator('body').innerText({ timeout: 5000 }))
  } catch { result = fail('CHROME_SANDBOX_READ_FAILED') }
  finally {
    if (context) { try { await context.close() } catch { result = fail('CHROME_SANDBOX_CONTEXT_CLOSE_FAILED') } }
  }
  return result
}

function validateChromeEvidence({ options, preflight, sandbox } = {}) {
  // Pure report-shape validation, not an attestation of the current host. The
  // caller must produce this evidence anew in the same job as the actual launch.
  const record = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
  const launch = value => record(value, ['channel', 'headless', 'chromiumSandbox']) &&
    value.channel === 'chrome' && value.headless === true && value.chromiumSandbox === true
  try {
    if (!launch(options) || !record(preflight, ['ok', 'code', 'schemaVersion', 'scope', 'acceptance', 'browserLaunched',
      'platform', 'architecture', 'nonroot', 'package', 'files', 'playwright', 'launchOptions']) ||
      preflight.ok !== true || preflight.code !== 'CHROME_PREFLIGHT_READY' || preflight.schemaVersion !== 1 ||
      preflight.scope !== 'preinstalled-chrome-preflight' || preflight.acceptance !== false || preflight.browserLaunched !== false ||
      preflight.platform !== 'linux' || preflight.architecture !== 'x64' || preflight.nonroot !== true || !launch(preflight.launchOptions))
      return fail('CHROME_EVIDENCE_INVALID')
    const pkg = preflight.package
    if (!record(pkg, ['name', 'architecture', 'packageVersion', 'browserVersion']) || pkg.name !== CHROME_PACKAGE ||
      pkg.architecture !== 'amd64' || typeof pkg.packageVersion !== 'string' || typeof pkg.browserVersion !== 'string' ||
      parseChromePackage(CHROME_PACKAGE + '\tinstall ok installed\tamd64\t' + pkg.packageVersion + '\n')?.browserVersion !== pkg.browserVersion)
      return fail('CHROME_EVIDENCE_INVALID')
    if (!Array.isArray(preflight.files) || preflight.files.length !== 2) return fail('CHROME_EVIDENCE_INVALID')
    for (const [i, file] of preflight.files.entries()) {
      if (!record(file, ['path', 'rootOwned', 'executable', 'groupOrWorldWritable', 'permissionMode', 'setuid']) ||
        file.path !== [CHROME_BINARY, CHROME_SANDBOX][i] || file.rootOwned !== true || file.executable !== true ||
        file.groupOrWorldWritable !== false || !Number.isSafeInteger(file.permissionMode) || file.permissionMode < 0 ||
        file.permissionMode > 0o7777 || (file.permissionMode & 0o022) !== 0 || (file.permissionMode & 0o111) === 0 ||
        file.setuid !== ((file.permissionMode & 0o4000) !== 0)) return fail('CHROME_EVIDENCE_INVALID')
    }
    const pw = preflight.playwright
    if (!record(pw, ['version', 'channel', 'executablePath', 'lockSha256', 'registrySha256']) ||
      typeof pw.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pw.version) || pw.channel !== 'chrome' || pw.executablePath !== CHROME_BINARY ||
      typeof pw.lockSha256 !== 'string' || typeof pw.registrySha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(pw.lockSha256) || !/^[a-f0-9]{64}$/.test(pw.registrySha256)) return fail('CHROME_EVIDENCE_INVALID')
    if (!record(sandbox, ['ok', 'code', 'seccompBpf', 'suidSandbox', 'pidNamespaces']) ||
      sandbox.ok !== true || sandbox.code !== 'CHROME_SANDBOX_VERIFIED' || sandbox.seccompBpf !== true ||
      typeof sandbox.suidSandbox !== 'boolean' || typeof sandbox.pidNamespaces !== 'boolean' ||
      !(sandbox.suidSandbox || sandbox.pidNamespaces)) return fail('CHROME_EVIDENCE_INVALID')
    return Object.freeze({ ok: true, code: 'CHROME_EVIDENCE_VERIFIED' })
  } catch { return fail('CHROME_EVIDENCE_INVALID') }
}

// Fixed visible Chinese samples only. This is missing-glyph evidence, not a
// brand-font requirement or proof for every Unicode character in the product.
// CSS.getPlatformFontsForNode reports actual platform font usage, not glyph IDs.
// Cross-check its PostScript identities against installed font charset coverage.
const CJK_SAMPLES = Object.freeze({
  'school-serif': Object.freeze({ text: '校园账号登录' }),
  'school-sans': Object.freeze({ text: '用户名' }),
  'teacher-serif': Object.freeze({ text: '从每一次思考，' }),
  'teacher-sans': Object.freeze({ text: '教育账号' }),
})
const FONT_LIST = '/usr/bin/fc-list'
const FONT_FORMAT = '%{postscriptname}\t%{file}\t%{index}\t%{charset}\n'
const FONT_ROOT = '/usr/share/fonts'
const FONT_MAX_OUTPUT = 4 * 1024 * 1024
const FONT_MAX_ROWS = 2048
const FONT_MAX_SIZE = 64 * 1024 * 1024
const FONT_ENV_KEYS = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CONFIG_DIRS', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_DATA_DIRS',
  'FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'FONTCONFIG_SYSROOT']
const fontRecord = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const safePostScriptName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,126}$/.test(name)
const safeFontPath = file => typeof file === 'string' && file.length <= 512 &&
  file.startsWith(FONT_ROOT + '/') && /^[A-Za-z0-9_./ +\-]+$/.test(file) && path.posix.normalize(file) === file &&
  /\.(?:otf|ttf|ttc|otc)$/i.test(file)

function validFontCharset(ranges) {
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 4096) return false
  let end = -1
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) ||
        range[0] <= end || range[0] < 0 || range[1] < range[0] || range[1] > 0x10ffff ||
        (range[0] <= 0xdfff && range[1] >= 0xd800)) return false
    end = range[1]
  }
  return true
}

function parseFontCharset(text) {
  if (!safeText(text, 65536) || !text.trim()) return null
  const ranges = text.trim().split(/ +/).map(token => {
    if (!/^[0-9a-fA-F]{1,6}(?:-[0-9a-fA-F]{1,6})?$/.test(token)) return null
    const pair = token.split('-').map(value => Number.parseInt(value, 16))
    return [pair[0], pair.length === 1 ? pair[0] : pair[1]]
  })
  return validFontCharset(ranges) ? ranges : null
}

const fontCovers = (font, text) => Array.from(text, char => char.codePointAt(0)).every(point =>
  font.charset.some(([start, end]) => point >= start && point <= end))

function validateCjkInventory(inventory) {
  // Pure shape/coverage verification only. It does not attest to this machine;
  // inspectCjkFonts must run in the same job as the actual sandboxed Chrome.
  try {
    if (!fontRecord(inventory, ['ok', 'code', 'schemaVersion', 'scope', 'acceptance', 'browserLaunched', 'fonts']) ||
        inventory.ok !== true || inventory.code !== 'CJK_FONT_PREFLIGHT_READY' || inventory.schemaVersion !== 1 ||
        inventory.scope !== 'preinstalled-cjk-fonts' || inventory.acceptance !== false || inventory.browserLaunched !== false ||
        !Array.isArray(inventory.fonts) || !inventory.fonts.length || inventory.fonts.length > FONT_MAX_ROWS)
      return fail('CJK_INVENTORY_INVALID')
    const names = new Set()
    for (const font of inventory.fonts) {
      if (!fontRecord(font, ['postScriptName', 'path', 'faceIndex', 'charset', 'rootOwned', 'groupOrWorldWritable', 'permissionMode', 'sizeBytes']) ||
          !safePostScriptName(font.postScriptName) || names.has(font.postScriptName) || !safeFontPath(font.path) ||
          !Number.isSafeInteger(font.faceIndex) || font.faceIndex < 0 || font.faceIndex > 0x7fffffff ||
          !validFontCharset(font.charset) || !Object.values(CJK_SAMPLES).some(sample => fontCovers(font, sample.text)) ||
          font.rootOwned !== true || font.groupOrWorldWritable !== false ||
          !Number.isSafeInteger(font.permissionMode) || font.permissionMode < 0 || font.permissionMode > 0o777 ||
          (font.permissionMode & 0o022) !== 0 || (font.permissionMode & 0o444) === 0 ||
          !Number.isSafeInteger(font.sizeBytes) || font.sizeBytes <= 0 || font.sizeBytes > FONT_MAX_SIZE)
        return fail('CJK_INVENTORY_INVALID')
      names.add(font.postScriptName)
    }
    if (Object.values(CJK_SAMPLES).some(sample => !inventory.fonts.some(font => fontCovers(font, sample.text))))
      return fail('CJK_INVENTORY_COVERAGE_UNPROVEN')
    return Object.freeze({ ok: true, code: 'CJK_INVENTORY_VERIFIED' })
  } catch { return fail('CJK_INVENTORY_INVALID') }
}

function inspectCjkFonts({ env = process.env, deps = {} } = {}) {
  const io = deps.fs || fs, run = deps.spawnSync || spawnSync
  let code = 'CJK_FONT_ENV_INVALID'
  try {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return fail(code)
    const queryEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }
    for (const key of FONT_ENV_KEYS) if (Object.hasOwn(env, key)) {
      if (typeof env[key] !== 'string') return fail(code)
      queryEnv[key] = env[key]
    }
    // Retain Chrome's font-configuration scope, without forwarding unrelated
    // secrets or executable/library hooks. Never print these values as evidence.
    code = 'CJK_FONT_TOOL_UNTRUSTED'
    const trustedDirectories = new Set()
    const directory = name => {
      if (trustedDirectories.has(name)) return
      const stat = io.lstatSync(name)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 ||
          !Number.isSafeInteger(stat.mode) || (stat.mode & 0o022) !== 0 || io.realpathSync(name) !== name)
        throw new Error('UNTRUSTED_DIRECTORY')
      trustedDirectories.add(name)
    }
    for (const name of ['/usr', '/usr/bin']) directory(name)
    if (!trustedExecutable(io.lstatSync(FONT_LIST)) || io.realpathSync(FONT_LIST) !== FONT_LIST) return fail(code)
    code = 'CJK_FONT_QUERY_FAILED'
    const result = run(FONT_LIST, ['--format', FONT_FORMAT], { encoding: 'utf8', timeout: 10000,
      maxBuffer: FONT_MAX_OUTPUT, stdio: ['ignore', 'pipe', 'pipe'],
      env: queryEnv })
    if (!result || result.error || result.signal || result.status !== 0 ||
        !safeText(result.stdout, FONT_MAX_OUTPUT) || !result.stdout.endsWith('\n')) return fail(code)
    code = 'CJK_FONT_INVENTORY_INVALID'
    const rows = result.stdout.slice(0, -1).split('\n')
    if (!rows.length || rows.length > FONT_MAX_ROWS) return fail(code)
    const fonts = [], names = new Map(), identities = new Map(), conflictingNames = new Set()
    for (const row of rows) {
      const fields = row.split('\t')
      if (fields.length !== 4) return fail(code)
      const [postScriptName, file, index, chars] = fields, charset = parseFontCharset(chars)
      if (!charset) return fail(code)
      // Even an otherwise irrelevant face can shadow a candidate's PostScript
      // identity. Track all valid names before filtering out non-CJK faces.
      if (safePostScriptName(postScriptName)) {
        const identity = JSON.stringify([file, index, charset])
        if (identities.has(postScriptName) && identities.get(postScriptName) !== identity)
          conflictingNames.add(postScriptName)
        else identities.set(postScriptName, identity)
      }
      // Ignore irrelevant Latin/bitmap/emoji faces before examining identity or
      // paths. Only fonts capable of a complete fixed sample enter this gate.
      if (!Object.values(CJK_SAMPLES).some(sample => fontCovers({ charset }, sample.text))) continue
      if (!safePostScriptName(postScriptName) || !safeFontPath(file) || !/^(?:0|[1-9]\d{0,9})$/.test(index) ||
          Number(index) > 0x7fffffff) return fail(code)
      code = 'CJK_FONT_FILE_UNTRUSTED'
      for (let parent = path.dirname(file); parent !== '/'; parent = path.dirname(parent)) directory(parent)
      const stat = io.lstatSync(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || io.realpathSync(file) !== file ||
          !Number.isSafeInteger(stat.mode) || (stat.mode & 0o7022) !== 0 || (stat.mode & 0o444) === 0 ||
          !Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.size > FONT_MAX_SIZE) return fail(code)
      const font = { postScriptName, path: file, faceIndex: Number(index), charset,
        rootOwned: true, groupOrWorldWritable: false, permissionMode: stat.mode & 0o777, sizeBytes: stat.size }
      code = 'CJK_FONT_IDENTITY_AMBIGUOUS'
      if (names.has(postScriptName)) {
        if (JSON.stringify(names.get(postScriptName)) !== JSON.stringify(font)) return fail(code)
      } else { names.set(postScriptName, font); fonts.push(font) }
      code = 'CJK_FONT_INVENTORY_INVALID'
    }
    if (fonts.some(font => conflictingNames.has(font.postScriptName))) return fail('CJK_FONT_IDENTITY_AMBIGUOUS')
    fonts.sort((a, b) => a.postScriptName < b.postScriptName ? -1 : a.postScriptName > b.postScriptName ? 1 : 0)
    const inventory = Object.freeze({ ok: true, code: 'CJK_FONT_PREFLIGHT_READY', schemaVersion: 1,
      scope: 'preinstalled-cjk-fonts', acceptance: false, browserLaunched: false, fonts })
    const validated = validateCjkInventory(inventory)
    return validated.ok ? inventory : validated
  } catch { return fail(code) }
}

function validateRenderedCjk(sampleId, fonts, inventory) {
  try {
    if (typeof sampleId !== 'string' || !Object.hasOwn(CJK_SAMPLES, sampleId) || !validateCjkInventory(inventory).ok ||
        !Array.isArray(fonts) || !fonts.length || fonts.length > 8) return fail('CJK_RENDERED_EVIDENCE_INVALID')
    const sample = CJK_SAMPLES[sampleId], names = new Set()
    let glyphs = 0
    for (const rendered of fonts) {
      if (!fontRecord(rendered, ['postScriptName', 'isCustomFont', 'glyphCount']) ||
          !safePostScriptName(rendered.postScriptName) || names.has(rendered.postScriptName) ||
          rendered.isCustomFont !== false || !Number.isSafeInteger(rendered.glyphCount) || rendered.glyphCount <= 0 ||
          rendered.glyphCount > 128) return fail('CJK_RENDERED_EVIDENCE_INVALID')
      names.add(rendered.postScriptName)
      const font = inventory.fonts.find(row => row.postScriptName === rendered.postScriptName)
      // Conservative by design: CDP does not map glyph IDs to characters. Every
      // used face must cover the entire fixed sample, including the comma.
      // A legitimate split-font case may be unproven; never call it tofu.
      if (!font || !fontCovers(font, sample.text)) return fail('CJK_RENDERED_COVERAGE_UNPROVEN')
      glyphs += rendered.glyphCount
    }
    // These fixed samples contain only BMP Han characters and one punctuation
    // character, with no spaces, combining marks, surrogate pairs or ligatures.
    if (glyphs !== Array.from(sample.text).length) return fail('CJK_RENDERED_GLYPH_COUNT_UNPROVEN')
    return Object.freeze({ ok: true, code: 'CJK_RENDERED_VERIFIED' })
  } catch { return fail('CJK_RENDERED_EVIDENCE_INVALID') }
}

function writePreflightEvidence(repo, report) {
  const root = fs.realpathSync(repo), directory = path.join(root, 'school-teacher-evidence')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory) throw new Error('EVIDENCE_DIRECTORY_INVALID')
  const file = path.join(directory, 'chrome-preflight.json')
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('EVIDENCE_FILE_INVALID')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n') } finally { fs.closeSync(fd) }
}

if (require.main === module) {
  let result
  if (process.argv.length !== 3 || process.argv[2] !== 'preflight') {
    result = fail('CHROME_PREFLIGHT_COMMAND_INVALID'); process.exitCode = 2
  } else {
    const repo = path.resolve(__dirname, '../..')
    result = { schemaVersion: 1, scope: 'chrome-and-cjk-preflight', acceptance: false,
      chrome: preflightChrome({ repo }), fonts: inspectCjkFonts() }
    try { writePreflightEvidence(repo, result) } catch { result = fail('CHROME_PREFLIGHT_EVIDENCE_WRITE_FAILED') }
    // Missing font evidence must not prevent the independent business journey.
    // Final report acceptance still requires complete CJK rendering evidence.
    process.exitCode = result.chrome?.ok === true ? 0 : 1
  }
  process.stdout.write(JSON.stringify(result) + '\n')
}

module.exports = { CHROME_BINARY, CHROME_SANDBOX, CHROME_LAUNCH_OPTIONS, parseChromePackage,
  parseChromeVersion, ownsChromeFile, trustedExecutable, preflightChrome, parseChromeSandbox, verifyChromeSandbox, validateChromeEvidence,
  CJK_SAMPLES, inspectCjkFonts, validateCjkInventory, validateRenderedCjk }
