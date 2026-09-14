// FE-11 C3 focused media fault gate. The existing Situational VIDEO fixture is
// kept alive after this check so the normal FE-06 acceptance can resume and
// complete the same active attempt.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')

const BASE_URL = (process.env.SITUATIONAL_VIDEO_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.SITUATIONAL_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-video-fixture.json'
const SCREENSHOT_DIR = process.env.SITUATIONAL_VIDEO_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-video-e2e'
const candidates = [
  chromium.executablePath(),
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const executablePath = candidates.find((candidate) => fs.existsSync(candidate))
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const main = async () => {
  assert.ok(executablePath, `browser executable not found: ${candidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let finalRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/situational\/attempts\/[^/]+\/submit(?:\?|$)/u.test(request.url())) finalRequests += 1
  })

  const capabilityPattern = '**/api/situational/attempts/*/scenes/VIDEO-01/video-sources'
  await page.route(capabilityPattern, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 503, message: 'FE-11 injected media capability failure', data: null }),
    })
  })

  try {
    await loginWithSession(page, {
      baseUrl: BASE_URL,
      route: '/student/login',
      username: fixture.student.username,
      password: fixture.student.password,
      timeout: 60000,
    })
    await page.waitForURL(/\/student(?:\?|$)/, { timeout: 30000 })

    const started = assertSuccess(await sessionJsonFetch(page, '/situational/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrumentKey: fixture.instrument.key, instrumentVersion: fixture.instrument.version }),
    }), 'start media-fault attempt')
    assert.ok(started?.attempt?.id)

    await page.goto(`${BASE_URL}/student/situational/${encodeURIComponent(fixture.instrument.key)}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.instrument.videoSceneTitle, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await page.getByRole('alert').filter({ hasText: '视频题面暂时无法加载。' }).waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"]'))
      return inputs.length > 0 && inputs.every((input) => input.matches(':disabled'))
    }, null, { timeout: 30000 })
    assert.equal(finalRequests, 0, 'media capability failure emitted FINAL')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/00-fe-11-video-capability-failure.png`, fullPage: true })

    await page.unroute(capabilityPattern)
    await page.getByRole('button', { name: '重试视频', exact: true }).click()
    await page.locator('[data-assessment-video-player][data-required-viewing="true"]').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(finalRequests, 0, 'media retry emitted FINAL')
    console.log('FE-11 video capability fault/recovery: PASS')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('FE-11 video capability fault/recovery: FAIL')
  console.error(error?.stack || error)
  process.exitCode = 1
})
