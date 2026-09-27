// FE-11 C3 focused fault gates for final-only Situational delivery.
// 1) IndexedDB open denial must fail closed before any FINAL.
// 2) Two tabs sharing one durable draft may replay the same logical FINAL, but
//    must converge to one authoritative raw submission and canonical snapshot.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')
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
let fixture = null

const reseedFaultFixture = () => {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(npx, ['tsx', '../e2e/situational-bundle-browser-fixture.ts'], {
    cwd: path.resolve(__dirname, '../backend'),
    env: process.env,
    stdio: 'inherit',
  })
  assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found after reseed: ${FIXTURE_FILE}`)
  fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
}

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

const childFor = async (page, parentId) => {
  const parent = assertSuccess(
    await sessionJsonFetch(page, `/composite-assessments/attempts/${parentId}`),
    `parent state ${parentId}`,
  )
  assert.equal(parent.currentItem?.type, 'SITUATIONAL')
  assert.ok(parent.currentItem?.situationalAttemptId, 'Situational child attempt missing')
  return parent.currentItem.situationalAttemptId
}

const enterChild = async (page, parentId, childId) => {
  await page.goto(`${BASE_URL}/student/composite/attempts/${parentId}`, { waitUntil: 'domcontentloaded' })
  const enter = page.getByRole('button', { name: '开始/继续文字情境测评', exact: true })
  await enter.waitFor({ state: 'visible', timeout: 30000 })
  await Promise.all([
    page.waitForURL(new RegExp(`/student/composite/situational/${childId}(?:\\?|$)`), { timeout: 30000 }),
    enter.click(),
  ])
}

const waitRunner = async (page, sceneIndex) => {
  await page.locator('[data-assessment-shell-header]').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText(new RegExp(`情境 ${sceneIndex} \\/ 2`)).waitFor({ state: 'visible', timeout: 30000 })
}

const chooseFirstOption = async (page) => {
  const option = page.locator('input[type="radio"]').first()
  await option.waitFor({ state: 'visible', timeout: 30000 })
  await option.click()
  await page.waitForFunction(() => {
    const candidate = document.querySelector('input[type="radio"]')
    return candidate instanceof HTMLInputElement && candidate.checked
  }, null, { timeout: 30000 })
}

const waitSubmitEnabled = async (page) => {
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('提交测评'))
    return Boolean(button && !button.disabled)
  }, null, { timeout: 30000 })
}

const runStorageFault = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(() => {
    const deniedIndexedDb = {
      open() {
        throw new DOMException('IndexedDB access denied by FE-11 fault injection', 'SecurityError')
      },
    }
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: deniedIndexedDb })
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
    const childId = await childFor(page, parentId)
    await enterChild(page, parentId, childId)
    await page.getByText('无法打开本地测评草稿存储', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.getByRole('button', { name: '提交测评', exact: true }).count(), 0, 'storage failure exposed FINAL action')
    assert.equal(finalSubmitRequests, 0, 'storage failure emitted FINAL request')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'fe-11-storage-fault.png'), fullPage: true })
    console.log('FE-11 storage denial fail-closed: PASS')
    return { parentId, childId }
  } finally {
    await context.close()
  }
}

const runDuplicateTabReplay = async (browser, parentId, childId) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pageA = await context.newPage()
  let pageB = null
  const observedFinals = []
  const submitPath = `/api/composite-assessments/attempts/${parentId}/items/${fixture.item.id}/situational/${childId}/submit`

  try {
    await loginStudent(pageA)
    await enterChild(pageA, parentId, childId)
    await waitRunner(pageA, 1)
    await chooseFirstOption(pageA)

    // Reload is the durability barrier: scene 2 is selected only if scene 1 was
    // committed to the shared IndexedDB draft rather than held in component state.
    await pageA.reload({ waitUntil: 'domcontentloaded' })
    await waitRunner(pageA, 2)

    pageB = await context.newPage()
    await pageB.goto(pageA.url(), { waitUntil: 'domcontentloaded' })
    await waitRunner(pageB, 2)

    await chooseFirstOption(pageA)
    await chooseFirstOption(pageB)
    await waitSubmitEnabled(pageA)
    await waitSubmitEnabled(pageB)

    await context.route(`**${submitPath}`, async (route) => {
      const request = route.request()
      try { observedFinals.push(request.postDataJSON()) } catch { observedFinals.push(null) }
      // Keep the first response in flight long enough for the second tab to seal
      // against the same IndexedDB transaction state instead of observing cleanup.
      await new Promise((resolve) => setTimeout(resolve, 750))
      await route.continue()
    })

    const parentRoute = new RegExp(`/student/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`)
    const navA = pageA.waitForURL(parentRoute, { timeout: 30000 })
    const navB = pageB.waitForURL(parentRoute, { timeout: 30000 })
    await Promise.all([
      navA,
      navB,
      pageA.getByRole('button', { name: '提交测评', exact: true }).click(),
      pageB.getByRole('button', { name: '提交测评', exact: true }).click(),
    ])
    await context.unroute(`**${submitPath}`)

    assert.ok(observedFinals.length >= 1 && observedFinals.length <= 2, `unexpected duplicate-tab FINAL request count: ${observedFinals.length}`)
    const submissionIds = new Set(observedFinals.map((payload) => payload?.submissionId).filter(Boolean))
    assert.equal(submissionIds.size, 1, 'duplicate tabs did not replay one logical submissionId')
    const [submissionId] = [...submissionIds]

    const prisma = new PrismaClient()
    try {
      const attempt = await prisma.situationalAttempt.findUnique({
        where: { id: childId },
        select: { status: true, submissionId: true },
      })
      assert.equal(attempt?.status, 'COMPLETED')
      assert.equal(attempt?.submissionId, submissionId)
      assert.equal(await prisma.situationalRawSubmission.count({ where: { attemptId: childId } }), 1, 'duplicate tabs created multiple raw submissions')
      const snapshots = await prisma.assessmentUnitSnapshot.findMany({
        where: { compositeAttemptId: parentId, sourceAttemptId: childId },
        select: { payloadKind: true, unitType: true, sourceSubmissionId: true },
      })
      assert.equal(snapshots.length, 1, 'duplicate tabs created multiple canonical snapshots')
      assert.equal(snapshots[0].payloadKind, 'UNIT_RESULT')
      assert.equal(snapshots[0].unitType, 'SITUATIONAL')
      assert.equal(snapshots[0].sourceSubmissionId, submissionId)
    } finally {
      await prisma.$disconnect()
    }

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'fe-11-duplicate-tab-a.png'), fullPage: true })
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'fe-11-duplicate-tab-b.png'), fullPage: true })
    console.log(`FE-11 duplicate-tab replay: PASS (${observedFinals.length} HTTP FINAL request(s), 1 logical submissionId)`)
  } finally {
    await context.unroute(`**${submitPath}`).catch(() => undefined)
    await context.close()
  }
}

const main = async () => {
  assert.ok(BROWSER_EXECUTABLE, `browser executable not found; checked: ${browserCandidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  reseedFaultFixture()

  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  try {
    const attempt = await runStorageFault(browser)
    await runDuplicateTabReplay(browser, attempt.parentId, attempt.childId)
    console.log('FE-11 focused storage/duplicate-tab fault gates: ALL PASS')
  } finally {
    await browser.close()
  }
}

main().then(() => {
  execFileSync(path.resolve(__dirname, '../backend/node_modules/.bin/tsx'), [
    path.resolve(__dirname, 'prelaunch-start-intent-browser-e2e.cjs'),
  ], { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit', timeout: 180000 })
}).catch((error) => {
  console.error('FE-11 focused storage/duplicate-tab fault gates: FAIL')
  console.error(error?.stack || error)
  process.exitCode = 1
})