// FE-11 C3 focused fault gate: the final-only runner must fail closed when
// durable draft storage is unavailable. This uses the same isolated Bundle
// fixture and cookie-session model as the main seeded browser acceptance.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')

const BASE_URL = (process.env.SITUATIONAL_BUNDLE_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.SITUATIONAL_BUNDLE_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-bundle-fixture.json'
const SCREENSHOT_DIR = process.env.SITUATIONAL_BUNDLE_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-bundle-e2e'
const configuredBrowserExecutable = process.env.SITUATIONAL_BUNDLE_E2E_BROWSER_EXECUTABLE
const browserCandidates = configuredBrowserExecutable
  ? [configuredBrowserExecutable]
  : [
      chromium.executablePath(),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
const BROWSER_EXECUTABLE = browserCandidates.find((candidate) => fs.existsSync(candidate))
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const loginStudent = async (page) => {
  await loginWithSession(page, {
    baseUrl: BASE_URL,
    route: '/student/login',
    username: fixture.student.username,
    password: fixture.student.password,
    timeout: 60000,
  })
  await page.waitForURL(/\/student(?:\?|$)/, { timeout: 30000 })
}

const startParent = async (page) => {
  await page.goto(`${BASE_URL}/student/courses/${fixture.course.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: fixture.course.title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const compositeTab = page.getByRole('button', { name: /^综合测评\s*\d*$/u }).first()
  await compositeTab.waitFor({ state: 'visible', timeout: 30000 })
  await compositeTab.click()
  const card = page.locator('div.card').filter({ hasText: fixture.composite.name }).first()
  await card.waitFor({ state: 'visible', timeout: 30000 })
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes(`/api/composite-assessments/${fixture.composite.id}/attempts`)
    && response.status() === 200
  ), { timeout: 30000 })
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const body = await (await responsePromise).json()
  assert.equal(body.code, 0, body.message || 'Bundle start failed')
  return body.data.attempt.id
}

const main = async () => {
  assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
  assert.ok(BROWSER_EXECUTABLE, `browser executable not found; checked: ${browserCandidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
  })
  const page = await context.newPage()
  let finalSubmitRequests = 0
  page.on('request', (request) => {
    if (
      request.method() === 'POST'
      && /\/api\/composite-assessments\/attempts\/[^/]+\/items\/[^/]+\/situational\/[^/]+\/submit(?:\?|$)/u.test(request.url())
    ) finalSubmitRequests += 1
  })

  try {
    await loginStudent(page)
    const parentId = await startParent(page)
    const parent = assertSuccess(
      await sessionJsonFetch(page, `/composite-assessments/attempts/${parentId}`),
      'parent state before storage fault',
    )
    assert.equal(parent.currentItem?.type, 'SITUATIONAL')
    const childId = parent.currentItem?.situationalAttemptId
    assert.ok(childId, 'Situational child attempt missing')

    await Promise.all([
      page.waitForURL(new RegExp(`/student/composite/situational/${childId}(?:\\?|$)`), { timeout: 30000 }),
      page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).click(),
    ])

    await page.getByText('无法打开本地测评草稿存储', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.getByRole('button', { name: '提交测评', exact: true }).count(), 0, 'storage failure exposed FINAL action')
    assert.equal(finalSubmitRequests, 0, 'storage failure emitted FINAL request')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'fe-11-storage-fault.png'), fullPage: true })
    console.log('FE-11 storage fault gate: PASS')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('FE-11 storage fault gate: FAIL')
  console.error(error?.stack || error)
  process.exitCode = 1
})
