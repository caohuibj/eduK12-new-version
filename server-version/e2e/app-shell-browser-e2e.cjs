/* FE-02 browser acceptance: real App routes, deterministic HTTP fixtures, no database writes. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const base = process.env.APP_SHELL_BASE_URL || 'http://127.0.0.1:5180'
const output = process.env.APP_SHELL_EVIDENCE_DIR || '/tmp/eduk12-app-shell'
const userFor = (role, id = 'user-1') => ({ id, role, username: 'pilot', nickname: '试点用户', mustChangePassword: false })
async function setup(browser, { role = 'STUDENT', width = 390, touch = false, cognitive = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const state = { user: role ? userFor(role) : null, expires: false, loginUser: userFor('STUDENT'), requests: [], errors: [] }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (!pathname.startsWith('/api/')) return route.continue()
    state.requests.push({ method: request.method(), pathname })
    let status = 200
    let data = { list: [], total: 0, totalPages: 1, hasMore: false }
    if (pathname === '/api/capabilities') data = { cognitive }
    else if (pathname === '/api/auth/me' || pathname === '/api/users/me') { data = state.user; if (!data) status = 401 }
    else if (pathname === '/api/auth/csrf') data = { csrfToken: 'fixture-csrf' }
    else if (pathname === '/api/auth/login') { state.user = state.loginUser; data = { user: state.user } }
    else if (pathname === '/api/auth/logout') { state.user = null; data = null }
    else if (pathname === '/api/scales/available' && state.expires) { status = 401; state.user = null }
    else if (pathname.includes('/public/cognitive/sessions/')) { status = 404; data = null }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, message: status === 200 ? 'ok' : '测评不可访问', data }) })
  })
  return { context, page, state }
}
async function login(page) {
  await page.getByLabel('用户名', { exact: true }).fill('pilot')
  await page.getByLabel('密码', { exact: true }).fill('password123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
}
async function openNav(page) {
  const toggle = page.getByRole('button', { name: '导航菜单' })
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
  return page.getByRole('navigation', { name: '主要导航' })
}
async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: process.env.APP_SHELL_BROWSER_CHANNEL || undefined })
  const cases = []
  try {
    for (const width of [360, 390, 768, 820, 1366]) for (const touch of [false, true]) {
      const { context, page, state } = await setup(browser, { width, touch })
      await page.goto(`${base}/student/cognitive/history`)
      await page.getByRole('heading', { name: '测评历史', exact: true }).waitFor()
      const nav = await openNav(page)
      assert.equal(await nav.locator('[aria-current="page"]').count(), 1)
      assert.equal(await nav.locator('[aria-current="page"]').innerText(), '认知测评')
      assert.equal(await page.getByRole('main').count(), 1)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      const sizes = await nav.locator('a').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
      assert(sizes.every((height) => height >= 44))
      if (width < 1024) {
        await nav.getByRole('link', { name: '课程', exact: true }).focus()
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('button', { name: '导航菜单' }).evaluate((node) => node === document.activeElement), true)
        assert.equal(await nav.isVisible(), false)
        await openNav(page)
      }
      await page.screenshot({ path: path.join(output, `${width}-${touch ? 'touch' : 'keyboard'}.png`), fullPage: true })
      if (touch) await nav.getByRole('link', { name: '我的测评' }).tap()
      else { await nav.getByRole('link', { name: '我的测评' }).focus(); await page.keyboard.press('Enter') }
      await page.getByRole('heading', { name: '心理测评', exact: true }).waitFor()
      assert.equal(await page.getByRole('main').evaluate((node) => node === document.activeElement), true)
      await page.reload()
      await page.getByRole('heading', { name: '心理测评', exact: true }).waitFor()
      assert.deepEqual(state.errors, [])
      assert.equal(state.requests.some((req) => req.method !== 'GET'), false)
      cases.push({ width, input: touch ? 'emulated-touch' : 'keyboard', passed: true })
      await context.close()
    }
    for (const role of ['TEACHER', 'ADMIN']) {
      const { context, page, state } = await setup(browser, { role, width: 1366 })
      await page.goto(`${base}/profile`)
      await page.getByRole('heading', { name: '个人信息', exact: true }).or(page.getByRole('heading', { name: '个人资料', exact: true })).waitFor()
      const nav = await openNav(page)
      assert.equal(await nav.getByRole('link', { name: '用户管理' }).count(), role === 'ADMIN' ? 1 : 0)
      assert.equal(await nav.locator('[aria-current="page"]').count(), 1)
      assert.deepEqual(state.errors, [])
      cases.push({ role, passed: true }); await context.close()
    }
    {
      const { context, page, state } = await setup(browser, { role: null })
      await page.goto(`${base}/public/cognitive/sessions/s1`)
      await page.getByText('需要恢复凭证', { exact: true }).waitFor()
      assert.equal(await page.locator('[data-shell-mode="focused"]').count(), 1)
      assert.equal(state.requests.some((req) => req.pathname.includes('/cognitive/')), false)
      await page.reload()
      await page.getByLabel('恢复凭证').fill('fixture-credential')
      await page.getByRole('button', { name: '恢复测评', exact: true }).click()
      await page.getByText('加载失败', { exact: true }).waitFor()
      assert(state.requests.some((req) => req.pathname.includes('/public/cognitive/sessions/s1')))
      assert.equal(state.requests.some((req) => req.pathname.startsWith('/api/cognitive/')), false)
      await page.goto(`${base}/public/cognitive/sessions`)
      await page.getByText('找不到此页面', { exact: true }).waitFor()
      assert.deepEqual(state.errors, [])
      cases.push({ publicCredentialAndMissingLink: true, passed: true }); await context.close()
    }
    {
      const { context, page } = await setup(browser, { cognitive: false })
      await page.goto(`${base}/student/cognitive/history`)
      await page.getByText('找不到此页面', { exact: true }).waitFor()
      assert.equal(await (await openNav(page)).getByRole('link', { name: '认知测评', exact: true }).count(), 0)
      cases.push({ disabledCapability: true, passed: true }); await context.close()
    }
    {
      const { context, page, state } = await setup(browser)
      await page.goto(`${base}/student/cognitive/history`)
      await page.getByRole('heading', { name: '测评历史', exact: true }).waitFor()
      // Sentinel models existing browser data; FE-02 must not delete storage on 401.
      await page.evaluate(() => localStorage.setItem('fe02-draft-sentinel', 'keep'))
      state.expires = true
      await (await openNav(page)).getByRole('link', { name: '我的测评' }).click()
      await page.getByRole('heading', { name: '学生登录', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/student/scales')
      state.expires = false
      state.loginUser = userFor('STUDENT', 'other-account')
      await login(page)
      await page.getByText('请使用原账户继续', { exact: true }).waitFor()
      assert.equal(await page.getByRole('heading', { name: '心理测评' }).count(), 0)
      await page.getByRole('link', { name: '重新登录', exact: true }).click()
      state.loginUser = userFor('STUDENT')
      await login(page)
      await page.getByRole('heading', { name: '心理测评', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => localStorage.getItem('fe02-draft-sentinel')), 'keep')
      assert.deepEqual(state.errors, [])
      cases.push({ expiryAccountMismatchAndResume: true, passed: true }); await context.close()
    }
    {
      const { context, page } = await setup(browser, { role: null, width: 360 })
      await page.goto(`${base}/scale-library/test/v1`)
      await page.getByRole('heading', { name: '欢迎使用 Huisurvey' }).waitFor()
      const target = new URL(page.url()).searchParams.get('returnTo')
      assert.equal(target, '/scale-library/test/v1')
      const entries = page.getByRole('navigation', { name: '身份入口' })
      assert.equal(await entries.getByRole('link').count(), 3)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await entries.getByRole('link', { name: /学生入口/ }).click()
      await page.getByRole('heading', { name: '学生登录', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), target)
      assert.equal(await page.getByRole('main').evaluate((node) => node === document.activeElement), true)
      await page.screenshot({ path: path.join(output, '360-login.png'), fullPage: true })
      cases.push({ sharedLibraryRoleEntry: true, passed: true }); await context.close()
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(cases, null, 2))
    console.log(`Passed ${cases.length} AppShell browser cases. Evidence: ${output}`)
  } finally { await browser.close() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
