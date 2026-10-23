/* Pure, injected resume-delta tests only. No real commands, fonts, browser,
 * services, permissions or filesystem writes. Prepared; not executed here. */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { CHROME_BINARY, preflightChrome, inspectCjkFonts, validateCjkInventory,
  validateRenderedCjk, CJK_SAMPLES } = require('./school-teacher-chrome.cjs')

const SECRET = 'synthetic-private-value'
const HOME = '/synthetic-home/runner', REPO = '/synthetic/repo'
const SUFFIX = '.local/share/fonts/school-teacher-ci/wqy-zenhei.ttc', FONT = HOME + '/' + SUFFIX
const RECEIPT = REPO + '/school-teacher-evidence/official-font-preparation.json'
const HEAD = 'a'.repeat(40), RUN = '12345678'
const bytes = Buffer.from('synthetic-font-bytes-not-a-real-font')
const digest = value => createHash('sha256').update(value).digest('hex')
const stat = (changes = {}) => ({ uid: 0, gid: 0, mode: 0o100755, size: 4096, nlink: 1,
  isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, ...changes })
const directory = (changes = {}) => stat({ mode: 0o40755, isFile: () => false, isDirectory: () => true, ...changes })
const line = (file = FONT, charset = '4e00-9fff ff0c', name = 'SyntheticPreparedCjk') => `${name}\t${file}\t0\t${charset}\n`

function chromeFixture() {
  const calls = [], reads = [], stats = new Map(), faults = new Map()
  const state = { header: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), closed: 0, errorCode: SECRET }
  const fault = () => Object.assign(new Error(SECRET), { code: state.errorCode })
  const deps = {
    process: { platform: 'linux', arch: 'x64', getuid: () => 1001, geteuid: () => 1001 },
    fs: {
      lstatSync(file) { if (faults.get('lstat') === file) throw fault()
        return stats.get(file) || (file === CHROME_BINARY ? stat() : directory()) },
      realpathSync(file) { if (faults.get('realpath') === file) throw fault(); return file },
      accessSync(file) { if (faults.get('access') === file) throw fault() },
      openSync(file) { assert.equal(file, CHROME_BINARY); return 9 },
      readSync(fd, buffer, offset, length, position) {
        assert.equal(fd, 9); assert.equal(offset, 0); assert.equal(length, 4); assert.equal(position, 0)
        reads.push(length); state.header.copy(buffer, offset, 0, length); return Math.min(length, state.header.length)
      },
      closeSync(fd) { assert.equal(fd, 9); state.closed++ },
    },
    spawnSync(file, args) {
      calls.push([file, args]); assert.equal(file, '/usr/bin/dpkg-query')
      assert.equal(args[0], '-W')
      return { status: 0, stdout: 'google-chrome-stable\tinstall ok installed\tamd64\t123.4.5678.90-1\n' }
    },
    loadRegistry() { assert.fail('Untrusted Chrome must never load its registry') },
  }
  return { calls, reads, stats, faults, state, run: (diagnostics = true) => preflightChrome({ repo: REPO, env: {}, diagnostics, deps }) }
}

function fontFixture() {
  const calls = [], stats = new Map(), realpaths = new Map()
  const receipt = { schemaVersion: 1, scope: 'official-cjk-font-preparation', currentHead: HEAD, ciRunId: RUN,
    package: 'fonts-wqy-zenhei', version: '0.9.45-8', architecture: 'all',
    metadataSource: 'apt-cache:fonts-wqy-zenhei=0.9.45-8',
    packageUrl: 'https://archive.ubuntu.com/ubuntu/pool/universe/f/fonts-wqy-zenhei/fonts-wqy-zenhei_0.9.45-8_all.deb',
    debSha256: 'b'.repeat(64), copiedFontSha256: digest(bytes), relativeSuffix: SUFFIX }
  const env = { HOME, GITHUB_SHA: HEAD, GITHUB_RUN_ID: RUN, UNRELATED_SECRET: SECRET, XDG_CACHE_HOME: HOME + '/cache' }
  const state = { stdout: line(), bytes, missingReceipt: false }
  const deps = {
    process: { getuid: () => 1001, geteuid: () => 1001 },
    fs: {
      lstatSync(file) {
        if (state.missingReceipt && file === RECEIPT) throw new Error(SECRET)
        if (stats.has(file)) return stats.get(file)
        if (file === '/usr/bin/fc-list') return stat()
        if (file === FONT) return stat({ uid: 1001, mode: 0o100644, size: state.bytes.length })
        if (file === RECEIPT) return stat({ uid: 1001, mode: 0o100600, size: JSON.stringify(receipt).length })
        return directory({ uid: file === HOME || file.startsWith(HOME + '/') ? 1001 : 0 })
      },
      realpathSync: file => realpaths.get(file) || file,
      readFileSync(file) {
        if (file === RECEIPT) return JSON.stringify(receipt)
        assert.equal(file, FONT); return state.bytes
      },
    },
    spawnSync(file, args, options) {
      assert.equal(file, '/usr/bin/fc-list'); calls.push({ file, args, options })
      return { status: 0, stdout: state.stdout }
    },
  }
  return { calls, stats, realpaths, receipt, env, state, deps, run: () => inspectCjkFonts({ repo: REPO, env, deps }) }
}

test('Chrome fixed-path directory failures preserve trust and have safe numeric diagnostics', () => {
  const f = chromeFixture(); f.stats.set('/opt/google', directory({ gid: 77, mode: 0o40775 }))
  const result = f.run()
  assert.deepEqual(result, { ok: false, code: 'CHROME_FILE_UNTRUSTED', diagnostic: {
    target: '/opt/google', operation: 'lstat', reason: 'GROUP_OR_WORLD_WRITABLE', uid: 0, gid: 77,
    permissionMode: 0o775, fileHeaderKind: 'OTHER', headerRead: 'NOT_APPLICABLE' } })
  assert.equal(f.calls.length, 1); assert.equal(f.reads.length, 0)
  assert.deepEqual(f.run(false), { ok: false, code: 'CHROME_FILE_UNTRUSTED' })
})

test('Chrome lstat realpath and access failures read at most four header bytes and never execute Chrome', () => {
  for (const [operation, header, expected] of [['lstat', Buffer.from('other-private'), 'OTHER'],
    ['realpath', Buffer.from('#!/secret'), 'SCRIPT'], ['access', Buffer.from([0x7f, 0x45, 0x4c, 0x46]), 'ELF']]) {
    const f = chromeFixture(); f.faults.set(operation, CHROME_BINARY); f.state.header = header
    const result = f.run()
    assert.equal(result.ok, false); assert.equal(result.diagnostic.target, CHROME_BINARY)
    assert.equal(result.diagnostic.operation, operation); assert.equal(result.diagnostic.reason, 'READ_OR_ACCESS_FAILED')
    assert.equal(result.diagnostic.osErrorCode, 'UNKNOWN')
    assert.equal(result.diagnostic.fileHeaderKind, expected)
    assert.equal(f.calls.length, 1); assert.equal(f.reads.length, operation === 'lstat' ? 0 : 1)
    assert.equal(f.state.closed, f.reads.length); assert.equal(JSON.stringify(result).includes(SECRET), false)
  }
  const f = chromeFixture(); f.stats.set(CHROME_BINARY, stat({ uid: 1001 }))
  assert.equal(f.run().diagnostic.reason, 'NOT_ROOT_OWNED'); assert.equal(f.calls.length, 1)
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR', 'EIO']) {
    const failure = chromeFixture(); failure.faults.set('lstat', CHROME_BINARY); failure.state.errorCode = code
    assert.equal(failure.run().diagnostic.osErrorCode, code)
    assert.deepEqual(failure.run(false), { ok: false, code: 'CHROME_FILE_UNTRUSTED' })
  }
})

test('zero candidates are explicit and reuse the single fontconfig result', () => {
  for (const stdout of ['', line('/private/irrelevant.pcf.gz', '20-7e')]) {
    const f = fontFixture(); f.state.stdout = stdout
    assert.deepEqual(f.run(), { ok: false, code: 'CJK_INVENTORY_INVALID', diagnostic: {
      stage: 'final-inventory-validation', parsedRowCount: stdout ? 1 : 0, candidateFontCount: 0 } })
    assert.equal(f.calls.length, 1)
  }
})

test('only the prepared official exact file is admitted without exposing HOME or pretending root ownership', () => {
  const f = fontFixture(), inventory = f.run(), binding = { currentHead: HEAD, ciRunId: RUN }
  assert.equal(inventory.ok, true); assert.equal(f.calls.length, 1)
  assert.equal(inventory.fonts[0].path, SUFFIX); assert.equal(inventory.fonts[0].rootOwned, false)
  assert.deepEqual(inventory.fonts[0].preparedFont, { receipt: f.receipt, ownerUid: 1001 })
  assert.equal(validateCjkInventory(inventory, binding).ok, true)
  assert.equal(validateCjkInventory(inventory, { ...binding, ciRunId: '12345679' }).ok, false)
  assert.deepEqual(f.calls[0].options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', HOME,
    XDG_CACHE_HOME: HOME + '/cache' })
  assert.equal(JSON.stringify(inventory).includes(HOME), false); assert.equal(JSON.stringify(inventory).includes(SECRET), false)
  for (const [id, sample] of Object.entries(CJK_SAMPLES)) assert.equal(validateRenderedCjk(id,
    [{ postScriptName: 'SyntheticPreparedCjk', isCustomFont: false, glyphCount: Array.from(sample.text).length }], inventory).ok, true)
})

test('prepared receipt run source package and actual SHA mismatches fail closed', () => {
  for (const change of [f => { f.receipt.currentHead = 'c'.repeat(40) }, f => { f.receipt.ciRunId = '98765432' },
    f => { f.receipt.version = '0.9.45-9' }, f => { f.receipt.packageUrl = 'https://untrusted.invalid/font.deb' },
    f => { f.receipt.metadataSource = SECRET }, f => { f.receipt.relativeSuffix = '.local/share/fonts/other.ttc' },
    f => { f.receipt.copiedFontSha256 = 'd'.repeat(64) }, f => { f.state.bytes = Buffer.from('changed') },
    f => { f.state.missingReceipt = true }, f => { delete f.env.GITHUB_SHA }]) {
    const f = fontFixture(); change(f); const result = f.run()
    assert.deepEqual(result, { ok: false, code: 'CJK_PREPARED_FONT_UNTRUSTED' })
    assert.equal(JSON.stringify(result).includes(SECRET), false)
  }
})

test('prepared file ownership symlinks permissions and same-name shadowing cannot widen admission', () => {
  for (const [file, replacement] of [[FONT, stat({ uid: 0 })], [FONT, stat({ uid: 1001, mode: 0o100666 })],
    [FONT, stat({ uid: 1001, nlink: 2 })], [FONT, stat({ uid: 1001, isSymbolicLink: () => true })],
    [HOME, directory({ uid: 1001, mode: 0o40777 })], [RECEIPT, stat({ uid: 1001, isSymbolicLink: () => true })]]) {
    const f = fontFixture(); f.stats.set(file, replacement); assert.equal(f.run().ok, false)
  }
  const moved = fontFixture(); moved.state.stdout = line(HOME + '/other.ttf'); assert.equal(moved.run().ok, false)
  const alias = fontFixture(); alias.realpaths.set(FONT, '/private/' + SECRET); assert.equal(alias.run().ok, false)
  const shadow = fontFixture(); shadow.state.stdout += line(HOME + '/other.ttf', '20-7e')
  assert.deepEqual(shadow.run(), { ok: false, code: 'CJK_FONT_IDENTITY_AMBIGUOUS' })
})
