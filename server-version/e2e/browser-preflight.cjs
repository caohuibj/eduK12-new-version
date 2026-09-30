// Readiness means the built application renders, not merely that index.html returns 200.
// Run before any credentials or fixture data enter the browser. No business-test retries.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')

async function preflight(baseUrl, evidenceDir) {
  const origin = new URL(baseUrl).origin
  fs.mkdirSync(evidenceDir, { recursive: true })
  const report = { status: 'RUNNING', routes: [], pending: [], failures: [], pageErrors: [] }
  const executablePath = [
    process.env.E2E_BROWSER_EXECUTABLE, chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(candidate => candidate && fs.existsSync(candidate))
  assert.ok(executablePath, 'Chromium executable is required')
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage()
  const pending = new Set()
  // Paths only: never retain cookies, request/response bodies, headers or query credentials.
  const label = request => new URL(request.url()).pathname
  page.on('request', request => pending.add(request))
  page.on('requestfinished', request => pending.delete(request))
  page.on('requestfailed', request => {
    pending.delete(request)
    report.failures.push({ path: label(request), error: request.failure()?.errorText })
  })
  page.on('pageerror', error => report.pageErrors.push(error.name))
  try {
    for (const route of ['/student/login', '/teacher/account-login', '/admin/login']) {
      const start = Date.now()
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 })
      assert.equal(response?.status(), 200, route + ': document failed')
      assert.equal(await page.locator('script[src*="/@vite/client"]').count(), 0, 'preflight requires a production build')
      await page.getByPlaceholder(route === '/admin/login' ? '请输入管理员账号' : '请输入用户名').waitFor({ state: 'visible', timeout: 30000 })
      await page.getByPlaceholder('请输入密码').waitFor({ state: 'visible', timeout: 30000 })
      await page.getByRole('button', { name: route === '/admin/login' ? '管理员登录' : '登录', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
      report.routes.push({ route, elapsedMs: Date.now() - start })
    }
    // Prove the preview API proxy reaches the backend and returns the actual JSON contract.
    const csrf = await page.request.get(origin + '/api/auth/csrf', { timeout: 10000 })
    assert.equal(csrf.status(), 200, 'API proxy must reach the authentication service')
    assert.ok((await csrf.json()).data?.csrfToken, 'API proxy returned no CSRF token')
    assert.deepEqual(report.pageErrors, [], 'application raised an uncaught error')
    const isolated = await browser.newContext()
    const capabilityPage = await isolated.newPage()
    await capabilityPage.route('**/api/capabilities', () => {})
    try {
      for (const route of ['/student/login', '/teacher/account-login', '/admin/login']) {
        const start = Date.now()
        await capabilityPage.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await capabilityPage.getByPlaceholder(route === '/admin/login' ? '请输入管理员账号' : '请输入用户名').waitFor({ state: 'visible', timeout: 5000 })
        report.routes.push({ route, fault: 'capabilities never responds', elapsedMs: Date.now() - start })
      }
    } finally { await isolated.close() }
    report.status = 'PASS'
    console.log('Built frontend readiness: PASS (student, teacher, admin, API proxy)')
  } catch (error) {
    report.status = 'FAIL'
    report.error = error.message
    await page.screenshot({ path: path.join(evidenceDir, 'failure.png'), timeout: 5000 }).catch(() => {})
    throw error
  } finally {
    report.pending = [...pending].map(label)
    fs.writeFileSync(path.join(evidenceDir, 'readiness.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
}
if (require.main === module) {
  const [baseUrl, evidenceDir] = process.argv.slice(2)
  assert.ok(baseUrl && evidenceDir, 'usage: browser-preflight.cjs BASE_URL EVIDENCE_DIRECTORY')
  preflight(baseUrl, evidenceDir).catch(error => { console.error(error); process.exitCode = 1 })
}
module.exports = { preflight }
