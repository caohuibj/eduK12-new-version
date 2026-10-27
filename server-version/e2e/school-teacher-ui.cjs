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

function readKeyboardState() {
  const el = document.activeElement, css = getComputedStyle(el), r = el.getBoundingClientRect()
  return { tag: el.tagName, type: el.getAttribute('type'), role: el.getAttribute('role'),
    visible: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1,
    focusVisible: el.matches(':focus-visible'), ring: (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0) || css.boxShadow !== 'none' }
}
async function probeKeyboard(page) {
  const start = await page.evaluate(readKeyboardState), path = []
  await page.keyboard.press('Tab'); path.push(await page.evaluate(readKeyboardState))
  // A real Tab may cross browser chrome at the document boundary. Never force focus.
  if (path[0].tag === 'BODY') { await page.keyboard.press('Tab'); path.push(await page.evaluate(readKeyboardState)) }
  return { ...path[path.length - 1], start, path }
}
function classifyThemeFailure(error) {
  const message = String(error?.message || '')
  for (const [text, code] of [['Theme root missing', 'ROOT_MISSING'], ['Theme transitions did not settle within 2000ms', 'TRANSITIONS_TIMEOUT'], ['Non-finite theme transition', 'TRANSITION_NON_FINITE']]) {
    if (message.includes(text)) return code
  }
  return 'UNKNOWN'
}
async function settleThemeTransitions(rootSelector) {
  const root = document.querySelector(rootSelector)
  if (!root) throw new Error('Theme root missing')
  let timer, frame, stopped = false, observed = 0, stableFrames = 0, previousGeometry = null
  const properties = new Set(), seen = new WeakSet()
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Theme transitions did not settle within 2000ms')), 2000) })
  try {
    await Promise.race([timeout, (async () => {
      while (!stopped) {
        await new Promise(resolve => { frame = requestAnimationFrame(resolve) })
        if (stopped) return
        const rect = root.getBoundingClientRect() // Flush each frame, including offscreen transition state.
        const active = root.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && (animation.playState === 'running' || animation.pending))
        for (const animation of active) {
          if (!Number.isFinite(animation.effect.getComputedTiming().endTime)) throw new Error('Non-finite theme transition')
          if (!seen.has(animation)) { seen.add(animation); observed++ }
          properties.add(animation.transitionProperty)
        }
        const geometry = [rect.x, rect.y, rect.width, rect.height, root.scrollWidth, root.scrollHeight].join(':')
        if (active.length) { stableFrames = 0; previousGeometry = null; continue }
        stableFrames = previousGeometry === geometry ? stableFrames + 1 : 1
        previousGeometry = geometry
        if (stableFrames >= 2) return
      }
    })()])
    return { settled: true, observed, properties: [...properties].sort() }
  } finally { stopped = true; clearTimeout(timer); if (frame !== undefined) cancelAnimationFrame(frame) }
}

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
// Font inspection must start on the blank page, before stylesheets are loaded.
// CDP sessions are owned by their browser context and end when that context closes.
const renderedCjkSessions = new WeakMap()
async function prepareRenderedCjk(page) {
  assert.equal(page.url(), 'about:blank', 'Initialize font inspection before navigation')
  assert.equal(renderedCjkSessions.has(page), false, 'Initialize font inspection once per page')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    renderedCjkSessions.set(page, cdp)
    page.once('close', () => renderedCjkSessions.delete(page))
  } catch (error) {
    try { await cdp.detach() } catch { /* Preserve the initialization error; outer browser cleanup still runs. */ }
    throw error
  }
}
async function readRenderedCjk(page, product, state, width, inventory) {
  const ids = cjkSampleIds(product, state, width)
  if (!ids.length) return []
  assert.deepEqual(validateCjkInventory(inventory), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })
  const selectors = { 'school-serif': '.hs-main-auth h1', 'school-sans': '.hs-main-auth .hs-field > span',
    'teacher-serif': '#ht-journal-title > span:first-child', 'teacher-sans': '.ht-auth-surface .ht-field > span' }
  const cdp = renderedCjkSessions.get(page)
  assert.ok(cdp, 'Font inspection must be initialized before navigation')
  {
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
  }
}

const appearanceLabels = { auto: '自动', light: '浅色', dark: '深色' }
async function selectAppearanceButton(control, product, mode) {
  assert(Object.hasOwn(appearanceLabels, mode))
  for (let i = 0; i < 3; i++) {
    const label = await control.getAttribute('aria-label')
    const match = new RegExp('^' + product + ' 外观：(自动|浅色|深色)，点击切换为(自动|浅色|深色)$').exec(label)
    assert(match, 'Expected the current accessible cyclic theme button')
    if (match[1] === appearanceLabels[mode]) return
    await control.click()
    // Locator auto-waits on the actual accessible label after React commits.
    await control.and(control.page().getByRole('button', { name: new RegExp('^' + product + ' 外观：' + match[2] + '，') })).waitFor()
  }
  throw new Error('Appearance button did not reach requested mode')
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
    let phase = 'initial'
    try {
      phase = 'initial-network-idle'
      await s.page.waitForLoadState('networkidle')
      const count = s.audit.apiMutations.length
      const control = s.page.getByRole('button', { name: new RegExp('^' + names[s.product] + ' 外观：') })
      let menu = false
      phase = 'control-visibility'
      if (!await control.isVisible()) {
        assert.equal(s.product, 'SCHOOL')
        phase = 'open-menu'
        await s.page.getByRole('button', { name: '打开菜单', exact: true }).click(); menu = true
      }
      phase = 'select-mode'
      await selectAppearanceButton(control, names[s.product], mode)
      phase = 'theme-root'
      await s.page.locator(roots[s.product] + `[data-theme="${mode}"]`).waitFor()
      phase = 'control-value'
      assert.match(await control.getAttribute('aria-label'), new RegExp('^' + names[s.product] + ' 外观：' + appearanceLabels[mode] + '，'))
      phase = 'close-menu'
      if (menu) await control.press('Escape')
      phase = 'post-theme-network-idle'
      await s.page.waitForLoadState('networkidle')
      phase = 'settle-transitions'
      const transitions = await s.page.evaluate(settleThemeTransitions, roots[s.product])
      ;(report.themeTransitions ||= []).push({ product: s.product, mode, ...transitions })
      phase = 'mutation-invariant'
      assert.equal(s.audit.apiMutations.length, count, 'Appearance is local preference, not a business mutation')
    } catch (error) {
      ;(report.themeFailures ||= []).push({ product: s.product, mode, phase, code: classifyThemeFailure(error) })
      throw error
    }
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
    const keyboard = await probeKeyboard(s.page)
    if (!await s.page.evaluate(() => Boolean(window.axe))) await s.page.addScriptTag({ content: axeSource })
    const accessibility = await s.page.evaluate(async () => { const a = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }); return {
      violations: a.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target), contrast: v.id === 'color-contrast' ? v.nodes.slice(0, 30).map(n => n.any.filter(check => check.id === 'color-contrast').map(check => ({ fgColor: check.data?.fgColor, bgColor: check.data?.bgColor, contrastRatio: check.data?.contrastRatio }))) : undefined })), passes: a.passes.length, incomplete: a.incomplete.map(v => v.id) } })
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
      const mutations = s.audit.apiMutations.length
      if (s.product === 'TEACHER') {
        const trigger = s.page.getByRole('button', { name: '账号设置', exact: true })
        const dialog = s.page.getByRole('dialog', { name: '账号设置', exact: true })
        assert.equal(await dialog.isVisible(), false, 'Account dialog starts closed')
        await trigger.focus(); await trigger.press('Enter'); await dialog.waitFor()
        assert.equal(await dialog.getByRole('heading', { name: '账号设置', exact: true }).evaluate(el => document.activeElement === el), true)
        await s.page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
        assert.equal(await trigger.evaluate(el => document.activeElement === el), true)
        await anchor(s, '个人任务分区', '个人测评', 'ht-personal-self')
        await anchor(s, '个人任务分区', '参与测评', 'ht-personal-tasks')
      } else {
        const nav = s.page.getByRole('navigation', { name: '校园功能分组', exact: true })
        const link = nav.getByRole('link', { name: '校园活动', exact: true })
        await link.focus(); await link.press('Enter')
        await s.page.getByRole('navigation', { name: '校园活动功能入口', exact: true }).waitFor()
        assert.equal(new URL(s.page.url()).pathname, '/workspace/activities')
        assert.equal(await s.page.locator('.hs-workspace-content').evaluate(el => document.activeElement === el), true)
        const back = s.page.getByRole('link', { name: '返回概览', exact: true })
        await back.focus(); await back.press('Enter')
        await s.page.getByRole('heading', { name: '心理教师工作台', exact: true }).waitFor()
        assert.equal(await s.page.locator('.hs-workspace-content').evaluate(el => document.activeElement === el), true)
      }
      assert.equal(s.audit.apiMutations.length, mutations, 'Workspace navigation and account dialog must not mutate business data')
      report.checks.push({ product: s.product, check: 'workspace-keyboard-' + viewport.width, restoredNavigation: true, focusVerified: true })
      await observe(s, 'compact-workspace', 'dark', viewport, viewport.width === 320)
    }
    await theme(s, 'light'); await s.page.setViewportSize({ width: 1440, height: 900 })
  }
  async function schoolManagementAnchor(s) {
    await s.page.setViewportSize(narrow[1])
    await anchor(s, '学校管理分区', '评价活动', 'ht-school-evaluations')
    if (!done.has('teacher-school-anchor')) report.checks.push({ product: 'TEACHER', check: 'school-management-anchor', focusVerified: true })
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

// A single completed official producer may supply unchanged frontend bytes.
// The control job authenticates the official job/ZIP; this consumer independently
// binds its receipt to this checkout/run and the actual FE tree, lock and dist.
// Do not rewrite the original manifest to impersonate a current-run build.
const OFFICIAL_FRONTEND = Object.freeze({
  originalRun: 39899292976, originalHead: '051d8eb0f869c166b09739132ff8ea8e9a666613',
  originalCheckout: '6337343de882ba07999a47c1f5a2c71a58b1a597', originalJob: 120237022790,
  originalArtifact: 12478381269, originalArtifactSha256: '9d5d62c0f6279092502b76a880fedfbb600b8a590395a6d3adde0432756c1f83',
  frontendTree: '4c089c44c21c156f416879896c41ade98c40309a',
})
function validateOfficialFrontendReceipt(receipt, { head, runId, frontend, frontendTree, frontendLockDigest, frontendContentDigest }) {
  assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion', 'status', 'currentHead', 'currentRun',
    ...Object.keys(OFFICIAL_FRONTEND), 'manifest'].sort())
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.status, 'VERIFIED_OFFICIAL_FRONTEND_BUILD')
  assert.equal(receipt.currentHead, head); assert.equal(receipt.currentRun, runId)
  assert.match(head, /^[a-f0-9]{40}$/); assert.match(runId, /^\d+$/)
  for (const [key, expected] of Object.entries(OFFICIAL_FRONTEND)) assert.equal(receipt[key], expected)
  assert.equal(frontendTree, OFFICIAL_FRONTEND.frontendTree)
  assert.deepEqual(receipt.manifest, frontend)
  assert.deepEqual(Object.keys(frontend).sort(), ['schemaVersion', 'kind', 'sha', 'runId', 'contentDigest', 'lockDigest'].sort())
  assert.equal(frontend.schemaVersion, 1); assert.equal(frontend.kind, 'frontend')
  assert.equal(frontend.sha, OFFICIAL_FRONTEND.originalCheckout)
  assert.equal(frontend.runId, String(OFFICIAL_FRONTEND.originalRun))
  assert.match(frontendLockDigest, /^[a-f0-9]{64}$/); assert.match(frontendContentDigest, /^[a-f0-9]{64}$/)
  assert.equal(frontend.lockDigest, frontendLockDigest); assert.equal(frontend.contentDigest, frontendContentDigest)
  return receipt
}
// The original compiled artifact remains unchanged. The current runtime policy
// is a separately pinned, noncompiled seed/role/restore input and must be new.
// Only that exact old/new policy row is normalized for compiled-artifact reuse;
// all other backend rows remain fixed except the one tsc-excluded fixture.
const BACKEND_FIXTURE_EXCEPTION = 'server-version/backend/src/__tests__/survey/tool-publication.postgres.integration.test.ts'
const OFFICIAL_BACKEND = Object.freeze({
  originalRun: 39877023519, originalHead: 'b717cddfdeb957bc3665ed3e69f8a680befa021b',
  originalCheckout: 'db477157b097556dc8e59cda1f6bda71f06a71f6', originalJob: 120165263496,
  originalJobConclusion: 'failure', originalArtifact: 12469580004,
  originalArtifactSha256: '64032cdebcfbf855622f3dbaa53f6b31bffb1b5d9f965ef719b3d3faad469d18',
  backendCompileDigest: '8689278a86c4571e8a5f251338c56d164f3626ec76520c5e27c44350c76b323d',
})
function computeBackendCompileDigest(lsTreeText, { historical = false } = {}) {
  assert.equal(typeof historical, 'boolean')
  assert.equal(typeof lsTreeText, 'string'); assert.ok(lsTreeText.endsWith('\n') && !lsTreeText.includes('\r'))
  const rows = lsTreeText.slice(0, -1).split('\n'), seen = new Set(), included = []
  const policyPath = 'server-version/backend/scripts/runtime-table-policy.json'
  const oldPolicy = 'c7a33ee0e2d700ba39a9a99a82c6a5cb052a08f8', newPolicy = 'ace85218711a03301aef8b4626f0cf9951cb7b4e'
  let omitted = 0, policies = 0
  for (const row of rows) {
    assert.match(row, /^[0-7]{6} blob [a-f0-9]{40}\tserver-version\/backend\/[^\t]+$/)
    const file = row.split('\t')[1]; assert.equal(seen.has(file), false); seen.add(file)
    if (file === BACKEND_FIXTURE_EXCEPTION) { omitted++; continue }
    if (file === policyPath) {
      const [mode, type, blob] = row.split('\t')[0].split(' ')
      assert.equal(mode, '100644'); assert.equal(type, 'blob')
      assert.ok([oldPolicy, newPolicy].includes(blob), 'Only the exact reviewed runtime policy delta is allowed')
      if (!historical) assert.equal(blob, newPolicy, 'Current seed/role/restore must use the reviewed new runtime policy')
      included.push(`100644 blob ${oldPolicy}\t${policyPath}`); policies++
    } else included.push(row)
  }
  assert.equal(omitted, 1); assert.equal(policies, 1); assert.ok(included.length > 0)
  return require('node:crypto').createHash('sha256').update(included.join('\n') + '\n').digest('hex')
}
function validateOfficialBackendReceipt(receipt, { head, runId, backend, backendCompileDigest, backendLockDigest, backendContentDigest }) {
  assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion', 'status', 'currentHead', 'currentRun',
    ...Object.keys(OFFICIAL_BACKEND), 'manifest'].sort())
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.status, 'VERIFIED_OFFICIAL_BACKEND_BUILD')
  assert.equal(receipt.currentHead, head); assert.equal(receipt.currentRun, runId)
  assert.match(head, /^[a-f0-9]{40}$/); assert.match(runId, /^\d+$/)
  for (const [key, expected] of Object.entries(OFFICIAL_BACKEND)) assert.equal(receipt[key], expected)
  assert.equal(backendCompileDigest, OFFICIAL_BACKEND.backendCompileDigest)
  assert.deepEqual(receipt.manifest, backend)
  assert.deepEqual(Object.keys(backend).sort(), ['schemaVersion', 'kind', 'sha', 'runId', 'contentDigest', 'lockDigest'].sort())
  assert.equal(backend.schemaVersion, 1); assert.equal(backend.kind, 'backend')
  assert.equal(backend.sha, OFFICIAL_BACKEND.originalCheckout); assert.equal(backend.runId, String(OFFICIAL_BACKEND.originalRun))
  assert.match(backendLockDigest, /^[a-f0-9]{64}$/); assert.match(backendContentDigest, /^[a-f0-9]{64}$/)
  assert.equal(backend.lockDigest, backendLockDigest); assert.equal(backend.contentDigest, backendContentDigest)
  return receipt
}
function validateReportBuildInputs(report, options) {
  const { head, tree, runId, frontend, backend, officialFrontendReuse, officialBackendReuse } = options
  assert.deepEqual(report.source, { head, tree }); assert.equal(report.runId, runId)
  assert.match(head, /^[a-f0-9]{40}$/); assert.match(tree, /^[a-f0-9]{40}$/); assert.match(runId, /^\d+$/)
  assert.equal(Object.hasOwn(report, 'buildReuse'), false, 'No historical diagnostic-build identity substitution')
  if (officialFrontendReuse !== undefined) {
    assert.deepEqual(report.officialFrontendReuse, officialFrontendReuse)
    validateOfficialFrontendReceipt(officialFrontendReuse, options)
  } else assert.equal(Object.hasOwn(report, 'officialFrontendReuse'), false, 'Never trust only report-supplied reuse evidence')
  if (officialBackendReuse !== undefined) {
    assert.deepEqual(report.officialBackendReuse, officialBackendReuse)
    validateOfficialBackendReceipt(officialBackendReuse, options)
  } else assert.equal(Object.hasOwn(report, 'officialBackendReuse'), false, 'Never trust only report-supplied backend reuse evidence')
  for (const [kind, expected] of Object.entries({ frontend, backend })) {
    const m = report.inputs[kind]
    assert.deepEqual(m, expected); assert.equal(m.schemaVersion, 1); assert.equal(m.kind, kind)
    const original = kind === 'frontend' && officialFrontendReuse ? OFFICIAL_FRONTEND : kind === 'backend' && officialBackendReuse ? OFFICIAL_BACKEND : null
    assert.equal(m.sha, original ? original.originalCheckout : head)
    assert.equal(m.runId, original ? String(original.originalRun) : runId)
    assert.match(m.contentDigest, /^[a-f0-9]{64}$/); assert.match(m.lockDigest, /^[a-f0-9]{64}$/)
  }
  return { ok: true, code: 'BROWSER_BUILD_INPUTS_VERIFIED' }
}
function verifyReport(report, options, readScreenshot) {
  const { head, tree, runId } = options
  assert.equal(report.schemaVersion, 1); assert.equal(report.status, 'PASSED'); assert.deepEqual(report.errors, [])
  validateReportBuildInputs(report, options)
  assert.deepEqual(report.startups, products.map(product => ({ product,
    corsOrigin: `https://${product.toLowerCase()}.eduk12.top`, ready: true, phase: 'READY' })))
  assert.deepEqual(require('./school-teacher-chrome.cjs').validateChromeEvidence(report.chrome), { ok: true, code: 'CHROME_EVIDENCE_VERIFIED' })
  assert.equal(report.chrome.launchedVersion, report.chrome.preflight.package.browserVersion)
  assert.deepEqual(validateCjkInventory(report.chrome.fonts, { currentHead: head, ciRunId: runId }), { ok: true, code: 'CJK_INVENTORY_VERIFIED' })

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
      if (c.check.startsWith('workspace-keyboard')) assert.equal(c.restoredNavigation, true)
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

module.exports = { selectAppearanceButton, classifyThemeFailure, readKeyboardState, probeKeyboard, settleThemeTransitions, OFFICIAL_BACKEND, BACKEND_FIXTURE_EXCEPTION, computeBackendCompileDigest, validateOfficialBackendReceipt, OFFICIAL_FRONTEND, validateOfficialFrontendReceipt, validateReportBuildInputs, cjkSampleIds, validateUiFontEvidence, prepareRenderedCjk, readRenderedCjk, appearanceKeys, imageMode, validateSelectedImages, createUiChecks, verifyReport, products, darkStates, originalShots }
