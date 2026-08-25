// PR15 Composite browser gate.
//
// The fixture and credentials are supplied by the isolated Gate environment;
// no account secrets or database connection strings belong in the repository.
// Required:
//   COMPOSITE_E2E_ISOLATED_DB=1
//   COMPOSITE_E2E_TOKEN=<disposable published public token>
//   COMPOSITE_E2E_ASSESSMENT_ID=<owning composite id>
//   COMPOSITE_E2E_TEACHER_USERNAME / COMPOSITE_E2E_TEACHER_PASSWORD
//
// Optional:
//   COGNITIVE_E2E_BASE_URL, COGNITIVE_E2E_BROWSER_EXECUTABLE

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const { chromium } = require('../backend/node_modules/playwright-core')

const BASE_URL = (process.env.COGNITIVE_E2E_BASE_URL || 'http://127.0.0.1').replace(/\/$/, '')
const TOKEN = process.env.COMPOSITE_E2E_TOKEN
const ASSESSMENT_ID = process.env.COMPOSITE_E2E_ASSESSMENT_ID
const USERNAME = process.env.COMPOSITE_E2E_TEACHER_USERNAME
const PASSWORD = process.env.COMPOSITE_E2E_TEACHER_PASSWORD
const SCREENSHOT_DIR = process.env.COMPOSITE_E2E_SCREENSHOT_DIR || '/tmp/eduk12-pr15-composite-e2e'
const configuredBrowserExecutable = process.env.COGNITIVE_E2E_BROWSER_EXECUTABLE
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

const required = (value, label) => {
  assert.ok(typeof value === 'string' && value.length > 0, `Missing ${label}`)
  return value
}

const jsonFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, requestInit }) => {
  const token = localStorage.getItem('token')
  const headers = {
    ...(requestInit.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const response = await fetch(`/api${pathName}`, { ...requestInit, headers })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}, { endpoint, requestInit: init })

const publicInfo = async (page) => page.evaluate(async ({ baseUrl, token }) => {
  const response = await fetch(`${baseUrl}/api/public/composite-assessments/${token}`)
  return { status: response.status, body: await response.json() }
}, { baseUrl: BASE_URL, token: TOKEN })

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const login = async (page) => {
  await page.goto(`${BASE_URL}/teacher/account-login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入用户名').fill(USERNAME)
  await page.getByPlaceholder('请输入密码').fill(PASSWORD)
  await Promise.all([
    page.waitForFunction(() => Boolean(localStorage.getItem('token')), null, { timeout: 30000 }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
}

const main = async () => {
  assert.equal(process.env.COMPOSITE_E2E_ISOLATED_DB, '1', 'Set COMPOSITE_E2E_ISOLATED_DB=1 for a dedicated Gate service')
  required(TOKEN, 'COMPOSITE_E2E_TOKEN')
  required(ASSESSMENT_ID, 'COMPOSITE_E2E_ASSESSMENT_ID')
  required(USERNAME, 'COMPOSITE_E2E_TEACHER_USERNAME')
  required(PASSWORD, 'COMPOSITE_E2E_TEACHER_PASSWORD')
  assert.ok(BROWSER_EXECUTABLE, `Browser executable not found; checked: ${browserCandidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const publicPage = await publicContext.newPage()
  let startRequests = 0
  publicPage.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes(`/api/public/composite-assessments/${TOKEN}/start`)) startRequests += 1
  })

  try {
    await publicPage.goto(`${BASE_URL}/public/composite/${TOKEN}`, { waitUntil: 'domcontentloaded' })
    const before = assertSuccess(await publicInfo(publicPage), 'public info before start')
    const beforeUsedCount = before.usedCount
    await publicPage.getByRole('heading', { name: before.name }).waitFor({ state: 'visible', timeout: 30000 })
    const startButton = publicPage.getByRole('button', { name: /开始匿名测评/ })
    await startButton.waitFor({ state: 'visible', timeout: 30000 })
    await publicPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-before-explicit-start.png'), fullPage: true })
    assert.equal(startRequests, 0, 'opening a public link must not create an attempt')

    await Promise.all([
      publicPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/public/composite-assessments/${TOKEN}/start`) && response.status() === 200, { timeout: 30000 }),
      startButton.click(),
    ])
    await publicPage.waitForTimeout(250)
    assert.equal(startRequests, 1, 'one explicit click must create at most one attempt')
    await publicPage.screenshot({ path: path.join(SCREENSHOT_DIR, '02-after-explicit-start.png'), fullPage: true })

    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const teacherPage = await teacherContext.newPage()
    try {
      await login(teacherPage)
      const tokens = assertSuccess(await jsonFetch(teacherPage, `/composite-assessments/${ASSESSMENT_ID}/public-tokens`), 'token list after start')
      const token = tokens.list.find((entry) => entry.token === TOKEN)
      assert.ok(token, 'fixture token is missing from the teacher token list')
      assert.equal(token.usedCount, beforeUsedCount + 1, 'explicit start did not consume exactly one participation slot')
      console.log(JSON.stringify({ baseUrl: BASE_URL, browser: BROWSER_EXECUTABLE, tokenUsedCount: token.usedCount, screenshots: SCREENSHOT_DIR }, null, 2))
    } finally {
      await teacherContext.close()
    }
  } finally {
    await publicContext.close()
    await browser.close()
  }
}

main().then(() => console.log('PR15 Composite browser E2E: PASS')).catch((error) => {
  console.error('PR15 Composite browser E2E: BLOCKED/FAIL')
  console.error(error.stack || error.message)
  process.exit(1)
})
