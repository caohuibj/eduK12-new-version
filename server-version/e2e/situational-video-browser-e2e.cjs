// MEDIA-5 Situational VIDEO adapter acceptance.
// Real Chromium + backend + PostgreSQL + native MEDIA-4 capability delivery.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')

const BASE_URL = (process.env.SITUATIONAL_VIDEO_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.SITUATIONAL_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-video-fixture.json'
const SCREENSHOT_DIR = process.env.SITUATIONAL_VIDEO_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-video-e2e'
const candidates = [
  chromium.executablePath(),
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const executablePath = candidates.find((candidate) => fs.existsSync(candidate))
assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
const results = []
const record = (name) => { results.push(name); console.log(`[PASS] ${name}`) }

const apiFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, requestInit }) => {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`/api${pathName}`, {
    ...requestInit,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestInit.headers || {}),
    },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}, { endpoint, requestInit: init })

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const loginStudent = async (page) => {
  await page.goto(`${BASE_URL}/student/login`, { waitUntil: 'commit', timeout: 30000 })
  await page.getByPlaceholder('请输入用户名').waitFor({ state: 'visible', timeout: 60000 })
  await page.getByPlaceholder('请输入用户名').fill(fixture.student.username)
  await page.getByPlaceholder('请输入密码').fill(fixture.student.password)
  await Promise.all([
    page.waitForURL(/\/student(?:\?|$)/, { timeout: 30000 }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
}

const waitScene = async (page, title) => {
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const waitVideoReady = async (page) => {
  const video = page.locator('video[controls]').first()
  await video.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const element = document.querySelector('video[controls]')
    return element instanceof HTMLVideoElement && element.readyState >= 1 && Number.isFinite(element.duration) && element.duration > 0
  }, null, { timeout: 30000 })
  return video
}

const choose = async (page, optionKey) => {
  const input = page.locator(`input[type="radio"][value="${optionKey}"]`).first()
  await input.waitFor({ state: 'visible', timeout: 30000 })
  await input.click()
  await page.waitForFunction((value) => {
    const candidate = document.querySelector(`input[type="radio"][value="${value}"]`)
    return candidate instanceof HTMLInputElement && candidate.checked
  }, optionKey, { timeout: 30000 })
}

const startStandalone = async (page) => {
  await page.goto(`${BASE_URL}/student/situational`, { waitUntil: 'domcontentloaded' })
  const card = page.locator('a').filter({ hasText: fixture.instrument.headline }).first()
  await card.waitFor({ state: 'visible', timeout: 30000 })
  await card.click()
  await waitScene(page, fixture.instrument.videoSceneTitle)
}

const assertCapabilityUrls = (sources, label) => {
  const urls = [sources.videoUrl, sources.posterUrl, ...(sources.captions || []).map((track) => track.src)].filter(Boolean)
  assert.ok(urls.length >= 2, `${label}: expected video/poster capability URLs`)
  for (const url of urls) {
    assert.match(url, /\/api\/assets\/assessment-media\/content\?cap=/u, `${label}: not a MEDIA-4 capability URL`)
    assert.doesNotMatch(url, /recovery|authorization|bearer/i, `${label}: credential leaked in native media URL`)
    assert.equal(url.includes(fixture.publicToken), false, `${label}: public token leaked in native media URL`)
  }
}

const runStandalone = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let videoSources = null
  const nativeRequests = []
  let finalPayload = null
  page.on('response', async (response) => {
    if (!/\/api\/situational\/attempts\/[^/]+\/scenes\/VIDEO-01\/video-sources(?:\?|$)/u.test(response.url())) return
    try { videoSources = (await response.json()).data } catch { videoSources = null }
  })
  page.on('request', (request) => {
    if (request.url().includes('/api/assets/assessment-media/content?cap=')) nativeRequests.push({ url: request.url(), headers: request.headers() })
    if (request.method() === 'POST' && /\/api\/situational\/attempts\/[^/]+\/submit(?:\?|$)/u.test(request.url())) {
      try { finalPayload = request.postDataJSON() } catch { finalPayload = null }
    }
  })

  try {
    await loginStudent(page)

    let heldRoute = null
    let releaseRoute
    const held = new Promise((resolve) => { releaseRoute = resolve })
    await page.route('**/api/situational/attempts/*/scenes/VIDEO-01/video-sources', async (route) => {
      heldRoute = route
      await held
      await route.continue()
    })
    await startStandalone(page)
    await page.waitForFunction(() => Boolean(document.querySelector('input[type="radio"]')), null, { timeout: 30000 })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('input[type="radio"]')).every((node) => node.disabled), null, { timeout: 30000 })
    assert.ok(heldRoute, 'standalone capability request was not held')
    record('standalone-video-readiness-blocks-response')
    releaseRoute()
    await page.unroute('**/api/situational/attempts/*/scenes/VIDEO-01/video-sources')

    const video = await waitVideoReady(page)
    await page.waitForFunction(() => Array.from(document.querySelectorAll('input[type="radio"]')).some((node) => !node.disabled), null, { timeout: 30000 })
    await page.waitForFunction(() => document.querySelectorAll('track').length > 0, null, { timeout: 30000 })
    assertCapabilityUrls(videoSources, 'standalone')
    assert.ok(nativeRequests.length > 0, 'native media request was not observed')
    for (const request of nativeRequests) {
      assert.equal(Boolean(request.headers.authorization), false, 'native media request leaked Authorization header')
      assert.equal(Boolean(request.headers['x-recovery-token']), false, 'native media request leaked recovery token')
    }
    record('standalone-native-video-capability')

    const playback = await video.evaluate((element) => ({ currentTime: element.currentTime, duration: element.duration, ended: element.ended }))
    assert.equal(playback.ended, false)
    assert.ok(playback.currentTime < playback.duration, 'fixture unexpectedly finished before response')
    await video.dispatchEvent('ended')
    await page.waitForTimeout(150)
    await waitScene(page, fixture.instrument.videoSceneTitle)
    record('playback-ended-does-not-drive-branch')

    await choose(page, fixture.instrument.longPathOption)
    await page.getByRole('button', { name: '下一题', exact: true }).click()
    await waitScene(page, fixture.instrument.followUpTitle)
    record('answer-drives-video-branch')
    await choose(page, 'A')
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(/\/student\/situational\/attempts\/[^/]+\/result(?:\?|$)/u, { timeout: 30000 })
    await page.getByText('测评已完成', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    const payloadJson = JSON.stringify(finalPayload)
    assert.doesNotMatch(payloadJson, /currentTime|duration|ended|playing|buffering|watched|playback/i)
    record('standalone-final-has-no-playback-telemetry')

    const match = page.url().match(/\/student\/situational\/attempts\/([^/?]+)\/result/u)
    assert.ok(match?.[1])
    const attemptId = decodeURIComponent(match[1])
    const prisma = new PrismaClient()
    try {
      assert.equal(await prisma.situationalRawSubmission.count({ where: { attemptId } }), 1)
      const retained = await prisma.assetReference.findMany({
        where: { entityType: 'AssessmentFrozenRuntime', entityId: `SITUATIONAL:${attemptId}`, field: 'media' },
        select: { assetId: true },
      })
      assert.deepEqual(retained.map((entry) => entry.assetId).sort(), [fixture.media.video.assetId, fixture.media.poster.assetId, fixture.media.caption.assetId].sort())
    } finally {
      await prisma.$disconnect()
    }
    record('standalone-video-retention-and-one-final')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-standalone-video-result.png`, fullPage: true })
  } finally {
    await context.close()
  }
}

const courseForComposite = async () => {
  const prisma = new PrismaClient()
  try {
    const composite = await prisma.compositeAssessment.findUnique({
      where: { id: fixture.composite.id },
      select: { course: { select: { id: true, title: true } } },
    })
    assert.ok(composite?.course)
    return composite.course
  } finally {
    await prisma.$disconnect()
  }
}

const waitParent = async (page, parentId, recoveryToken = '') => {
  const headers = recoveryToken ? { 'X-Recovery-Token': recoveryToken } : undefined
  return assertSuccess(
    await apiFetch(page, `${recoveryToken ? '/public' : ''}/composite-assessments/attempts/${parentId}`, headers ? { headers } : {}),
    `parent ${parentId}`,
  )
}

const startAuthenticatedParent = async (page) => {
  const course = await courseForComposite()
  await page.goto(`${BASE_URL}/student/courses/${course.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: course.title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const tab = page.getByRole('button', { name: /^综合测评\s*\d*$/u }).first()
  await tab.waitFor({ state: 'visible', timeout: 30000 })
  await tab.click()
  const card = page.locator('div.card').filter({ hasText: fixture.composite.name }).first()
  await card.waitFor({ state: 'visible', timeout: 30000 })
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes(`/api/composite-assessments/${fixture.composite.id}/attempts`) && response.status() === 200)
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const body = await (await responsePromise).json()
  assert.equal(body.code, 0, body.message)
  return body.data.attempt.id
}

const enterEmbedded = async (page, parentId, publicMode = false, recoveryToken = '') => {
  const parent = await waitParent(page, parentId, recoveryToken)
  const childId = parent.currentItem?.situationalAttemptId
  assert.ok(childId)
  const prefix = publicMode ? '/public' : '/student'
  await Promise.all([
    page.waitForURL(new RegExp(`${prefix}/composite/situational/${childId}(?:\\?|$)`), { timeout: 30000 }),
    page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).click(),
  ])
  await waitScene(page, fixture.instrument.videoSceneTitle)
  return childId
}

const runAuthenticatedBundle = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let sources = null
  page.on('response', async (response) => {
    if (!response.url().includes('/video-sources')) return
    try { sources = (await response.json()).data } catch { sources = null }
  })
  try {
    await loginStudent(page)
    const parentId = await startAuthenticatedParent(page)
    const childId = await enterEmbedded(page, parentId)
    await waitVideoReady(page)
    assertCapabilityUrls(sources, 'authenticated embedded')
    record('authenticated-embedded-video-capability')
    await choose(page, fixture.instrument.earlyTerminalOption)
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(new RegExp(`/student/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`), { timeout: 30000 })
    const parent = await waitParent(page, parentId)
    assert.equal(parent.status, 'COMPLETED')
    const prisma = new PrismaClient()
    try { assert.equal(await prisma.situationalRawSubmission.count({ where: { attemptId: childId } }), 1) } finally { await prisma.$disconnect() }
    record('authenticated-embedded-video-one-final')
  } finally {
    await context.close()
  }
}

const runPublicBundle = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let sources = null
  let issuanceHeaders = null
  page.on('request', (request) => {
    if (request.url().includes('/video-sources')) issuanceHeaders = request.headers()
  })
  page.on('response', async (response) => {
    if (!response.url().includes('/video-sources')) return
    try { sources = (await response.json()).data } catch { sources = null }
  })
  try {
    await page.goto(`${BASE_URL}/public/composite/${encodeURIComponent(fixture.publicToken)}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.composite.name }).waitFor({ state: 'visible', timeout: 30000 })
    const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().includes(`/api/public/composite-assessments/${fixture.publicToken}/start`) && response.status() === 200)
    await page.getByRole('button', { name: /开始匿名测评/u, exact: true }).click()
    const body = await (await responsePromise).json()
    assert.equal(body.code, 0, body.message)
    const parentId = body.data.attempt.id
    const recoveryToken = body.data.recoveryToken
    assert.ok(parentId && recoveryToken)
    const childId = await enterEmbedded(page, parentId, true, recoveryToken)
    await waitVideoReady(page)
    assert.equal(issuanceHeaders?.['x-recovery-token'], recoveryToken)
    assertCapabilityUrls(sources, 'public embedded')
    record('public-embedded-recovery-authorizes-capability')
    await choose(page, fixture.instrument.earlyTerminalOption)
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(new RegExp(`/public/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`), { timeout: 30000 })
    const parent = await waitParent(page, parentId, recoveryToken)
    assert.equal(parent.status, 'COMPLETED')
    record('public-embedded-video-final')

    const missingContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const missingPage = await missingContext.newPage()
    let videoRequests = 0
    missingPage.on('request', (request) => { if (request.url().includes('/video-sources')) videoRequests += 1 })
    try {
      const returnTo = encodeURIComponent(`/public/composite/attempts/${parentId}`)
      await missingPage.goto(`${BASE_URL}/public/composite/situational/${childId}?compositeAttemptId=${parentId}&compositeItemId=${fixture.item.id}&returnTo=${returnTo}`, { waitUntil: 'domcontentloaded' })
      await missingPage.getByRole('alert').filter({ hasText: '恢复凭证' }).waitFor({ state: 'visible', timeout: 30000 })
      assert.equal(videoRequests, 0, 'missing recovery token reached video capability issuance')
      record('public-missing-recovery-fails-before-video')
    } finally {
      await missingContext.close()
    }
  } finally {
    await context.close()
  }
}

const main = async () => {
  assert.ok(executablePath, `browser executable not found: ${candidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    await runStandalone(browser)
    await runAuthenticatedBundle(browser)
    await runPublicBundle(browser)
  } finally {
    await browser.close()
  }
  console.log('--- MEDIA-5 Situational Video Acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('ALL PASS')
}

main().catch((error) => {
  console.error('MEDIA-5 Situational Video Acceptance failed')
  console.error(error?.stack || error)
  console.log('--- MEDIA-5 Situational Video Acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('BLOCKED')
  process.exitCode = 1
})
