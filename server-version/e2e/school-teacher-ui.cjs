/* Bounded UI additions to the existing real-API School/Teacher journey.
 * No account, business response, credential, clock or cognitive stimulus mock.
 * Only synthetic appearance preferences are initialized before first render.
 */
'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
const { CJK_SAMPLES, validateCjkInventory, validateRenderedCjk } = require('./school-teacher-chrome.cjs')
const products = ['SCHOOL', 'TEACHER']
const names = { SCHOOL: 'School', TEACHER: 'Teacher' }
const roots = { SCHOOL: '.hs-app', TEACHER: '.ht-app' }
const narrow = [{ width: 320, height: 844 }, { width: 390, height: 844 }]
const darkStates = ['form-author-editor', 'typed-matrix-row-refusal', 'personal-fixed-version-report']
const originalShots = ['scale-author-preview', 'form-author-editor', 'form-author-preview', 'fixed-version-selection-preview', 'scale-answer', 'personal-fixed-version-report', 'typed-single-restored', 'typed-multiple', 'typed-matrix-row-refusal', 'form-completed-no-score']

function appearanceKeys(product, id) {
  assert.ok(products.includes(product))
  const p = product.toLowerCase(), other = product === 'SCHOOL' ? 'teacher' : 'school'
  const account = id ? encodeURIComponent(id) : 'guest'
  return { guest: `${p}:appearance:v1:guest`, current: `${p}:appearance:v1:${account}`,
    otherAccount: `${p}:appearance:v1:__browser_other_synthetic_account__`, otherProduct: `${other}:appearance:v1:${account}` }
}
function imageMode(product, file) {
  const pathname = new URL(file, 'https://static.invalid').pathname
  if (product === 'SCHOOL') {
    if (/\/huischool-campus-sunlight(?:-[A-Za-z0-9_-]+)?\.webp$/.test(pathname)) return 'light'
    if (/\/huischool-campus-moonlight(?:-[A-Za-z0-9_-]+)?\.webp$/.test(pathname)) return 'dark'
  } else if (product === 'TEACHER') {
    if (/\/educator-journal(?:-small)?\.webp$/.test(pathname)) return 'light'
    if (/\/educator-journal-moonlight(?:-small)?\.webp$/.test(pathname)) return 'dark'
  }
  return null
}
function validateSelectedImages(product, mode, requested, currentSrc, sourceCandidates, background) {
  assert.ok(products.includes(product)); assert.ok(['light', 'dark'].includes(mode))
  const relevant = [...new Set(requested.filter(url => imageMode(product, url) !== null))]
  assert.ok(relevant.length > 0, 'Selected artwork must actually be requested')
  assert.ok(relevant.every(url => imageMode(product, url) === mode), 'Do not fetch the unselected day/night artwork')
  assert.equal(imageMode(product, currentSrc), mode)
  assert.ok(sourceCandidates.length > 0 && sourceCandidates.every(url => imageMode(product, url) === mode))
  assert.equal(imageMode(product, background), mode)
  return { selectedOnly: true, currentSrc: new URL(currentSrc).pathname,
    requested: relevant.map(url => new URL(url).pathname).sort(), loginBackground: new URL(background).pathname }
}

function cjkSampleIds(product, state, width) {
  if (width !== 320) return []
  if (product === 'SCHOOL' && state === 'public-login-empty') return ['school-serif', 'school-sans']
  if (product === 'TEACHER' && state === 'public-home') return ['teacher-serif']
  if (product === 'TEACHER' && state === 'public-login-empty') return ['teacher-sans']
  return []
}
function validateUiFontEvidence(row, inventory) {
  assert.deepEqual(validateCjkInventory(inventory), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })
  assert.deepEqual(row.fonts.map(value => value.sampleId), cjkSampleIds(row.product, row.state, row.viewport.width))
  for (const value of row.fonts) {
    assert.deepEqual(Object.keys(value).sort(), ['fonts', 'sampleId'])
    assert.deepEqual(validateRenderedCjk(value.sampleId, value.fonts, inventory), { ok: true, code: 'CJK_RENDERED_VERIFIED' })
  }
  return { ok: true, code: 'UI_CJK_EVIDENCE_VERIFIED' }
}
async function readRenderedCjk(page, product, state, width, inventory) {
  const ids = cjkSampleIds(product, state, width)
  if (!ids.length) return []
  assert.deepEqual(validateCjkInventory(inventory), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })
  const selectors = { 'school-serif': '.hs-main-auth h1', 'school-sans': '.hs-main-auth .hs-field > span',
    'teacher-serif': '#ht-journal-title > span:first-child', 'teacher-sans': '.ht-auth-surface .ht-field > span' }
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const result = []
    for (const sampleId of ids) {
      const locator = page.locator(selectors[sampleId]).first()
      assert.equal(await locator.isVisible(), true)
      assert.equal(await locator.textContent(), CJK_SAMPLES[sampleId].text, 'Inspect the real fixed Chinese node, not a Latin-only substitute')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: selectors[sampleId] })
      assert.ok(Number.isInteger(nodeId) && nodeId > 0)
      const response = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      const fonts = response.fonts.map(({ postScriptName, isCustomFont, glyphCount }) => ({ postScriptName, isCustomFont, glyphCount }))
      assert.deepEqual(validateRenderedCjk(sampleId, fonts, inventory), { ok: true, code: 'CJK_RENDERED_VERIFIED' })
      result.push({ sampleId, fonts })
    }
    return result
  } finally { await cdp.detach() }
}

function createUiChecks({ report, out, axeSource, getFontInventory }) {
  const done = new Set()
  report.schemaVersion = 1; report.scope = 'bounded-brand-theme-layout'
  report.observations = []; report.screenshots = []; report.checks = []; report.sessions = []; report.fontIssues = []
  report.notCovered = ['Real cognitive task computed-style isolation: no cognitive assignment in this fixture',
    'Browser automatic 07:00/19:00 clock transitions; covered separately by existing pure UI tests',
    'Authenticated cross-account logout/relogin; guest-to-account preference separation is checked with real login',
    'CJK evidence covers four fixed real Chinese nodes, not every Unicode character or every page']

  async function prepare(context, product, user, mode = 'light') {
    const keys = appearanceKeys(product, user?.id)
    const entries = user ? { [keys.guest]: 'light', [keys.current]: 'dark', [keys.otherAccount]: 'auto', [keys.otherProduct]: 'dark' }
      : { [keys.guest]: mode }
    // Only preference keys; no authentication state, cookies or business data.
    await context.addInitScript(values => {
      for (const [key, value] of Object.entries(values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    }, entries)
    return keys
  }
  async function theme(s, mode) {
    await s.page.waitForLoadState('networkidle')
    const count = s.audit.apiMutations.length
    const control = s.page.getByRole('combobox', { name: names[s.product] + ' 外观', exact: true })
    let menu = false
    if (!await control.isVisible()) {
      assert.equal(s.product, 'SCHOOL')
      await s.page.getByRole('button', { name: '打开菜单', exact: true }).click(); menu = true
    }
    await control.selectOption(mode)
    await s.page.locator(roots[s.product] + `[data-theme="${mode}"]`).waitFor()
    assert.equal(await control.inputValue(), mode)
    if (menu) await control.press('Escape')
    await s.page.waitForLoadState('networkidle')
    assert.equal(s.audit.apiMutations.length, count, 'Appearance is local preference, not a business mutation')
  }
  async function brand(s, mode) {
    const logo = s.page.getByRole('img', { name: names[s.product] + ' @eduk12.top', exact: true })
    const use = logo.locator('use')
    await use.waitFor({ state: 'attached' })
    await s.page.waitForFunction(({ selector, label }) => {
      const use = [...document.querySelectorAll(selector)].find(el => el.closest('svg')?.getAttribute('aria-label') === label)
      try { const b = use?.getBBox(); return Boolean(b && b.width > 0 && b.height > 0) } catch { return false }
    }, { selector: roots[s.product] + ' svg use', label: names[s.product] + ' @eduk12.top' })
    const href = await use.getAttribute('href'), url = new URL(href, s.origin)
    assert.equal(url.origin, s.origin)
    assert.equal(url.hash, s.product === 'SCHOOL' ? '#school-wordmark' : '#teacher-wordmark')
    assert.ok(s.audit.staticResponses.some(row => row.path === url.pathname && row.status === 200), 'External SVG must load, not merely occupy fixed layout space')
    const painted = await use.evaluate(el => { const b = el.getBBox(); const css = getComputedStyle(el.closest('svg')); return { width: b.width, height: b.height, color: css.color, visible: css.visibility !== 'hidden' && css.display !== 'none' } })
    assert.ok(painted.width > 0 && painted.height > 0 && painted.visible)
    assert.notEqual(painted.color, 'rgba(0, 0, 0, 0)')
    assert.equal(await s.page.locator(roots[s.product]).getAttribute('data-theme'), mode)
    return { path: url.pathname, symbol: url.hash, ...painted }
  }
  async function observe(s, state, mode, viewport, screenshot = false, publicEmpty = false) {
    assert.ok(s.authenticated || publicEmpty, 'No authentication/MFA screenshots')
    await s.page.setViewportSize(viewport)
    await s.page.waitForLoadState('networkidle')
    await s.page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())) })
    const layout = await s.page.evaluate(() => {
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
    })
    assert.equal(layout.secretNodes, 0); assert.equal(layout.filledPasswords, false)
    if (publicEmpty) assert.equal(await s.page.locator('input').evaluateAll(elements => elements.some(el => el.value)), false, 'Public screenshots must contain no entered account data')
    const renderedBrand = await brand(s, mode)
    let fonts = []
    try { fonts = await readRenderedCjk(s.page, s.product, state, viewport.width, getFontInventory()) }
    catch {
      // Preserve the actual business/visual journey; do not certify missing font
      // evidence or treat an unproven face as an observed product/tofu defect.
      report.fontIssues.push({ product: s.product, state, theme: mode, width: viewport.width,
        code: getFontInventory()?.ok === true ? 'CJK_RENDERING_UNPROVEN' : 'CJK_INVENTORY_UNPROVEN' })
    }
    await s.page.keyboard.press('Tab')
    const keyboard = await s.page.evaluate(() => { const el = document.activeElement, css = getComputedStyle(el), r = el.getBoundingClientRect(); return {
      visible: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1,
      focusVisible: el.matches(':focus-visible'), ring: (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0) || css.boxShadow !== 'none' } })
    if (!await s.page.evaluate(() => Boolean(window.axe))) await s.page.addScriptTag({ content: axeSource })
    const accessibility = await s.page.evaluate(async () => { const a = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }); return {
      violations: a.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })), passes: a.passes.length, incomplete: a.incomplete.map(v => v.id) } })
    const entry = { product: s.product, state, theme: mode, viewport, layout, keyboard, accessibility, brand: renderedBrand, fonts }
    if (screenshot) {
      entry.file = `screenshots/ui-${s.product.toLowerCase()}-${state}-${mode}-${viewport.width}.png`
      await s.page.screenshot({ path: path.join(out, entry.file), fullPage: true })
      report.screenshots.push(entry.file)
    }
    report.observations.push(entry)
    assert.ok(layout.scrollWidth <= viewport.width + 1); assert.deepEqual(layout.clipped, [])
    assert.ok(keyboard.visible && keyboard.focusVisible && keyboard.ring)
    assert.deepEqual(accessibility.violations, [])
  }
  async function publicChecks(openSession, product) {
    for (const mode of ['light', 'dark']) {
      const s = await openSession(product, null, 'public-' + mode, { anonymous: true, mode })
      try {
        const hero = s.page.locator(product === 'SCHOOL' ? '.hs-campus-art' : '.ht-journal-image')
        await hero.waitFor()
        for (const viewport of narrow) await observe(s, 'public-home', mode, viewport, viewport.width === 320, true)
        const image = await hero.evaluate(el => ({ currentSrc: el.currentSrc, candidates: [el.src, ...el.srcset.split(',').filter(Boolean).map(part => new URL(part.trim().split(/\s+/)[0], location.href).href)] }))
        await s.page.goto(s.origin + '/login')
        await s.page.getByLabel(product === 'SCHOOL' ? '用户名' : '教育账号', { exact: true }).waitFor()
        for (const viewport of narrow) await observe(s, 'public-login-empty', mode, viewport, false, true)
        const background = await s.page.locator(product === 'SCHOOL' ? '.hs-main-auth' : '.ht-auth-surface').evaluate(el => {
          const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(el, '::before').backgroundImage)
          return match ? new URL(match[1], location.href).href : ''
        })
        const assets = validateSelectedImages(product, mode, s.audit.staticRequests, image.currentSrc, image.candidates, background)
        assert.ok(s.audit.staticResponses.some(row => row.path === assets.loginBackground && row.status === 200))
        report.checks.push({ product, check: 'cold-artwork-' + mode, ...assets })
      } finally { await s.close() }
    }
  }
  async function preference(s) {
    assert.equal(s.guestThemeVerified, true, 'Rendered guest preference was checked before real login')
    await s.page.locator(roots[s.product] + '[data-theme="dark"]').waitFor()
    const read = () => s.page.evaluate(keys => Object.fromEntries(Object.entries(keys).map(([label, key]) => [label, localStorage.getItem(key)])), s.appearanceKeys)
    assert.deepEqual(await read(), { guest: 'light', current: 'dark', otherAccount: 'auto', otherProduct: 'dark' })
    await theme(s, 'light'); await s.page.reload()
    await s.page.locator(roots[s.product] + '[data-theme="light"]').waitFor()
    const values = await read()
    assert.deepEqual(values, { guest: 'light', current: 'light', otherAccount: 'auto', otherProduct: 'dark' })
    report.checks.push({ product: s.product, check: 'preference-' + s.audit.actor, realGuestToAccount: true, reloadPersisted: true, isolatedValues: values })
  }
  async function anchor(s, navigation, label, id) {
    const before = s.audit.apiMutations.length
    const link = s.page.getByRole('navigation', { name: navigation, exact: true }).getByRole('link', { name: label, exact: true })
    assert.equal(await link.getAttribute('href'), '#' + id)
    await link.focus(); await link.press('Enter')
    const focused = await s.page.locator('#' + id).evaluate(el => ({ focused: document.activeElement === el, top: el.getBoundingClientRect().top }))
    assert.ok(focused.focused); assert.ok(focused.top >= -1 && focused.top < 844)
    assert.equal(s.audit.apiMutations.length, before)
    return true
  }
  async function workspace(s) {
    await theme(s, 'dark')
    for (const viewport of narrow) {
      await s.page.setViewportSize(viewport)
      if (s.product === 'TEACHER') {
        const details = s.page.locator('details.ht-workspace-account'), summary = details.locator(':scope > summary')
        assert.equal(await details.evaluate(el => el.open), false, 'Existing school member starts with account details collapsed')
        await summary.focus(); await summary.press('Enter'); assert.equal(await details.evaluate(el => el.open), true)
        await summary.press('Enter'); assert.equal(await details.evaluate(el => el.open), false)
        await anchor(s, '个人任务分区', '私有表单任务', 'ht-personal-private-forms')
      } else {
        const toggle = s.page.getByRole('button', { name: '功能导航', exact: true })
        await toggle.focus(); await toggle.press('Enter'); assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        const nav = s.page.getByRole('navigation', { name: '工作台功能导航', exact: true })
        await nav.getByRole('link').first().focus(); await s.page.keyboard.press('Escape')
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        assert.equal(await toggle.evaluate(el => document.activeElement === el), true)
      }
      report.checks.push({ product: s.product, check: 'workspace-keyboard-' + viewport.width, collapsedAfter: true, focusVerified: true })
      await observe(s, 'compact-workspace', 'dark', viewport, viewport.width === 320)
    }
    await theme(s, 'light'); await s.page.setViewportSize({ width: 1440, height: 900 })
  }
  async function schoolManagementAnchor(s) {
    if (done.has('teacher-school-anchor')) return
    await s.page.setViewportSize(narrow[1])
    await anchor(s, '学校管理分区', '评价活动', 'ht-school-evaluations')
    report.checks.push({ product: 'TEACHER', check: 'school-management-anchor', focusVerified: true })
    done.add('teacher-school-anchor')
    await s.page.setViewportSize({ width: 1440, height: 900 })
  }
  async function supplement(s, state) {
    if (!darkStates.includes(state)) return
    await theme(s, 'dark')
    for (const viewport of narrow) await observe(s, state, 'dark', viewport, viewport.width === 390)
    await theme(s, 'light'); await s.page.setViewportSize({ width: 1440, height: 900 })
  }
  return { prepare, theme, publicChecks, preference, workspace, schoolManagementAnchor, supplement }
}

function verifyReport(report, { head, tree, runId, frontend, backend }, readScreenshot) {
  assert.equal(report.schemaVersion, 1); assert.equal(report.status, 'PASSED'); assert.deepEqual(report.errors, [])
  assert.deepEqual(report.source, { head, tree }); assert.equal(report.runId, runId)
  assert.match(head, /^[a-f0-9]{40}$/); assert.match(tree, /^[a-f0-9]{40}$/); assert.match(runId, /^\d+$/)
  assert.equal(Object.hasOwn(report, 'buildReuse'), false, 'No historical-build identity substitution')
  for (const [kind, expected] of Object.entries({ frontend, backend })) {
    const m = report.inputs[kind]
    assert.deepEqual(m, expected); assert.equal(m.schemaVersion, 1); assert.equal(m.kind, kind)
    assert.equal(m.sha, head); assert.equal(m.runId, runId)
    assert.match(m.contentDigest, /^[a-f0-9]{64}$/); assert.match(m.lockDigest, /^[a-f0-9]{64}$/)
  }
  assert.deepEqual(report.startups, products.map(product => ({ product,
    corsOrigin: `https://${product.toLowerCase()}.eduk12.top`, ready: true, phase: 'READY' })))
  assert.deepEqual(require('./school-teacher-chrome.cjs').validateChromeEvidence(report.chrome), { ok: true, code: 'CHROME_EVIDENCE_VERIFIED' })
  assert.equal(report.chrome.launchedVersion, report.chrome.preflight.package.browserVersion)
  assert.deepEqual(validateCjkInventory(report.chrome.fonts), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })

  const expectedCoverage = products.flatMap(product => ['author-SCALE', 'author-FORM', 'fixed-version-preview-publish',
    `separate-${product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'}-SELF-SCALE`, `separate-${product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'}-SELF-FORM`].map(check => product + ':' + check))
  expectedCoverage.push('TEACHER:ordinary-psychology-author-real-API')
  assert.deepEqual(report.coverage.map(c => c.product + ':' + c.check).sort(), expectedCoverage.sort())
  for (const c of report.coverage) {
    if (c.check.startsWith('author-')) { assert.equal(c.creation, 'UI'); assert.equal(c.saveDiscardPreviewFreeze, 'UI'); assert.equal(c.immutableVersion, true) }
    if (c.check === 'fixed-version-preview-publish') assert.equal(c.executionCount, c.product === 'SCHOOL' ? 2 : 4)
    if (c.check.startsWith('separate-')) {
      assert.equal(c.final, 'COMPLETED'); assert.equal(c.localDraftResume, true)
      if (c.check.endsWith('-FORM')) assert.deepEqual(c.typedAdapter, ['SINGLE', 'MULTIPLE', 'MATRIX', 'CONDITIONAL_REFUSAL', 'ROW_REFUSAL', 'TWO_SECTIONS'])
    }
    if (c.check === 'ordinary-psychology-author-real-API') { assert.equal(c.compiled, true); assert.equal(c.publicationAuthorityNotElevated, true) }
  }
  function observation(row, width, extra = false) {
    assert.deepEqual(row.viewport, { width, height: width === 1440 ? 900 : 844 })
    assert.equal(row.layout.width, width); assert.ok(row.layout.scrollWidth <= width + 1); assert.equal(row.layout.secretNodes, 0)
    if (extra) { assert.deepEqual(row.layout.clipped, []); assert.equal(row.layout.filledPasswords, false) }
    for (const key of ['visible', 'focusVisible', 'ring']) assert.equal(row.keyboard[key], true)
    assert.deepEqual(row.accessibility.violations, []); assert.ok(row.accessibility.passes > 0); assert.ok(Array.isArray(row.accessibility.incomplete))
    if (row.file) {
      assert.match(row.file, /^screenshots\/[a-z0-9-]+\.png$/)
      const bytes = readScreenshot(row.file)
      assert.ok(bytes.length >= 33); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
      assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR'); assert.equal(bytes.readUInt32BE(16), width)
      assert.ok(bytes.readUInt32BE(20) >= row.viewport.height)
    }
  }
  const expectedShots = products.flatMap(p => [1440, 390].flatMap(w => originalShots.map(n => `screenshots/${p.toLowerCase()}-${n}-${w}.png`)))
  assert.deepEqual(report.screenshots.map(s => s.file).sort(), expectedShots.sort())
  for (const row of report.screenshots) observation(row, row.file.endsWith('-1440.png') ? 1440 : 390)
  assert.equal(report.keyboard.length, 8)
  for (const product of products) assert.deepEqual(report.keyboard.filter(k => k.product === product).map(k => k.control).sort(), ['checkbox', 'radio', 'radio', 'scale-option-button'])
  for (const k of report.keyboard) { assert.equal(k.action, 'Space'); assert.equal(k.selected, true); assert.equal(k.focusVisible, true) }
  assert.deepEqual(report.sessions.map(s => s.product + ':' + s.actor).sort(), ['SCHOOL:author', 'SCHOOL:participant', 'TEACHER:author', 'TEACHER:ordinary-psychology-author', 'TEACHER:participant'])
  function session(s, anonymous = false) {
    for (const key of ['pageErrors', 'unexpectedRequests', 'requestFailures']) assert.deepEqual(s[key], [])
    const prefix = s.product === 'SCHOOL' ? '/api/campus' : '/api/huiteacher'
    const allowed = [new RegExp('^' + prefix + '/auth/me:401$')]
    if (!anonymous && s.product === 'SCHOOL' && s.actor === 'author') allowed.push(/^\/api\/campus\/reports\/student\/executions\/[^/:]+:404$/)
    if (!anonymous && s.actor === 'ordinary-psychology-author') allowed.push(/^\/api\/huiteacher\/organizations\/[^/:]+\/evaluation-targets:403$/)
    assert.equal(s.expectedFailures.length, allowed.length)
    for (const pattern of allowed) assert.equal(s.expectedFailures.filter(value => pattern.test(value)).length, 1)
    for (const f of s.failedResponses) assert.ok(s.expectedFailures.includes(f.path + ':' + f.status))
    for (const c of s.consoleErrors) assert.ok(c.network && s.failedResponses.some(f => f.path === c.path && s.expectedFailures.includes(f.path + ':' + f.status)))
    if (anonymous) assert.deepEqual(s.apiMutations, [])
  }
  for (const s of report.sessions) session(s)

  const ui = report.ui
  assert.equal(ui.schemaVersion, 1); assert.equal(ui.scope, 'bounded-brand-theme-layout')
  assert.deepEqual(ui.fontIssues, [], 'Font evidence remains a disclosed limitation, not a complete visual acceptance')
  assert.deepEqual(ui.sessions.map(s => s.product + ':' + s.actor).sort(), products.flatMap(p => ['light', 'dark'].map(m => p + ':public-' + m)).sort())
  for (const s of ui.sessions) session(s, true)
  const expectedUi = products.flatMap(product => [
    ...['light', 'dark'].flatMap(theme => ['public-home', 'public-login-empty'].flatMap(state => narrow.map(v => ({ product, theme, state, width: v.width,
      screenshot: state === 'public-home' && v.width === 320 })))),
    ...narrow.map(v => ({ product, theme: 'dark', state: 'compact-workspace', width: v.width, screenshot: v.width === 320 })),
    ...darkStates.flatMap(state => narrow.map(v => ({ product, theme: 'dark', state, width: v.width, screenshot: v.width === 390 }))),
  ])
  const key = row => [row.product, row.state, row.theme, row.width ?? row.viewport.width].join(':')
  assert.deepEqual(ui.observations.map(key).sort(), expectedUi.map(key).sort())
  const uiFiles = []
  for (const expected of expectedUi) {
    const row = ui.observations.find(actual => key(actual) === key(expected))
    validateUiFontEvidence(row, report.chrome.fonts)
    assert.equal(Boolean(row.file), expected.screenshot)
    if (expected.screenshot) {
      const file = `screenshots/ui-${row.product.toLowerCase()}-${row.state}-${row.theme}-${expected.width}.png`
      assert.equal(row.file, file); uiFiles.push(file)
    }
    observation(row, expected.width, true)
    assert.equal(row.brand.symbol, row.product === 'SCHOOL' ? '#school-wordmark' : '#teacher-wordmark')
    assert.ok(row.brand.width > 0 && row.brand.height > 0); assert.equal(row.brand.visible, true)
    assert.match(row.brand.path, /^\/[A-Za-z0-9_./-]+\.svg$/)
    assert.match(row.brand.color, /^rgba?\([\d.,%\s]+\)$/); assert.notEqual(row.brand.color, 'rgba(0, 0, 0, 0)')
  }
  assert.equal(uiFiles.length, 12); assert.deepEqual(ui.screenshots.slice().sort(), uiFiles.sort())
  const expectedChecks = products.flatMap(p => ['cold-artwork-light', 'cold-artwork-dark', 'preference-author', 'preference-participant', 'workspace-keyboard-320', 'workspace-keyboard-390'].map(c => p + ':' + c))
  expectedChecks.push('TEACHER:preference-ordinary-psychology-author', 'TEACHER:school-management-anchor')
  assert.deepEqual(ui.checks.map(c => c.product + ':' + c.check).sort(), expectedChecks.sort())
  for (const c of ui.checks) {
    if (c.check.startsWith('cold-artwork-')) {
      const mode = c.check.slice('cold-artwork-'.length)
      assert.equal(c.selectedOnly, true); assert.ok(c.requested.length > 0)
      for (const file of [...c.requested, c.currentSrc, c.loginBackground]) assert.equal(imageMode(c.product, file), mode)
      const s = ui.sessions.find(s => s.product === c.product && s.actor === 'public-' + mode)
      assert.ok(s.staticRequests.some(file => new URL(file).pathname === c.currentSrc))
      assert.ok(s.staticResponses.some(row => row.path === c.loginBackground && row.status === 200))
      assert.ok(s.staticRequests.filter(file => imageMode(c.product, file)).every(file => imageMode(c.product, file) === mode))
    } else if (c.check.startsWith('preference-')) {
      assert.equal(c.realGuestToAccount, true); assert.equal(c.reloadPersisted, true)
      assert.deepEqual(c.isolatedValues, { guest: 'light', current: 'light', otherAccount: 'auto', otherProduct: 'dark' })
    } else {
      assert.equal(c.focusVerified, true)
      if (c.check.startsWith('workspace-keyboard')) assert.equal(c.collapsedAfter, true)
    }
  }
  for (const product of products) {
    const publicBrand = mode => ui.observations.find(row => row.product === product && row.state === 'public-home' && row.theme === mode && row.viewport.width === 320).brand
    assert.notEqual(publicBrand('light').color, publicBrand('dark').color)
  }
  assert.ok(ui.notCovered.some(text => /cognitive/i.test(text)))
  assert.ok(ui.notCovered.some(text => /CJK.*four fixed/.test(text)))
  assert.ok(report.notCovered.some(text => /storage/i.test(text))); assert.ok(report.notCovered.some(text => /TLS/.test(text)))
  return { schemaVersion: 1, status: 'PASSED', sourceCommit: head, tree, ciRunId: runId,
    scope: 'School/Teacher real synthetic API journey with bounded brand/theme UI additions', coverage: 11,
    screenshots: 40, uiScreenshots: 12, uiObservations: 32, sessions: 5, publicSessions: 4, keyboardSpace: 8, cjkSamples: ui.observations.reduce((sum, row) => sum + row.fonts.length, 0),
    notCovered: [...report.notCovered, ...ui.notCovered] }
}

module.exports = { cjkSampleIds, validateUiFontEvidence, readRenderedCjk, appearanceKeys, imageMode, validateSelectedImages, createUiChecks, verifyReport, products, darkStates, originalShots }
