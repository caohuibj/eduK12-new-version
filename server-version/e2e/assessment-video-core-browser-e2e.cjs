// MEDIA-4 Universal Video Core acceptance.
// Real Chromium + backend + PostgreSQL + native <video>/<track> requests.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')

const BASE_URL = (process.env.ASSESSMENT_VIDEO_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.ASSESSMENT_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-assessment-video-fixture.json'
const SCREENSHOT_DIR = process.env.ASSESSMENT_VIDEO_E2E_SCREENSHOT_DIR || '/tmp/eduk12-assessment-video-e2e'
const configuredBrowserExecutable = process.env.ASSESSMENT_VIDEO_E2E_BROWSER_EXECUTABLE
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

assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
assert.ok(BROWSER_EXECUTABLE, 'Chromium/Chrome executable not found')
const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const results = []
const record = (name, details = {}) => {
  results.push({ name, ...details })
  console.log(`[PASS] ${name}`)
}

const apiFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, requestInit }) => {
  const authToken = window.localStorage.getItem('token')
  const response = await fetch(`/api${pathName}`, {
    ...requestInit,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
  // Self-hosted acceptance jobs start a cold Vite module graph immediately
  // before this first SPA navigation. Keep the larger budget isolated here;
  // all subsequent product assertions retain their normal 30s timeout.
  await page.goto(`${BASE_URL}/student/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByPlaceholder('请输入用户名').fill(fixture.student.username)
  await page.getByPlaceholder('请输入密码').fill(fixture.student.password)
  await Promise.all([
    page.waitForURL(/\/student(?:\?|$)/, { timeout: 30000 }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
  await page.getByText('我的课程', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const absolute = (url) => new URL(url, BASE_URL).href

const exerciseNativeVideo = async (page, bundle, label) => {
  const mediaRequests = []
  const responseListener = (response) => {
    const url = response.url()
    if (!url.includes('/api/assets/assessment-media/content?cap=')) return
    const headers = response.request().headers()
    mediaRequests.push({
      url,
      status: response.status(),
      range: headers.range || null,
      recovery: headers['x-recovery-token'] || null,
      authorization: headers.authorization || null,
    })
  }
  page.on('response', responseListener)

  const outcome = await page.evaluate(async ({ presentation, sources, label: fixtureLabel }) => {
    // Fail with an explicit HTTP-contract error before relying on the browser's
    // generic MEDIA_ERR_SRC_NOT_SUPPORTED signal. This distinguishes delivery
    // failures from codec support on the CI Chromium build.
    const preflight = await fetch(sources.videoUrl, { headers: { Range: 'bytes=0-1023' } })
    const preflightType = preflight.headers.get('content-type')
    const preflightRange = preflight.headers.get('content-range')
    const preflightBytes = (await preflight.arrayBuffer()).byteLength
    if (preflight.status !== 206 || preflightType !== presentation.video.mimeType || preflightBytes <= 0) {
      throw new Error(`video range preflight failed: status=${preflight.status} type=${preflightType} range=${preflightRange} bytes=${preflightBytes}`)
    }

    document.body.innerHTML = ''
    const heading = document.createElement('h1')
    heading.textContent = fixtureLabel
    document.body.appendChild(heading)

    const video = document.createElement('video')
    video.setAttribute('data-media4-video', fixtureLabel)
    video.controls = true
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true
    video.poster = sources.posterUrl || ''
    video.src = sources.videoUrl
    for (const sourceTrack of sources.captions || []) {
      const track = document.createElement('track')
      track.kind = sourceTrack.kind
      track.src = sourceTrack.src
      track.srclang = sourceTrack.srcLang
      track.label = sourceTrack.label
      track.default = Boolean(sourceTrack.default)
      video.appendChild(track)
    }
    document.body.appendChild(video)

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video metadata timeout')), 30000)
      video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve() }, { once: true })
      video.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`video error ${video.error?.code || ''}`)) }, { once: true })
      video.load()
    })

    const seek = (time) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`seek timeout ${time}`)), 15000)
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve() }, { once: true })
      video.currentTime = time
    })

    await seek(1)
    await video.play()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    video.pause()
    await seek(Math.min(8, Math.max(1, video.duration - 1)))

    const textTrack = video.textTracks[0]
    if (textTrack) textTrack.mode = 'showing'
    await new Promise((resolve) => setTimeout(resolve, 500))
    const cues = textTrack?.cues ? Array.from(textTrack.cues).map((cue) => cue.text) : []

    const head = await fetch(sources.videoUrl, { method: 'HEAD' })
    const multi = await fetch(sources.videoUrl, { headers: { Range: 'bytes=0-1,4-5' } })

    return {
      duration: video.duration,
      finalTime: video.currentTime,
      cues,
      poster: video.poster,
      trackCount: video.textTracks.length,
      preflightStatus: preflight.status,
      preflightType,
      preflightRange,
      preflightBytes,
      headStatus: head.status,
      headAcceptRanges: head.headers.get('accept-ranges'),
      multiStatus: multi.status,
      multiContentRange: multi.headers.get('content-range'),
      presentationTitle: presentation.title,
    }
  }, { presentation: bundle.presentation, sources: bundle.sources, label })

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${label}.png`), fullPage: true })
  page.off('response', responseListener)

  const videoUrl = absolute(bundle.sources.videoUrl)
  const posterUrl = bundle.sources.posterUrl ? absolute(bundle.sources.posterUrl) : null
  const captionUrls = (bundle.sources.captions || []).map((track) => absolute(track.src))

  assert.equal(outcome.preflightStatus, 206, `${label}: Range preflight must be 206`)
  assert.equal(outcome.preflightType, bundle.presentation.video.mimeType, `${label}: Range preflight MIME mismatch`)
  assert.ok(outcome.preflightRange?.startsWith('bytes 0-'), `${label}: Range preflight missing Content-Range`)
  assert.ok(outcome.preflightBytes > 0, `${label}: Range preflight returned no bytes`)
  assert.ok(Number.isFinite(outcome.duration) && outcome.duration > 5, `${label}: invalid duration`)
  assert.ok(outcome.finalTime >= 6, `${label}: native seek did not complete`)
  assert.equal(outcome.trackCount, 1, `${label}: caption track missing`)
  assert.ok(outcome.cues.some((cue) => cue.includes('MEDIA-4 caption visible')), `${label}: VTT cues not parsed`)
  assert.equal(outcome.headStatus, 200, `${label}: HEAD must be 200 without Range`)
  assert.equal(outcome.headAcceptRanges, 'bytes', `${label}: HEAD missing Accept-Ranges`)
  assert.equal(outcome.multiStatus, 416, `${label}: multi-range policy must reject with 416`)
  assert.ok(outcome.multiContentRange?.startsWith('bytes */'), `${label}: 416 missing unsatisfied Content-Range`)
  assert.ok(mediaRequests.some((item) => item.url === videoUrl && item.status === 206 && item.range?.startsWith('bytes=')), `${label}: native video never exercised 206 Range`)
  assert.ok(!posterUrl || mediaRequests.some((item) => item.url === posterUrl && item.status === 200), `${label}: poster capability was not delivered`)
  for (const captionUrl of captionUrls) {
    assert.ok(mediaRequests.some((item) => item.url === captionUrl && item.status === 200), `${label}: VTT capability was not delivered`)
  }
  assert.ok(mediaRequests.every((item) => !item.recovery), `${label}: recovery credential leaked into native media request`)
  assert.ok(mediaRequests.every((item) => !item.authorization), `${label}: account authorization leaked into native media request`)
  record(`${label}-native-range-seek-caption`, { mediaRequests, outcome })
  return mediaRequests
}

const main = async () => {
  const browser = await chromium.launch({ executablePath: BROWSER_EXECUTABLE, headless: true })
  try {
    const authContext = await browser.newContext()
    const authPage = await authContext.newPage()
    await loginStudent(authPage)
    const authBundle = assertSuccess(
      await apiFetch(authPage, '/assets/assessment-media/e2e/auth-capabilities'),
      'authenticated capability issuance',
    )
    assert.ok(authBundle.sources.videoUrl.includes('cap='))
    assert.ok(!authBundle.sources.videoUrl.includes(fixture.student.password))
    await exerciseNativeVideo(authPage, authBundle, 'authenticated')
    await authContext.close()

    const publicContext = await browser.newContext()
    const publicPage = await publicContext.newPage()
    await publicPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    const missing = await apiFetch(publicPage, '/assets/assessment-media/e2e/public-capabilities')
    assert.equal(missing.status, 401, 'public capability issuance must fail closed without recovery credential')
    record('public-missing-recovery-fails-closed')

    const publicBundle = assertSuccess(
      await apiFetch(publicPage, '/assets/assessment-media/e2e/public-capabilities', {
        headers: { 'X-Recovery-Token': fixture.publicRecoveryToken },
      }),
      'public capability issuance',
    )
    assert.ok(publicBundle.sources.videoUrl.includes('cap='))
    assert.ok(!publicBundle.sources.videoUrl.includes(fixture.publicRecoveryToken), 'recovery token leaked into capability URL')
    await exerciseNativeVideo(publicPage, publicBundle, 'public')
    await publicContext.close()

    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'acceptance.json'), JSON.stringify({
      scopeId: fixture.scopeId,
      videoAssetId: fixture.presentation.video.assetId,
      results,
    }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
