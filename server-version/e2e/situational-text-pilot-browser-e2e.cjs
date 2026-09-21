// Situational Text Pilot browser E2E (PR-C)
// Uses the repository's existing Playwright runner: login → published text
// instrument → local draft/resume surface → one final submit → stored result →
// refresh/history/export, with a mobile layout smoke.
const fs = require('fs')
const { chromium } = require('../backend/node_modules/playwright-core')

const BASE = process.env.SITUATIONAL_E2E_BASE_URL || 'http://localhost'
const SHOT_DIR = process.env.SITUATIONAL_E2E_SHOT_DIR || '/tmp/situational-text-pilot-e2e'
const USER = process.env.SITUATIONAL_E2E_USER || 'e2estudent'
const PASS = process.env.SITUATIONAL_E2E_PASS || 'e2e123456'

const configuredBrowserExecutable = process.env.SITUATIONAL_E2E_BROWSER_EXECUTABLE
const browserCandidates = configuredBrowserExecutable
  ? [configuredBrowserExecutable]
  : [
      chromium.executablePath(),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate))

fs.mkdirSync(SHOT_DIR, { recursive: true })

const results = []
const record = (name, ok, detail = '') => results.push({ name, ok, detail })

async function chooseFirstRadio(page) {
  const radio = page.locator('input[type="radio"]').first()
  await radio.locator('xpath=..').click()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await radio.isChecked()) return
    await page.waitForTimeout(50)
  }
  throw new Error('first radio did not become checked')
}

async function studentLogin(page) {
  await page.goto(`${BASE}/student/login`)
  await page.fill('input[placeholder="请输入用户名"]', USER)
  await page.fill('input[placeholder="请输入密码"]', PASS)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL('**/student', { timeout: 15000 })
}

async function main() {
  if (!browserExecutable) {
    throw new Error(`Browser executable not found; checked: ${browserCandidates.join(', ')}`)
  }
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable })
  try {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    const page = await desktop.newPage()

    await studentLogin(page)
    await page.getByRole('link', { name: '情境测评' }).click()
    await page.waitForURL('**/student/situational', { timeout: 10000 })
    await page.getByRole('heading', { name: '情境化测评', exact: true }).waitFor()
    await page.getByText('PILOT · reference NONE').first().waitFor()
    record('published-home', (await page.getByText('PILOT · reference NONE').count()) > 0)
    await page.screenshot({ path: `${SHOT_DIR}/01-home.png` })

    const instrument = page.locator('a').filter({ hasText: 'PILOT · reference NONE' }).first()
    await instrument.click()
    await page.waitForURL('**/student/situational/*', { timeout: 10000 })
    await page.getByRole('heading', { name: '情境内容', exact: true }).waitFor()
    record('runner-loaded', (await page.getByText(/情境 1 \/ /).count()) > 0)
    await page.screenshot({ path: `${SHOT_DIR}/02-runner.png` })

    // Verify the first raw answer survives a page reload against the same
    // server-owned in-progress attempt before completing the happy path.
    await chooseFirstRadio(page)
    await page.getByRole('button', { name: '情境 1，已完成', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: '情境内容', exact: true }).waitFor()
    await page.getByRole('button', { name: /情境 1/ }).click()
    await page.getByText(/情境 1 \/ /).waitFor()
    record('partial-reload-resume', await page.locator('input[type="radio"]').first().isChecked())

    // The published golden pilot currently has two SINGLE_CHOICE scenes. The
    // runner itself is data-driven and the component suite covers CONTINUOUS.
    await page.getByRole('button', { name: '下一题' }).click()
    await page.getByText(/情境 2 \/ /).waitFor()
    await chooseFirstRadio(page)
    record('raw-answers-and-navigation', true)

    await page.getByRole('button', { name: '提交测评' }).click()
    await page.waitForURL('**/student/situational/attempts/*/result', { timeout: 15000 })
    await page.getByText('测评已完成').waitFor()
    record('server-result', (await page.getByText('Construct × Channel').count()) > 0)
    await page.screenshot({ path: `${SHOT_DIR}/03-result.png` })

    await page.reload()
    await page.getByText('测评已完成').waitFor()
    record('result-refresh', true)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'JSON' }).click()
    const download = await downloadPromise
    record('json-export', download.suggestedFilename().toLowerCase().endsWith('.json'), download.suggestedFilename())

    await page.getByRole('link', { name: '测评历史' }).first().click()
    await page.waitForURL('**/student/situational/history', { timeout: 10000 })
    await page.getByRole('heading', { name: '情境测评历史', exact: true }).waitFor()
    await page.getByRole('link', { name: /查看已完成结果/ }).first().waitFor()
    record('history', (await page.getByText('已完成', { exact: true }).count()) > 0)
    await desktop.close()

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const mobilePage = await mobile.newPage()
    await studentLogin(mobilePage)
    await mobilePage.goto(`${BASE}/student/situational`)
    await mobilePage.getByRole('heading', { name: '情境化测评', exact: true }).waitFor()
    const noHorizontalOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
    record('mobile-home-layout', noHorizontalOverflow)
    await mobilePage.screenshot({ path: `${SHOT_DIR}/04-mobile-home.png` })
    await mobile.close()
  } finally {
    await browser.close()
  }

  let failed = 0
  for (const result of results) {
    if (!result.ok) failed += 1
    console.log(`${result.ok ? '✅' : '❌'} ${result.name}${result.detail ? ` :: ${result.detail}` : ''}`)
  }
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('E2E ERROR:', error.message)
  process.exit(1)
})

