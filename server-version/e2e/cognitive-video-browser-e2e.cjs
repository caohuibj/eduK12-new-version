// MEDIA-7 Cognitive VIDEO adapter + final cross-runtime acceptance.
// Real Chromium + backend + PostgreSQL + native MEDIA-4 capability delivery.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')

const BASE_URL = (process.env.COGNITIVE_VIDEO_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.COGNITIVE_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-cognitive-video-fixture.json'
const SCREENSHOT_DIR = process.env.COGNITIVE_VIDEO_E2E_SCREENSHOT_DIR || '/tmp/eduk12-cognitive-video-e2e'
const candidates = [
  chromium.executablePath(),
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const executablePath = candidates.find((candidate) => fs.existsSync(candidate))
assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const results = []
const record = (name) => { results.push(name); console.log(`[PASS] ${name}`) }

// Cognitive FINAL legitimately carries trial timing such as durationMs and
// endedAtPerfMs. Reject playback-state fields by exact JSON key instead of
// substring matching so the acceptance gate does not confuse scientific trial
// timing with video telemetry.
const playbackTelemetryKeys = new Set([
  'currenttime',
  'currenttimems',
  'duration',
  'ended',
  'playing',
  'buffering',
  'watched',
  'watchedms',
  'watchedpercentage',
  'watchpercentage',
  'playback',
  'playbackposition',
  'playbackpositionms',
  'playcount',
  'videocurrenttime',
  'videoduration',
  'videodurationms',
  'mediacurrenttime',
  'mediaduration',
  'mediadurationms',
])

const assertNoPlaybackTelemetry = (value, label) => {
  const visit = (node, path = '$') => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`))
      return
    }
    if (!node || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node)) {
      assert.equal(
        playbackTelemetryKeys.has(key.toLowerCase()),
        false,
        `${label}: playback telemetry key leaked at ${path}.${key}`,
      )
      visit(child, `${path}.${key}`)
    }
  }
  visit(value)
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

const assertCapabilityUrls = (sources, label, forbiddenCredential = '') => {
  assert.ok(sources?.videoUrl, `${label}: video capability URL missing`)
  const urls = [sources.videoUrl, sources.posterUrl, ...(sources.captions || []).map((track) => track.src)].filter(Boolean)
  assert.ok(urls.length >= 2, `${label}: expected video/poster capability URLs`)
  for (const url of urls) {
    assert.match(url, /\/api\/assets\/assessment-media\/content\?cap=/u, `${label}: not a MEDIA-4 capability URL`)
    assert.doesNotMatch(url, /authorization|bearer|recovery/i, `${label}: credential label leaked in capability URL`)
    if (forbiddenCredential) assert.equal(url.includes(forbiddenCredential), false, `${label}: recovery credential leaked in capability URL`)
  }
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

const completeFakeTask = async (page, publicMode) => {
  await page.getByRole('button', { name: '开始测评', exact: true }).click()
  for (let index = 0; index < 3; index += 1) {
    const trial = page.getByLabel(`trial ${index}`)
    await trial.waitFor({ state: 'visible', timeout: 30000 })
    await trial.click()
  }
  const finish = page.getByRole('button', { name: '完成测评', exact: true })
  await finish.waitFor({ state: 'visible', timeout: 30000 })
  await finish.click()
  const resultPattern = publicMode
    ? /\/public\/cognitive\/sessions\/[^/]+\/result\?public=1/u
    : /\/student\/cognitive\/sessions\/[^/]+\/result/u
  await page.waitForURL(resultPattern, { timeout: 30000 })
  const resultHeading = page.locator('div.card h1').first()
  await resultHeading.waitFor({ state: 'visible', timeout: 30000 })
  assert.ok((await resultHeading.textContent())?.trim(), 'result heading missing after Cognitive FINAL')
}

const runAuthenticated = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let heldRoute = null
  let releaseRoute
  const held = new Promise((resolve) => { releaseRoute = resolve })
  let sources = null
  let finalPayload = null
  const nativeRequests = []

  page.on('response', async (response) => {
    if (!/\/api\/cognitive\/sessions\/[^/]+\/video-capabilities(?:\?|$)/u.test(response.url())) return
    try { sources = (await response.json()).data } catch { sources = null }
  })
  page.on('request', (request) => {
    if (request.url().includes('/api/assets/assessment-media/content?cap=')) nativeRequests.push({ url: request.url(), headers: request.headers() })
    if (request.method() === 'POST' && /\/api\/cognitive\/sessions\/[^/]+\/submit(?:\?|$)/u.test(request.url())) {
      try { finalPayload = request.postDataJSON() } catch { finalPayload = null }
    }
  })

  try {
    await loginStudent(page)
    await page.route('**/api/cognitive/sessions/*/video-capabilities', async (route) => {
      heldRoute = route
      await held
      await route.continue()
    })
    await page.goto(`${BASE_URL}/student/cognitive/sessions/${fixture.authenticatedSession.id}`, { waitUntil: 'domcontentloaded' })
    const start = page.getByRole('button', { name: '开始测评', exact: true })
    await start.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '开始测评')
      return button instanceof HTMLButtonElement && button.disabled
    }, null, { timeout: 30000 })
    assert.ok(heldRoute, 'authenticated video capability request was not held')
    record('authenticated-video-capability-blocks-start')
    releaseRoute()

    const video = await waitVideoReady(page)
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '开始测评')
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 30000 })
    await page.waitForFunction(() => document.querySelectorAll('track').length > 0, null, { timeout: 30000 })
    assertCapabilityUrls(sources, 'authenticated')
    assert.ok(nativeRequests.length > 0, 'authenticated native media request was not observed')
    for (const request of nativeRequests) {
      assert.equal(Boolean(request.headers.authorization), false, 'native media request leaked Authorization header')
      assert.equal(Boolean(request.headers['x-recovery-token']), false, 'native media request leaked recovery token')
    }
    record('authenticated-native-video-capability')

    await video.dispatchEvent('ended')
    await page.waitForTimeout(150)
    await start.waitFor({ state: 'visible', timeout: 30000 })
    record('video-ended-does-not-start-cognitive-run')

    await completeFakeTask(page, false)
    assert.ok(finalPayload, 'authenticated final payload not observed')
    assertNoPlaybackTelemetry(finalPayload, 'authenticated FINAL')
    record('authenticated-one-final-has-no-playback-telemetry')

    const historical = await page.evaluate(async ({ sessionId }) => {
      const token = window.localStorage.getItem('token')
      const response = await fetch(`/api/cognitive/sessions/${sessionId}/video-capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoKey: 'instruction:0' }),
      })
      const body = await response.json()
      const media = body?.data?.videoUrl ? await fetch(body.data.videoUrl, { headers: { Range: 'bytes=0-31' } }) : null
      return { capabilityStatus: response.status, code: body?.code, mediaStatus: media?.status || 0 }
    }, { sessionId: fixture.authenticatedSession.id })
    assert.equal(historical.capabilityStatus, 200)
    assert.equal(historical.code, 0)
    assert.ok([200, 206].includes(historical.mediaStatus), `historical media status ${historical.mediaStatus}`)
    record('completed-session-retains-frozen-historical-video-bytes')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-authenticated-result.png`, fullPage: true })
  } finally {
    await context.close()
  }
}

const runPublic = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let sources = null
  let finalPayload = null
  const nativeRequests = []
  page.on('response', async (response) => {
    if (!/\/api\/public\/cognitive\/sessions\/[^/]+\/video-capabilities(?:\?|$)/u.test(response.url())) return
    try { sources = (await response.json()).data } catch { sources = null }
  })
  page.on('request', (request) => {
    if (request.url().includes('/api/assets/assessment-media/content?cap=')) nativeRequests.push({ headers: request.headers() })
    if (request.method() === 'POST' && /\/api\/public\/cognitive\/sessions\/[^/]+\/submit(?:\?|$)/u.test(request.url())) {
      try { finalPayload = request.postDataJSON() } catch { finalPayload = null }
    }
  })

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(({ sessionId, recoveryToken }) => {
      window.sessionStorage.setItem(`cognitive:recovery:${sessionId}`, recoveryToken)
    }, { sessionId: fixture.publicSession.id, recoveryToken: fixture.publicSession.recoveryToken })
    await page.goto(`${BASE_URL}/public/cognitive/sessions/${fixture.publicSession.id}?public=1`, { waitUntil: 'domcontentloaded' })
    const start = page.getByRole('button', { name: '开始测评', exact: true })
    await start.waitFor({ state: 'visible', timeout: 30000 })
    const video = await waitVideoReady(page)
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '开始测评')
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 30000 })
    assertCapabilityUrls(sources, 'public', fixture.publicSession.recoveryToken)
    assert.ok(nativeRequests.length > 0, 'public native media request was not observed')
    for (const request of nativeRequests) {
      assert.equal(Boolean(request.headers.authorization), false, 'public native media request leaked Authorization header')
      assert.equal(Boolean(request.headers['x-recovery-token']), false, 'public native media request leaked recovery token')
    }
    const readiness = await video.evaluate((element) => ({ readyState: element.readyState, duration: element.duration }))
    assert.ok(readiness.readyState >= 1 && readiness.duration > 0)
    record('public-recovery-credential-issues-short-lived-video-capability')

    await completeFakeTask(page, true)
    assert.ok(finalPayload, 'public final payload not observed')
    assertNoPlaybackTelemetry(finalPayload, 'public FINAL')
    assert.equal(JSON.stringify(finalPayload).includes(fixture.publicSession.recoveryToken), true, 'public FINAL must carry recovery credential in POST body')
    record('public-one-final-has-no-playback-telemetry')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-public-result.png`, fullPage: true })
  } finally {
    await context.close()
  }
}

const assertDatabaseBoundary = async () => {
  const prisma = new PrismaClient()
  try {
    for (const sessionId of [fixture.authenticatedSession.id, fixture.publicSession.id]) {
      assert.equal(await prisma.cognitiveRawSubmission.count({ where: { sessionId } }), 1, `expected one raw final for ${sessionId}`)
      assert.equal(await prisma.cognitiveTrial.count({ where: { sessionId } }), 0, `FINAL_ONLY must not persist per-trial rows for ${sessionId}`)
      const session = await prisma.cognitiveSession.findUnique({ where: { id: sessionId }, select: { status: true, compiledRuntimeHash: true } })
      assert.equal(session?.status, 'COMPLETED')
      assert.equal(session?.compiledRuntimeHash, fixture.runtime.compiledRuntimeHash)
    }
    const retained = await prisma.assetReference.findMany({
      where: {
        entityType: 'AssessmentFrozenRuntime',
        entityId: `COGNITIVE:${fixture.runtime.compiledRuntimeHash}`,
        field: 'media',
      },
      select: { assetId: true },
    })
    assert.deepEqual(
      retained.map((entry) => entry.assetId).sort(),
      [fixture.media.video.assetId, fixture.media.poster.assetId, fixture.media.caption.assetId].sort(),
    )
    record('cognitive-video-retention-one-unit-one-final-boundary')
  } finally {
    await prisma.$disconnect()
  }
}

const main = async () => {
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  try {
    await runAuthenticated(browser)
    await runPublic(browser)
    await assertDatabaseBoundary()
  } finally {
    await browser.close()
  }
  console.log(`ALL PASS (${results.length} checks)`)
}

main().catch((error) => {
  console.error('MEDIA-7 Cognitive VIDEO E2E ERROR:', error)
  process.exit(1)
})
