// FE-06 Situational required VIDEO acceptance.
// Real Chromium + backend + PostgreSQL + native MEDIA-4 capability delivery.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')
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
assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
const results = []
const record = (name) => { results.push(name); console.log(`[PASS] ${name}`) }
const apiFetch = sessionJsonFetch

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

const waitScene = async (page, title) => {
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const waitVideoReady = async (page) => {
  const player = page.locator('[data-assessment-video-player][data-required-viewing="true"]').first()
  await player.waitFor({ state: 'visible', timeout: 30000 })
  const video = player.locator('video').first()
  await video.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-assessment-video-player][data-required-viewing="true"] video')
    return element instanceof HTMLVideoElement && element.readyState >= 1 && Number.isFinite(element.duration) && element.duration > 0
  }, null, { timeout: 30000 })
  assert.equal(await video.getAttribute('controls'), null, 'required video exposed native controls')
  await page.getByText('固定播放速度', { exact: false }).count().catch(() => 0)
  return video
}

const waitResponsesDisabled = async (page) => {
  await page.waitForFunction(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="radio"]'))
    return inputs.length > 0 && inputs.every((node) => node.matches(':disabled'))
  }, null, { timeout: 30000 })
}

const waitResponsesEnabled = async (page) => {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input[type="radio"]')).some((node) => !node.matches(':disabled')), null, { timeout: 30000 })
}

const completeRequiredVideo = async (page, label) => {
  const video = await waitVideoReady(page)
  await waitResponsesDisabled(page)
  await page.getByText('请以 1× 速度从头完整观看视频后继续；不支持跳播或倍速。', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })

  await video.dispatchEvent('ended')
  await page.waitForTimeout(150)
  await waitResponsesDisabled(page)
  record(`${label}-synthetic-ended-does-not-unlock`)

  await page.getByRole('button', { name: '播放视频', exact: true }).click()
  await page.getByText('视频已完整观看，可以继续。', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await waitResponsesEnabled(page)
  record(`${label}-full-view-unlocks-response`)
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
  const csrf = assertSuccess(await apiFetch(page, '/auth/csrf'), 'standalone csrf')
  assert.ok(csrf?.csrfToken, 'standalone csrf token missing')
  const seeded = assertSuccess(await apiFetch(page, '/situational/attempts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf.csrfToken,
    },
    body: JSON.stringify({ instrumentKey: fixture.instrument.key, instrumentVersion: fixture.instrument.version }),
  }), 'seed standalone situational attempt')
  assert.ok(seeded?.attempt?.id, 'standalone seed did not return an attempt')

  await page.goto(`${BASE_URL}/student/situational/${encodeURIComponent(fixture.instrument.key)}`, { waitUntil: 'domcontentloaded' })
  await waitScene(page, fixture.instrument.videoSceneTitle)
  return seeded.attempt.id
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
    await waitResponsesDisabled(page)
    assert.ok(heldRoute, 'standalone capability request was not held')
    record('standalone-video-readiness-blocks-response')
    releaseRoute()

    const video = await waitVideoReady(page)
    await waitResponsesDisabled(page)
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
    await waitResponsesDisabled(page)
    await waitScene(page, fixture.instrument.videoSceneTitle)
    record('playback-ended-does-not-drive-branch')

    await page.getByRole('button', { name: '播放视频', exact: true }).click()
    await page.waitForTimeout(100)
    const pauseButton = page.getByRole('button', { name: '暂停视频', exact: true })
    if (await pauseButton.isVisible().catch(() => false)) await pauseButton.click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitScene(page, fixture.instrument.videoSceneTitle)
    const reloadedVideo = await waitVideoReady(page)
    await waitResponsesDisabled(page)
    const afterIncompleteReload = await reloadedVideo.evaluate((element) => element.currentTime)
    assert.ok(afterIncompleteReload <= 0.1, `incomplete reload resumed at ${afterIncompleteReload}`)
    record('incomplete-refresh-restarts-video')

    await page.getByRole('button', { name: '播放视频', exact: true }).click()
    await page.getByText('视频已完整观看，可以继续。', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await waitResponsesEnabled(page)
    record('standalone-full-view-unlocks-response')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitScene(page, fixture.instrument.videoSceneTitle)
    await waitVideoReady(page)
    await page.getByText('视频已完整观看，可以继续。', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await waitResponsesEnabled(page)
    record('standalone-completion-marker-survives-refresh')

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
    await completeRequiredVideo(page, 'authenticated-embedded')
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
    await completeRequiredVideo(page, 'public-embedded')
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
  console.log('--- FE-06 Situational Video Acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('ALL PASS')
}

main().catch((error) => {
  console.error('FE-06 Situational Video Acceptance failed')
  console.error(error?.stack || error)
  console.log('--- FE-06 Situational Video Acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('BLOCKED')
  process.exitCode = 1
})