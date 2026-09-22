const { isAssetApiGet } = require('./helpers/asset-request.cjs')
// PR-D/PR-E seeded browser acceptance gate.
//
// The workflow creates a disposable PostgreSQL/Redis environment, seeds one
// student Bundle and one public access token, starts the backend/frontend, and
// points this existing Playwright-core harness at that isolated pair.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ]
const BROWSER_EXECUTABLE = browserCandidates.find((candidate) => fs.existsSync(candidate))

const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
const results = []

const record = (name) => {
  results.push(name)
  console.log(`[PASS] ${name}`)
}

const apiFetch = sessionJsonFetch

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const normalizeFrozenIdentity = (attempt) => ({
  instrumentKey: attempt.instrumentKey,
  instrumentVersion: attempt.instrumentVersion,
  definitionHash: attempt.definitionHash,
  compiledRuntimeHash: attempt.compiledRuntimeHash,
  scorerKey: attempt.scorerKey,
  scoringVersion: attempt.scoringVersion,
  runtimeGeneration: attempt.runtimeGeneration,
  deliveryMode: attempt.deliveryMode,
  attemptEpoch: attempt.attemptEpoch,
  frozenAt: attempt.frozenAt instanceof Date ? attempt.frozenAt.toISOString() : String(attempt.frozenAt),
})

const readFrozenIdentity = async (attemptId) => {
  const prisma = new PrismaClient()
  try {
    const attempt = await prisma.situationalAttempt.findUnique({
      where: { id: attemptId },
      select: {
        instrumentKey: true,
        instrumentVersion: true,
        definitionHash: true,
        compiledRuntimeHash: true,
        scorerKey: true,
        scoringVersion: true,
        runtimeGeneration: true,
        deliveryMode: true,
        attemptEpoch: true,
        frozenAt: true,
      },
    })
    assert.ok(attempt, `Situational attempt ${attemptId} not found for frozen identity`)
    return normalizeFrozenIdentity(attempt)
  } finally {
    await prisma.$disconnect()
  }
}

const waitForParentState = async (page, parentId, recoveryToken = '') => {
  const headers = recoveryToken ? { 'X-Recovery-Token': recoveryToken } : undefined
  return assertSuccess(
    await apiFetch(page, `${recoveryToken ? '/public' : ''}/composite-assessments/attempts/${parentId}`, headers ? { headers } : {}),
    `parent state ${parentId}`,
  )
}

const waitForRunner = async (page) => {
  await page.locator('[data-assessment-shell-header]').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText(/情境 [12] \/ 2/).waitFor({ state: 'visible', timeout: 30000 })
}

const chooseFirstOption = async (page) => {
  const option = page.locator('input[type="radio"]').first()
  await option.waitFor({ state: 'visible', timeout: 30000 })
  // The runner controls the radio value from an IndexedDB-backed async
  // draft write. A real click exercises the user path without making
  // Playwright require the controlled DOM state to change synchronously.
  await option.click()
  await page.waitForFunction(() => {
    const candidate = document.querySelector('input[type="radio"]')
    return candidate instanceof HTMLInputElement && candidate.checked
  }, null, { timeout: 30000 })
  assert.equal(await option.isChecked(), true, 'selected option was not reflected in the runner')
  await page.locator('button[aria-current="step"][aria-label$="，已完成"]').waitFor({ state: 'visible', timeout: 30000 })
}

const assertVisualScene = async (page, sceneIndex) => {
  if (!fixture.visual) return
  const expected = sceneIndex === 1
    ? [fixture.visual.image]
    : fixture.visual.comic.panels
  const images = page.locator('img[data-asset-id]')
  await images.first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('img[data-asset-id]')).length > 0
      && Array.from(document.querySelectorAll('img[data-asset-id]')).every((image) => image.naturalWidth > 0 && image.naturalHeight > 0)
  ), null, { timeout: 30000 })
  const actual = await images.evaluateAll((nodes) => nodes.map((node) => ({
    assetId: node.getAttribute('data-asset-id'),
    alt: node.getAttribute('alt'),
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
  })))
  assert.deepEqual(actual.map((image) => image.assetId), expected.map((image) => image.assetId), 'visual asset order does not match the frozen definition')
  assert.deepEqual(
    actual.map((image) => image.alt),
    expected.map((image) => image.altText),
    `visual alt text does not match the frozen definition: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  )
  assert.ok(actual.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0), 'visual asset did not decode')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'visual runner has horizontal overflow')
  record(sceneIndex === 1 ? 'visual-image-visible' : 'visual-comic-visible')
}

const waitForSubmitEnabled = async (page) => {
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('提交测评'))
    return Boolean(button && !button.disabled)
  }, null, { timeout: 30000 })
}

const navigateToScene = async (page, index, completed) => {
  const label = `情境 ${index}，${completed ? '已完成' : '未完成'}`
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByText(new RegExp(`情境 ${index} \/ 2`)).waitFor({ state: 'visible', timeout: 30000 })
}

const assertAggregateSafe = (payload, label) => {
  const json = JSON.stringify(payload)
  for (const key of ['sceneKey', 'optionKey', 'choiceScores', 'responseTime', 'percentile']) {
    assert.doesNotMatch(json, new RegExp(`"${key}"\\s*:`, 'i'), `${label} leaked ${key}`)
  }
  const forbiddenArrayKeys = new Set(['responses', 'rawresponses', 'rawresponse', 'responsearray', 'responsepayload', 'rawpayload'])
  const visit = (value, currentPath = '$') => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child, currentPath)
      return
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.replace(/[_-]/g, '').toLowerCase()
      assert.ok(!(Array.isArray(child) && forbiddenArrayKeys.has(normalized)), `${label} leaked raw response array at ${currentPath}.${key}`)
      visit(child, `${currentPath}.${key}`)
    }
  }
  visit(payload)
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
  await page.getByText('我的课程', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const startAuthenticatedParent = async (page) => {
  await page.goto(`${BASE_URL}/student/courses/${fixture.course.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: fixture.course.title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const compositeTab = page.getByRole('button', { name: /^综合测评\s*\d*$/ }).first()
  await compositeTab.waitFor({ state: 'visible', timeout: 30000 })
  await compositeTab.click()
  await page.getByText(fixture.composite.name, { exact: true }).waitFor({ state: 'visible', timeout: 30000 })

  const card = page.locator('div.card').filter({ hasText: fixture.composite.name }).first()
  const startResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
      && response.url().includes(`/api/composite-assessments/${fixture.composite.id}/attempts`)
      && response.status() === 200
  ), { timeout: 30000 })
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const startResponse = await startResponsePromise
  const startBody = await startResponse.json()
  assert.equal(startBody.code, 0, startBody.message || 'authenticated Bundle start failed')
  const parentId = startBody.data.attempt.id
  assert.ok(parentId, 'authenticated parent attempt id is missing')
  await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  return parentId
}

const enterEmbeddedRunner = async (page, parentId, publicMode = false, recoveryToken = '') => {
  const parent = await waitForParentState(page, parentId, recoveryToken)
  assert.equal(parent.currentItem?.type, 'SITUATIONAL', 'Bundle current item is not Situational')
  const childId = parent.currentItem?.situationalAttemptId
  assert.ok(childId, 'Bundle did not expose a Situational child attempt')
  const routePrefix = publicMode ? '/public' : '/student'
  const button = page.getByRole('button', { name: '开始/继续文字情境测评', exact: true })
  await Promise.all([
    page.waitForURL(new RegExp(`${routePrefix}/composite/situational/${childId}(?:\\?|$)`), { timeout: 30000 }),
    button.click(),
  ])
  await waitForRunner(page)
  return childId
}

const completeEmbeddedRunner = async (page, parentId, childId, publicMode = false, recoveryToken = '') => {
  const submitPath = `${publicMode ? '/api/public' : '/api'}/composite-assessments/attempts/${parentId}/items/${fixture.item.id}/situational/${childId}/submit`
  let submitCount = 0
  const unsafeRequests = []
  const onRequest = (request) => {
    const method = request.method()
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      unsafeRequests.push({ method, pathname })
    }
    if (method === 'POST' && pathname === submitPath) submitCount += 1
  }
  page.on('request', onRequest)
  try {
    await assertVisualScene(page, 1)
    await chooseFirstOption(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForRunner(page)
    assert.equal(await page.locator('input[type="radio"]').first().isChecked(), false, 'reload should resume at the first missing scene')
    await navigateToScene(page, 1, true)
    await assertVisualScene(page, 1)
    assert.equal(await page.locator('input[type="radio"]').first().isChecked(), true, 'first scene answer was not restored locally')
    assert.deepEqual(unsafeRequests, [], 'answer/navigation/reload emitted an unsafe API write before FINAL')
    record(publicMode ? 'public-local-draft-zero-server-writes' : 'local-draft-zero-server-writes')
    record(publicMode ? 'public-recovery-resume' : 'partial-reload-resume')

    await navigateToScene(page, 2, false)
    await assertVisualScene(page, 2)
    const submitButton = page.getByRole('button', { name: '提交测评', exact: true })
    await submitButton.click()
    await page.getByRole('alert').filter({ hasText: '还有必答通道未完成' }).waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForTimeout(200)
    assert.equal(submitCount, 0, 'incomplete FINAL emitted a submit request')
    assert.deepEqual(unsafeRequests, [], 'incomplete FINAL emitted an unsafe API write')
    if (!publicMode) record('required-response-blocked')

    await chooseFirstOption(page)
    await waitForSubmitEnabled(page)
    const routePrefix = publicMode ? '/public' : '/student'
    const parentRoute = new RegExp(`${routePrefix}/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`)
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('提交测评'))
      if (!button) throw new Error('FINAL button not found')
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForURL(parentRoute, { timeout: 30000 })
    await page.waitForTimeout(300)
    assert.equal(submitCount, 1, 'rapid duplicate FINAL emitted more than one logical submit')
    assert.deepEqual(unsafeRequests, [{ method: 'POST', pathname: submitPath }], 'runner emitted unsafe writes outside the single FINAL submit')
    record(publicMode ? 'public-final-return' : 'single-final')
  } finally {
    page.off('request', onRequest)
  }

  const parent = await waitForParentState(page, parentId, recoveryToken)
  assert.equal(parent.status, 'COMPLETED', 'parent Bundle did not complete')
  assert.equal(parent.progress, 100, 'parent Bundle progress is not 100')
  assert.match(page.url(), new RegExp(`${publicMode ? '/public' : '/student'}/composite/attempts/${parentId}`))
  if (!publicMode) record('return-to-bundle')
  return parent
}

const assertCompletedSlotDoesNotRestart = async (page, parentId) => {
  await page.goto(`${BASE_URL}/student/composite/attempts/${parentId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(new RegExp(`/student/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`), { timeout: 30000 })
  const state = await waitForParentState(page, parentId)
  assert.equal(state.status, 'COMPLETED')
  assert.equal(state.progress, 100)
  assert.equal(await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).count(), 0, 'completed slot became restartable')
  record('completed-slot-reopen')
}

const runAuthenticatedFlow = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await loginStudent(page)
    const parentId = await startAuthenticatedParent(page)
    record('authenticated-bundle-entry')
    const childId = await enterEmbeddedRunner(page, parentId)
    const frozenIdentity = await readFrozenIdentity(childId)
    record('embedded-child')
    await completeEmbeddedRunner(page, parentId, childId)
    await assertCompletedSlotDoesNotRestart(page, parentId)
    const report = assertSuccess(await apiFetch(page, `/composite-assessments/attempts/${parentId}/report`), 'authenticated report')
    assertAggregateSafe(report, 'authenticated report')
    record('aggregate-safe-output')
    return { parentId, childId, frozenIdentity }
  } finally {
    await context.close()
  }
}

const runPublicFlow = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    const token = encodeURIComponent(fixture.publicToken)
    const publicInfoResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'GET'
        && response.url().includes('/api/public/composite-assessments/' + fixture.publicToken)
    ), { timeout: 30000 })
    await page.goto(`${BASE_URL}/public/composite/${token}`, { waitUntil: 'domcontentloaded' })
    const publicInfoResponse = await publicInfoResponsePromise
    assert.equal(publicInfoResponse.status(), 200, `public info: HTTP ${publicInfoResponse.status()}`)
    const publicInfoBody = await publicInfoResponse.json()
    assert.equal(publicInfoBody.code, 0, `public info: ${publicInfoBody.message || 'API error'}`)
    assert.equal(publicInfoBody.data?.name, fixture.composite.name, 'public info returned the wrong composite')
    await page.getByRole('heading', { name: fixture.composite.name }).waitFor({ state: 'visible', timeout: 30000 })
    const startResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
        && response.url().includes(`/api/public/composite-assessments/${fixture.publicToken}/start`)
        && response.status() === 200
    ), { timeout: 30000 })
    await page.getByRole('button', { name: /开始匿名测评/, exact: true }).click()
    const startResponse = await startResponsePromise
    const startBody = await startResponse.json()
    assert.equal(startBody.code, 0, startBody.message || 'public Bundle start failed')
    const parentId = startBody.data.attempt.id
    const recoveryToken = startBody.data.recoveryToken
    assert.ok(parentId, 'public parent attempt id is missing')
    assert.ok(recoveryToken, 'public recovery token was not issued')
    await page.waitForFunction((key) => Boolean(window.sessionStorage.getItem(key)), `composite:recovery:attempt:${parentId}`, { timeout: 30000 })
    await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    const childId = await enterEmbeddedRunner(page, parentId, true, recoveryToken)
    const frozenIdentity = await readFrozenIdentity(childId)
    await completeEmbeddedRunner(page, parentId, childId, true, recoveryToken)
    const report = assertSuccess(
      await apiFetch(page, `/public/composite-assessments/attempts/${parentId}/report`, { headers: { 'X-Recovery-Token': recoveryToken } }),
      'public report',
    )
    assertAggregateSafe(report, 'public report')

    const missingContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const missingPage = await missingContext.newPage()
    let embeddedGetRequests = 0
    let assetGetRequests = 0
    missingPage.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes(`/api/public/composite-assessments/attempts/${parentId}/items/${fixture.item.id}/situational/${childId}`)) embeddedGetRequests += 1
      if (isAssetApiGet(request)) assetGetRequests += 1
    })
    try {
      const returnTo = encodeURIComponent(`/public/composite/attempts/${parentId}`)
      await missingPage.goto(`${BASE_URL}/public/composite/situational/${childId}?compositeAttemptId=${parentId}&compositeItemId=${fixture.item.id}&returnTo=${returnTo}`, { waitUntil: 'domcontentloaded' })
      await missingPage.getByRole('alert').filter({ hasText: '恢复凭证' }).waitFor({ state: 'visible', timeout: 30000 })
      assert.equal(embeddedGetRequests, 0, 'missing public recovery token reached the embedded API')
      assert.equal(assetGetRequests, 0, 'missing public recovery token reached the asset API')
      record('public-missing-token-rejected')
    } finally {
      await missingContext.close()
    }
    return { parentId, childId, frozenIdentity }
  } finally {
    await context.close()
  }
}

const assertDurableCompletion = async (parentId, childId, label, frozenIdentity) => {
  const prisma = new PrismaClient()
  try {
    const parent = await prisma.compositeAssessmentAttempt.findUnique({
      where: { id: parentId },
      select: { status: true, progress: true },
    })
    assert.equal(parent?.status, 'COMPLETED', `${label}: parent is not COMPLETED`)
    assert.equal(parent?.progress, 100, `${label}: parent progress is not 100`)

    const children = await prisma.situationalAttempt.findMany({
      where: { compositeAttemptId: parentId },
      select: { id: true, status: true },
    })
    assert.equal(children.length, 1, `${label}: expected one SituationalAttempt, got ${children.length}`)
    assert.equal(children[0].id, childId, `${label}: unexpected child attempt`)
    assert.equal(children[0].status, 'COMPLETED', `${label}: child is not COMPLETED`)
    record(`${label}-SituationalAttempt: 1`)

    const completedAttempt = await prisma.situationalAttempt.findUnique({
      where: { id: childId },
      select: {
        instrumentKey: true,
        instrumentVersion: true,
        definitionHash: true,
        compiledRuntimeHash: true,
        scorerKey: true,
        scoringVersion: true,
        runtimeGeneration: true,
        deliveryMode: true,
        attemptEpoch: true,
        frozenAt: true,
      },
    })
    assert.ok(completedAttempt, `${label}: completed attempt missing`)
    assert.deepEqual(normalizeFrozenIdentity(completedAttempt), frozenIdentity, `${label}: frozen runtime identity changed across FINAL`)
    record(`${label}-frozen-runtime-identity-stable`)

    const rawCount = await prisma.situationalRawSubmission.count({ where: { attemptId: childId } })
    assert.equal(rawCount, 1, `${label}: expected one raw submission, got ${rawCount}`)
    record(`${label}-SituationalRawSubmission: 1`)

    const snapshots = await prisma.assessmentUnitSnapshot.findMany({
      where: { compositeAttemptId: parentId, sourceAttemptId: childId },
      select: { unitType: true, payloadKind: true, sourceAttemptId: true },
    })
    assert.equal(snapshots.length, 1, `${label}: expected one canonical UnitResult snapshot, got ${snapshots.length}`)
    assert.equal(snapshots[0].unitType, 'SITUATIONAL')
    assert.equal(snapshots[0].payloadKind, 'UNIT_RESULT')
    assert.equal(snapshots[0].sourceAttemptId, childId)
    record(`${label}-SITUATIONAL UNIT_RESULT snapshot: 1`)

    if (fixture.visual) {
      const expectedAssetIds = [
        fixture.visual.image.assetId,
        ...fixture.visual.comic.panels.map((panel) => panel.assetId),
      ].sort()
      const retained = await prisma.assetReference.findMany({
        where: {
          entityType: 'AssessmentFrozenRuntime',
          entityId: `SITUATIONAL:${childId}`,
          field: 'media',
        },
        select: { assetId: true },
      })
      assert.deepEqual(retained.map((reference) => reference.assetId).sort(), expectedAssetIds, `${label}: frozen visual AssetReferences are incomplete after FINAL`)
      record(`${label}-AssessmentFrozenRuntime media refs: ${retained.length}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

const main = async () => {
  assert.ok(fs.existsSync(FIXTURE_FILE), `fixture not found: ${FIXTURE_FILE}`)
  assert.ok(BROWSER_EXECUTABLE, `browser executable not found; checked: ${browserCandidates.join(', ')}`)
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  try {
    const authenticated = await runAuthenticatedFlow(browser)
    await assertDurableCompletion(authenticated.parentId, authenticated.childId, 'authenticated', authenticated.frozenIdentity)
    const publicFlow = await runPublicFlow(browser)
    await assertDurableCompletion(publicFlow.parentId, publicFlow.childId, 'public', publicFlow.frozenIdentity)
    console.log('--- seeded Situational Bundle acceptance ---')
    for (const name of results) console.log(`✅ ${name}`)
    console.log('ALL PASS')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Seeded Situational Bundle acceptance failed')
  console.error(error && error.stack ? error.stack : error)
  console.log('--- seeded Situational Bundle acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('BLOCKED')
  process.exitCode = 1
})