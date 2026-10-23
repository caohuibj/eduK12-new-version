/* Prepared pure tests only. Every font command and filesystem read is injected.
 * No browser, fontconfig, package installation, service or filesystem write.
 */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { CJK_SAMPLES, inspectCjkFonts, validateCjkInventory, validateRenderedCjk } = require('./school-teacher-chrome.cjs')
const { cjkSampleIds, validateUiFontEvidence, prepareRenderedCjk, readRenderedCjk } = require('./school-teacher-ui.cjs')

const SECRET = 'synthetic-secret-must-not-be-serialized'
const FONT = '/usr/share/fonts/opentype/example/ExampleCJK-Regular.otf'
const LATIN = '/usr/share/fonts/truetype/example/ExampleLatin-Regular.ttf'
const COVERAGE = '20-7e 4e00-9fff ff0c'
const line = (name = 'ExampleCJK-Regular', file = FONT, chars = COVERAGE, index = '0') =>
  `${name}\t${file}\t${index}\t${chars}\n`
const fileStat = (changes = {}) => ({ uid: 0, mode: 0o100644, size: 4096,
  isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, ...changes })
const directoryStat = () => fileStat({ mode: 0o40755, isFile: () => false, isDirectory: () => true })
const copy = value => JSON.parse(JSON.stringify(value))
const rendered = (id, name = 'ExampleCJK-Regular') => [{ postScriptName: name, isCustomFont: false,
  glyphCount: Array.from(CJK_SAMPLES[id].text).length }]

function fixture() {
  const calls = [], stats = new Map(), realpaths = new Map()
  const state = { stdout: line() + line('ExampleLatin-Regular', LATIN, '20-7e'), status: 0,
    expectedEnv: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } }
  const deps = {
    fs: {
      lstatSync: file => stats.get(file) || (file === '/usr/bin/fc-list' ? fileStat({ mode: 0o100755 }) :
        [FONT, LATIN].includes(file) ? fileStat() : directoryStat()),
      realpathSync: file => realpaths.get(file) || file,
    },
    spawnSync: (file, args, options) => {
      calls.push({ file, args, options })
      assert.equal(file, '/usr/bin/fc-list')
      assert.deepEqual(args, ['--format', '%{postscriptname}\t%{file}\t%{index}\t%{charset}\n'])
      assert.deepEqual(options.env, state.expectedEnv)
      assert.equal(options.shell, undefined); assert.equal(options.timeout, 10000)
      assert.equal(options.maxBuffer, 4 * 1024 * 1024)
      return state
    },
  }
  return { calls, state, stats, realpaths, deps, run: (env = {}) => inspectCjkFonts({ env, deps }) }
}

test('fixed samples and system inventory have no font-brand requirement', () => {
  assert.deepEqual(Object.keys(CJK_SAMPLES), ['school-serif', 'school-sans', 'teacher-serif', 'teacher-sans'])
  assert.equal(Object.isFrozen(CJK_SAMPLES), true)
  for (const sample of Object.values(CJK_SAMPLES)) assert.equal(Object.isFrozen(sample), true)
  const f = fixture(), result = f.run()
  assert.equal(f.calls.length, 1); assert.equal(result.ok, true)
  assert.equal(result.acceptance, false); assert.equal(result.browserLaunched, false)
  assert.equal(result.fonts[0].postScriptName, 'ExampleCJK-Regular')
  assert.equal(result.fonts.length, 1)
  assert.deepEqual(validateCjkInventory(result), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })
  assert.deepEqual(result.fonts[0].charset, [[0x20, 0x7e], [0x4e00, 0x9fff], [0xff0c, 0xff0c]])
})

test('font query errors and hostile output fail without leaking diagnostics', () => {
  for (const change of [{ status: 1, stderr: SECRET }, { error: new Error(SECRET) }, { signal: 'SIGTERM' },
    { stdout: SECRET }, { stdout: '' }, { stdout: 'x'.repeat(4 * 1024 * 1024 + 1) }]) {
    const f = fixture(); Object.assign(f.state, change)
    const result = f.run(); assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes(SECRET), false)
  }
  const f = fixture(); f.stats.set('/usr/bin/fc-list', fileStat({ mode: 0o100777 }))
  assert.equal(f.run().ok, false); assert.equal(f.calls.length, 0)
})

test('only trusted existing system fonts and directories enter the inventory', () => {
  for (const change of [{ uid: 1001 }, { mode: 0o100666 }, { mode: 0o104644 }, { size: 0 },
    { size: 64 * 1024 * 1024 + 1 }, { isFile: () => false }, { isSymbolicLink: () => true }]) {
    const f = fixture(); f.stats.set(FONT, fileStat(change)); assert.equal(f.run().ok, false)
  }
  for (const file of ['/tmp/secret.otf', '/usr/share/fonts/../secret.otf', '/usr/share/fonts/bad\tname.otf']) {
    const f = fixture(); f.state.stdout = line('Example', file); assert.equal(f.run().ok, false)
  }
  const f = fixture(); f.realpaths.set(FONT, '/tmp/secret.otf'); assert.equal(f.run().ok, false)
  const d = fixture(); d.stats.set('/usr/share/fonts', { ...directoryStat(), mode: 0o40777 })
  assert.equal(d.run().ok, false)
})

test('malformed, oversized, overlapping and ambiguous inventory data is rejected', () => {
  for (const chars of ['', 'not-hex', '9fff-4e00', '4e00-9fff 4e10', '110000', 'd800-dfff', '20-7e\tprivate']) {
    const f = fixture(); f.state.stdout = line('Example', FONT, chars); assert.equal(f.run().ok, false)
  }
  for (const stdout of [line('Example', FONT, COVERAGE, '-1'), line('Example', FONT, COVERAGE, '2147483648'),
    line('Bad,Alias'), line() + line('ExampleCJK-Regular', LATIN), line().repeat(2049)]) {
    const f = fixture(); f.state.stdout = stdout; assert.equal(f.run().ok, false)
  }
  const f = fixture(); f.state.stdout = line() + line(); assert.equal(f.run().fonts.length, 1)
})

test('inventory validation rejects missing glyphs, unknown fields and mutated trust evidence', () => {
  const good = fixture().run()
  for (const mutate of [r => { r.extra = SECRET }, r => { r.fonts = [] }, r => { r.fonts[0].rootOwned = false },
    r => { r.fonts[0].path = '/tmp/a.otf' }, r => { r.fonts[0].charset = [[0x20, 0x7e]] },
    r => { r.fonts[0].charset.pop() }, r => { r.fonts.push(copy(r.fonts[0])) },
    r => { r.fonts[0].permissionMode = 0o666 }, r => { r.fonts[0].faceIndex = -1 }]) {
    const bad = copy(good); mutate(bad); assert.equal(validateCjkInventory(bad).ok, false)
  }
})

test('actual fixed sample CDP identities pass with complete installed glyph coverage', () => {
  const inventory = fixture().run()
  for (const id of Object.keys(CJK_SAMPLES))
    assert.deepEqual(validateRenderedCjk(id, rendered(id), inventory), { ok: true, code: 'CJK_RENDERED_VERIFIED' })
  // Family names are intentionally neither recorded nor matched; localized CSS
  // names cannot prevent a match to the actual PostScript font identity.
})

test('Latin-only, custom, unknown and zero-glyph CDP evidence cannot prove Chinese', () => {
  const inventory = fixture().run(), id = 'teacher-sans'
  for (const fonts of [rendered(id, 'ExampleLatin-Regular'), rendered(id, 'Unknown'), [],
    [{ ...rendered(id)[0], isCustomFont: true }], [{ ...rendered(id)[0], glyphCount: 0 }],
    [{ ...rendered(id)[0], glyphCount: 1 }], [{ ...rendered(id)[0], glyphCount: 1.5 }],
    [{ ...rendered(id)[0], familyName: SECRET }], [rendered(id)[0], rendered(id)[0]]])
    assert.equal(validateRenderedCjk(id, fonts, inventory).ok, false)
  assert.equal(validateRenderedCjk('unknown', rendered(id), inventory).ok, false)
})

test('split-font and punctuation-only fallback stay unproven without exact glyph mapping', () => {
  const inventory = fixture().run(), id = 'teacher-serif'
  inventory.fonts.push({ ...copy(inventory.fonts[0]), postScriptName: 'SchoolOnly', faceIndex: 1,
    charset: [[0x540d, 0x540d], [0x6237, 0x6237], [0x7528, 0x7528], [0xff0c, 0xff0c]] })
  const split = [{ postScriptName: 'ExampleCJK-Regular', isCustomFont: false, glyphCount: 6 },
    { postScriptName: 'SchoolOnly', isCustomFont: false, glyphCount: 1 }]
  assert.deepEqual(validateRenderedCjk(id, split, inventory), { ok: false, code: 'CJK_RENDERED_COVERAGE_UNPROVEN' })
  assert.equal(validateRenderedCjk(id, [split[1]], inventory).ok, false)
})

test('irrelevant Latin bitmap identities and paths do not block valid CJK candidates', () => {
  const irrelevant = '\t/tmp/unrelated-private-bitmap.pcf.gz\tunknown-face\t20-7e\n'
  const f = fixture(); f.state.stdout = line() + irrelevant
  const result = f.run(); assert.equal(result.ok, true); assert.equal(result.fonts.length, 1)
  assert.equal(JSON.stringify(result).includes('unrelated-private'), false)
  const missing = fixture(); missing.state.stdout = irrelevant
  assert.equal(missing.run().ok, false)
  const impostor = fixture(); impostor.state.stdout = line() + line('ExampleCJK-Regular', '/tmp/user-font.otf')
  assert.equal(impostor.run().ok, false)
  const shadow = line('ExampleCJK-Regular', '/tmp/user-latin.otf', '20-7e')
  for (const stdout of [line() + shadow, shadow + line()]) {
    const collision = fixture(); collision.state.stdout = stdout
    assert.deepEqual(collision.run(), { ok: false, code: 'CJK_FONT_IDENTITY_AMBIGUOUS' })
  }
})

test('fontconfig shares only Chrome font-scope environment and never reports its values', () => {
  const keys = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CONFIG_DIRS', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_DATA_DIRS',
    'FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'FONTCONFIG_SYSROOT']
  const env = Object.fromEntries(keys.map(key => [key, '/synthetic-private/' + key]))
  Object.assign(env, { UNRELATED_SECRET: SECRET, LD_PRELOAD: SECRET, NODE_OPTIONS: SECRET, PATH: SECRET })
  const f = fixture()
  f.state.expectedEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C',
    ...Object.fromEntries(keys.map(key => [key, env[key]])) }
  const result = f.run(env); assert.equal(result.ok, true)
  assert.equal(JSON.stringify(result).includes('/synthetic-private/'), false)
  assert.equal(JSON.stringify(f.calls).includes(SECRET), false)
  for (const key of keys) {
    const invalid = fixture()
    assert.deepEqual(invalid.run({ [key]: 7 }), { ok: false, code: 'CJK_FONT_ENV_INVALID' })
    assert.equal(invalid.calls.length, 0)
  }
})

test('UI font evidence requires only the exact existing 320px public-state samples', () => {
  const inventory = fixture().run()
  const matrix = [
    ['SCHOOL', 'public-home', []], ['SCHOOL', 'public-login-empty', ['school-serif', 'school-sans']],
    ['TEACHER', 'public-home', ['teacher-serif']], ['TEACHER', 'public-login-empty', ['teacher-sans']],
  ]
  for (const [product, state, ids] of matrix) {
    assert.deepEqual(cjkSampleIds(product, state, 320), ids)
    assert.deepEqual(cjkSampleIds(product, state, 390), [])
    const row = { product, state, viewport: { width: 320 },
      fonts: ids.map(sampleId => ({ sampleId, fonts: rendered(sampleId) })) }
    assert.deepEqual(validateUiFontEvidence(row, inventory), { ok: true, code: 'UI_CJK_EVIDENCE_VERIFIED' })
  }
  assert.deepEqual(cjkSampleIds('SCHOOL', 'compact-workspace', 320), [])
  const row = { product: 'SCHOOL', state: 'public-login-empty', viewport: { width: 320 },
    fonts: ['school-serif', 'school-sans'].map(sampleId => ({ sampleId, fonts: rendered(sampleId) })) }
  for (const mutate of [r => { r.fonts.pop() }, r => { r.fonts.reverse() }, r => { r.fonts.push(copy(r.fonts[0])) },
    r => { r.fonts[0].fonts[0].postScriptName = 'ExampleLatin-Regular' }, r => { r.fonts[0].extra = SECRET }]) {
    const bad = copy(row); mutate(bad); assert.throws(() => validateUiFontEvidence(bad, inventory))
  }
})

function fakePage() {
  const selectorIds = {
    '.hs-main-auth h1': 'school-serif', '.hs-main-auth .hs-field > span': 'school-sans',
    '#ht-journal-title > span:first-child': 'teacher-serif', '.ht-auth-surface .ht-field > span': 'teacher-sans',
  }
  const samples = Object.keys(CJK_SAMPLES), calls = [], state = { detached: 0, connected: 0, visible: true, url: 'about:blank' }
  const cdp = {
    send: async (method, args) => {
      calls.push({ method, args })
      if (state.initError && method === 'CSS.enable') throw state.initError
      if (method === 'DOM.enable' || method === 'CSS.enable') return {}
      if (method === 'DOM.getDocument') return { root: { nodeId: 10 } }
      if (method === 'DOM.querySelector') {
        assert.equal(args.nodeId, 10); assert.ok(Object.hasOwn(selectorIds, args.selector))
        return { nodeId: 100 + samples.indexOf(selectorIds[args.selector]) }
      }
      assert.equal(method, 'CSS.getPlatformFontsForNode')
      if (state.cdpError) throw new Error('Synthetic CDP read failed')
      const sampleId = samples[args.nodeId - 100]; assert.ok(sampleId)
      return { fonts: rendered(sampleId).map(font => ({ ...font, familyName: 'Localized family is not evidence' })) }
    },
    detach: async () => { state.detached++; if (state.detachError) throw state.detachError },
  }
  const page = {
    url: () => state.url,
    once: (event, fn) => { assert.equal(event, 'close'); state.close = fn },
    context: () => ({ newCDPSession: async target => { assert.equal(target, page); state.connected++; return cdp } }),
    locator: selector => {
      assert.ok(Object.hasOwn(selectorIds, selector))
      return { first: () => ({ isVisible: async () => state.visible,
        textContent: async () => state.text === undefined ? CJK_SAMPLES[selectorIds[selector]].text : state.text }) }
    },
  }
  return { page, calls, state }
}

test('UI CDP collection reuses pre-navigation session for real leaf-node selectors', async () => {
  const inventory = fixture().run()
  for (const [product, state] of [['SCHOOL', 'public-login-empty'], ['TEACHER', 'public-home'], ['TEACHER', 'public-login-empty']]) {
    const f = fakePage(); await prepareRenderedCjk(f.page); f.state.url = 'https://synthetic.invalid/login'
    const result = await readRenderedCjk(f.page, product, state, 320, inventory)
    const ids = cjkSampleIds(product, state, 320)
    assert.deepEqual(result, ids.map(sampleId => ({ sampleId, fonts: rendered(sampleId) })))
    assert.equal(f.state.connected, 1); assert.equal(f.state.detached, 0)
    assert.deepEqual(f.calls.slice(0, 3).map(call => call.method), ['DOM.enable', 'CSS.enable', 'DOM.getDocument'])
    assert.deepEqual(f.calls.slice(3).map(call => call.method), ids.flatMap(() => ['DOM.querySelector', 'CSS.getPlatformFontsForNode']))
    assert.equal(JSON.stringify(result).includes('Localized'), false)
    await readRenderedCjk(f.page, product, state, 320, inventory)
    assert.equal(f.state.connected, 1); assert.equal(f.calls.filter(call => call.method === 'CSS.enable').length, 1)
    f.state.close()
    await assert.rejects(readRenderedCjk(f.page, product, state, 320, inventory), /initialized before navigation/)
  }
  assert.deepEqual(await readRenderedCjk({}, 'TEACHER', 'public-home', 390, inventory), [])
})

test('UI collection retains strict text and font checks using the initialized session', async () => {
  const inventory = fixture().run()
  for (const changes of [{ text: 'Teacher' }, { text: '教育账号 ' }, { visible: false }, { cdpError: true }]) {
    const f = fakePage(); await prepareRenderedCjk(f.page); Object.assign(f.state, changes)
    await assert.rejects(readRenderedCjk(f.page, 'TEACHER', 'public-login-empty', 320, inventory))
    assert.equal(f.state.connected, 1); assert.equal(f.state.detached, 0)
    if (changes.text || changes.visible === false)
      assert.equal(f.calls.some(call => call.method === 'CSS.getPlatformFontsForNode'), false)
  }
})

test('font inspection initialization rejects late or duplicate setup and preserves initialization failures', async () => {
  const late = fakePage(); late.state.url = 'https://synthetic.invalid/login'
  await assert.rejects(prepareRenderedCjk(late.page), /before navigation/); assert.equal(late.state.connected, 0)
  const duplicate = fakePage(); await prepareRenderedCjk(duplicate.page)
  await assert.rejects(prepareRenderedCjk(duplicate.page), /once per page/); assert.equal(duplicate.state.connected, 1)
  const broken = fakePage(), primary = new Error('initialization failed')
  broken.state.initError = primary; broken.state.detachError = new Error('detach failed')
  await assert.rejects(prepareRenderedCjk(broken.page), error => error === primary)
  assert.equal(broken.state.detached, 1)
  await assert.rejects(readRenderedCjk(broken.page, 'SCHOOL', 'public-login-empty', 320, fixture().run()), /initialized before navigation/)
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'school-teacher-browser.cjs'), 'utf8')
  const sessionSource = source.split('async function session(')[1]
  const initialize = sessionSource.indexOf('await prepareRenderedCjk(page)'), navigate = sessionSource.indexOf('await page.goto(')
  assert(initialize >= 0 && navigate >= 0); assert(initialize < navigate)
})

test('browser session validation always closes context and preserves the primary failure', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'school-teacher-browser.cjs'), 'utf8')
  const body = source.split('      s.close = async () => {')[1].split('\n      }\n      await prepareRenderedCjk(page)')[0]
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const close = new AsyncFunction('page','audit','expectedFailures','assert','context','report','sha',body)
  for(const validationFails of [false,true])for(const cleanupFails of [false,true]){
    const primary = new Error('validation identity'), audit={failedResponses:[],consoleErrors:[]},report={errors:[]};let attempted=0,caught
    try{await close({waitForLoadState:async()=>{if(validationFails)throw primary}},audit,new Set(),assert,
      {close:async()=>{attempted++;if(cleanupFails)throw new Error('private-cleanup-error')}},report,
      value=>require('node:crypto').createHash('sha256').update(value).digest('hex'))}catch(error){caught=error}
    assert.equal(attempted,1)
    if(validationFails)assert.equal(caught,primary)
    else if(cleanupFails)assert.equal(caught.message,'Browser session context cleanup failed')
    else assert.equal(caught,undefined)
    assert.equal(report.errors.length,Number(cleanupFails));assert(!JSON.stringify(report).includes('private-cleanup-error'))
  }
})
