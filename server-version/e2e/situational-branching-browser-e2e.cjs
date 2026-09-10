// SIT-V2-E final branching acceptance gate.
// Real Chromium + IndexedDB + backend + PostgreSQL; fixture is CI-only.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')

const BASE_URL = (process.env.SITUATIONAL_BRANCHING_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.SITUATIONAL_BRANCHING_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-branching-fixture.json'
const SCREENSHOT_DIR = process.env.SITUATIONAL_BRANCHING_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-branching-e2e'
const configuredBrowserExecutable = process.env.SITUATIONAL_BRANCHING_E2E_BROWSER_EXECUTABLE
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
  await page.getByText('我的课程', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const waitScene = async (page, title) => {
  await page.getByRole('heading', { name: '文字情境测评', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const chooseOption = async (page, optionKey) => {
  const option = page.locator(`input[type="radio"][value="${optionKey}"]`).first()
  await option.waitFor({ state: 'visible', timeout: 30000 })
  await option.click()
  await page.waitForFunction((value) => {
    const candidate = document.querySelector(`input[type="radio"][value="${value}"]`)
    return candidate instanceof HTMLInputElement && candidate.checked
  }, optionKey, { timeout: 30000 })
  assert.equal(await option.isChecked(), true, `option ${optionKey} was not persisted`)
}

const setConfidence = async (page, value) => {
  const range = page.locator('input[type="range"]').first()
  await range.waitFor({ state: 'visible', timeout: 30000 })
  await range.fill(String(value))
  await page.waitForFunction((expected) => {
    const candidate = document.querySelector('input[type="range"]')
    return candidate instanceof HTMLInputElement && candidate.value === String(expected)
  }, value, { timeout: 30000 })
}

const waitProgress = async (page, answered, total) => {
  await page.getByText(`已完成 ${answered} / ${total} 个必答通道`, { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const nextScene = async (page, title) => {
  await page.getByRole('button', { name: '下一题', exact: true }).click()
  await waitScene(page, title)
}

const navigateScene = async (page, index, completed = true) => {
  await page.getByRole('button', { name: `情境 ${index}，${completed ? '已完成' : '未完成'}`, exact: true }).click()
}

const assertImageScene = async (page) => {
  const image = page.locator('img[data-asset-id]').first()
  await image.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const candidate = document.querySelector('img[data-asset-id]')
    return candidate instanceof HTMLImageElement && candidate.naturalWidth > 0 && candidate.naturalHeight > 0
  }, null, { timeout: 30000 })
  assert.equal(await image.getAttribute('data-asset-id'), fixture.visual.image.assetId)
  assert.equal(await image.getAttribute('alt'), fixture.visual.image.altText)
  record('branch-image-visible')
}

const assertComicScene = async (page) => {
  const images = page.locator('img[data-asset-id]')
  await images.first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const candidates = Array.from(document.querySelectorAll('img[data-asset-id]'))
    return candidates.length === 2 && candidates.every((candidate) => candidate instanceof HTMLImageElement && candidate.naturalWidth > 0 && candidate.naturalHeight > 0)
  }, null, { timeout: 30000 })
  const actual = await images.evaluateAll((nodes) => nodes.map((node) => ({
    assetId: node.getAttribute('data-asset-id'),
    alt: node.getAttribute('alt'),
  })))
  assert.deepEqual(actual.map((entry) => entry.assetId), fixture.visual.comic.panels.map((entry) => entry.assetId))
  assert.deepEqual(actual.map((entry) => entry.alt), fixture.visual.comic.panels.map((entry) => entry.altText))
  record('branch-comic-visible')
}

const assertTextOnly = async (page, label) => {
  assert.equal(await page.locator('img[data-asset-id]').count(), 0, `${label} unexpectedly rendered media`)
  record(label)
}

const assertNoOverflow = async (page, label) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, `${label} has horizontal overflow`)
  record(label)
}

const standaloneAttemptId = (url) => {
  const match = url.match(/\/student\/situational\/attempts\/([^/?]+)\/result/)
  assert.ok(match?.[1], `result URL does not contain attempt id: ${url}`)
  return decodeURIComponent(match[1])
}

const startStandalone = async (page) => {
  await page.goto(`${BASE_URL}/student/situational`, { waitUntil: 'domcontentloaded' })
  await page.getByText('情境化测评', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const card = page.locator('a').filter({ hasText: fixture.branching.reportHeadline }).first()
  await card.waitFor({ state: 'visible', timeout: 30000 })
  record('authenticated-standalone-published-entry')
  await card.click()
  await waitScene(page, fixture.branching.scenes.entry)
}

const assertStandaloneDurable = async (attemptId, label) => {
  const prisma = new PrismaClient()
  try {
    const attempt = await prisma.situationalAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, resultEncrypted: true, canonicalResultEncrypted: true },
    })
    assert.equal(attempt?.status, 'COMPLETED', `${label}: attempt is not COMPLETED`)
    assert.ok(attempt?.resultEncrypted, `${label}: result missing`)
    assert.ok(attempt?.canonicalResultEncrypted, `${label}: canonical result missing`)
    assert.equal(await prisma.situationalRawSubmission.count({ where: { attemptId } }), 1, `${label}: raw FINAL count`)
    const retained = await prisma.assetReference.findMany({
      where: { entityType: 'AssessmentFrozenRuntime', entityId: `SITUATIONAL:${attemptId}`, field: 'media' },
      select: { assetId: true },
    })
    assert.deepEqual(
      retained.map((entry) => entry.assetId).sort(),
      [fixture.visual.image.assetId, ...fixture.visual.comic.panels.map((entry) => entry.assetId)].sort(),
      `${label}: frozen media retention incomplete`,
    )
    record(`${label}-durable-final`)
  } finally {
    await prisma.$disconnect()
  }
}

const runStandaloneLongPath = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  let submitCount = 0
  let finalPayload = null
  const onRequest = (request) => {
    if (request.method() !== 'POST' || !/\/api\/situational\/attempts\/[^/]+\/submit(?:\?|$)/.test(request.url())) return
    submitCount += 1
    try { finalPayload = request.postDataJSON() } catch { finalPayload = null }
  }
  page.on('request', onRequest)
  try {
    await loginStudent(page)
    await startStandalone(page)
    await assertImageScene(page)
    await assertNoOverflow(page, 'standalone-image-layout')
    await chooseOption(page, fixture.branching.options.longPath)
    await waitProgress(page, 1, 2)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitScene(page, fixture.branching.scenes.diagnostic)
    await navigateScene(page, 1, true)
    await waitScene(page, fixture.branching.scenes.entry)
    assert.equal(await page.locator(`input[type="radio"][value="${fixture.branching.options.longPath}"]`).first().isChecked(), true)
    record('standalone-local-refresh-resume')

    await nextScene(page, fixture.branching.scenes.diagnostic)
    await assertTextOnly(page, 'diagnostic-text-visible')
    await page.getByText('（可选）', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '还有必答通道未完成' }).waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(submitCount, 0, 'incomplete standalone FINAL emitted request')
    record('standalone-required-blocking')

    await chooseOption(page, 'A')
    await setConfidence(page, 80)
    await waitProgress(page, 2, 3)
    await nextScene(page, fixture.branching.scenes.nested)
    await assertComicScene(page)
    await chooseOption(page, fixture.branching.options.nestedContinue)
    await waitProgress(page, 3, 4)
    await nextScene(page, fixture.branching.scenes.roundTwo)
    await assertTextOnly(page, 'round-two-text-visible')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitScene(page, fixture.branching.scenes.roundTwo)
    await waitProgress(page, 3, 4)
    record('multi-round-refresh-resume')
    await chooseOption(page, 'A')
    await waitProgress(page, 4, 4)

    let forcedAmbiguousFailure = false
    await page.route('**/api/situational/attempts/*/submit', async (route) => {
      if (forcedAmbiguousFailure) return route.continue()
      forcedAmbiguousFailure = true
      const committed = await route.fetch()
      assert.equal(committed.status(), 200, 'server did not commit before simulated response loss')
      await route.abort('failed')
    })
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(/\/student\/situational\/attempts\/[^/]+\/result(?:\?|$)/, { timeout: 30000 })
    await page.getByText('测评已完成', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await page.unroute('**/api/situational/attempts/*/submit')
    assert.equal(forcedAmbiguousFailure, true)
    assert.equal(submitCount, 1, 'ambiguous recovery emitted duplicate FINAL')
    assert.ok(finalPayload?.responses?.some((entry) => entry.sceneKey === 'BR-02' && entry.channelKey === 'confidence' && entry.responseValue === 80), 'optional diagnostic missing from FINAL')
    record('ambiguous-final-recovery')
    record('optional-diagnostic-raw-retained')

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-standalone-result.png`, fullPage: true })
    const attemptId = standaloneAttemptId(page.url())
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'JSON', exact: true }).click()
    const download = await downloadPromise
    assert.ok(download.suggestedFilename().toLowerCase().endsWith('.json'))
    record('standalone-result-export')

    await page.getByRole('link', { name: '测评历史' }).first().click()
    await page.waitForURL(/\/student\/situational\/history(?:\?|$)/, { timeout: 30000 })
    await page.getByText('情境测评历史', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await page.getByText(fixture.branching.reportHeadline, { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 })
    await page.getByText('已完成', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 })
    record('standalone-history')
    await assertStandaloneDurable(attemptId, 'standalone-long-path')
  } finally {
    page.off('request', onRequest)
    await context.close()
  }
}

const runStandalonePruneAndEarlyTerminal = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let finalPayload = null
  const onRequest = (request) => {
    if (request.method() !== 'POST' || !/\/api\/situational\/attempts\/[^/]+\/submit(?:\?|$)/.test(request.url())) return
    try { finalPayload = request.postDataJSON() } catch { finalPayload = null }
  }
  page.on('request', onRequest)
  try {
    await loginStudent(page)
    await startStandalone(page)
    await chooseOption(page, fixture.branching.options.longPath)
    await nextScene(page, fixture.branching.scenes.diagnostic)
    await chooseOption(page, 'A')
    await setConfidence(page, 60)
    await nextScene(page, fixture.branching.scenes.nested)
    await chooseOption(page, fixture.branching.options.nestedContinue)
    await nextScene(page, fixture.branching.scenes.roundTwo)
    await chooseOption(page, 'A')
    await waitProgress(page, 4, 4)

    await navigateScene(page, 1, true)
    await waitScene(page, fixture.branching.scenes.entry)
    await chooseOption(page, fixture.branching.options.earlyTerminal)
    await waitProgress(page, 1, 1)
    assert.equal(await page.getByRole('navigation', { name: '情境导航' }).getByRole('button').count(), 1, 'early branch retained stale downstream navigation')
    record('cross-round-prune-to-early-terminal')

    await chooseOption(page, fixture.branching.options.longPath)
    await waitProgress(page, 1, 2)
    await nextScene(page, fixture.branching.scenes.diagnostic)
    assert.equal(await page.locator('input[type="radio"]').first().isChecked(), false, 'required diagnostic survived prune')
    await page.getByText('未选择', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    record('pruned-required-and-optional-not-restored')

    await navigateScene(page, 1, true)
    await chooseOption(page, fixture.branching.options.earlyTerminal)
    await waitProgress(page, 1, 1)
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(/\/student\/situational\/attempts\/[^/]+\/result(?:\?|$)/, { timeout: 30000 })
    await page.getByText('测评已完成', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    assert.deepEqual(finalPayload?.responses?.map((entry) => `${entry.sceneKey}:${entry.channelKey}`), ['BR-01:behavior'], 'early FINAL retained stale downstream answers')
    record('early-terminal-final')
    const attemptId = standaloneAttemptId(page.url())
    await assertStandaloneDurable(attemptId, 'standalone-early-terminal')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-early-terminal-result.png`, fullPage: true })
  } finally {
    page.off('request', onRequest)
    await context.close()
  }
}

const waitParent = async (page, parentId, recoveryToken = '') => {
  const headers = recoveryToken ? { 'X-Recovery-Token': recoveryToken } : undefined
  return assertSuccess(
    await apiFetch(page, `${recoveryToken ? '/public' : ''}/composite-assessments/attempts/${parentId}`, headers ? { headers } : {}),
    `parent state ${parentId}`,
  )
}

const startAuthenticatedParent = async (page) => {
  await page.goto(`${BASE_URL}/student/courses/${fixture.course.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: fixture.course.title, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const compositeTab = page.getByRole('button', { name: /^综合测评\s*\d*$/ }).first()
  await compositeTab.waitFor({ state: 'visible', timeout: 30000 })
  await compositeTab.click()
  await page.getByText(fixture.composite.name, { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const card = page.locator('div.card').filter({ hasText: fixture.composite.name }).first()
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
      && response.url().includes(`/api/composite-assessments/${fixture.composite.id}/attempts`)
      && response.status() === 200
  ), { timeout: 30000 })
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const body = await (await responsePromise).json()
  assert.equal(body.code, 0, body.message || 'authenticated Bundle start failed')
  await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  return body.data.attempt.id
}

const enterEmbedded = async (page, parentId, publicMode = false, recoveryToken = '') => {
  const parent = await waitParent(page, parentId, recoveryToken)
  assert.equal(parent.currentItem?.type, 'SITUATIONAL')
  const childId = parent.currentItem?.situationalAttemptId
  assert.ok(childId, 'Bundle child attempt missing')
  const prefix = publicMode ? '/public' : '/student'
  await Promise.all([
    page.waitForURL(new RegExp(`${prefix}/composite/situational/${childId}(?:\\?|$)`), { timeout: 30000 }),
    page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).click(),
  ])
  await waitScene(page, fixture.branching.scenes.entry)
  return childId
}

const assertAggregateSafe = (payload, label) => {
  const json = JSON.stringify(payload)
  for (const key of ['sceneKey', 'nodeKey', 'terminalNodeKey', 'optionKey', 'choiceScores', 'responseTime', 'percentile']) {
    assert.doesNotMatch(json, new RegExp(`"${key}"\\s*:`, 'i'), `${label} leaked ${key}`)
  }
}

const assertEmbeddedDurable = async (parentId, childId, label) => {
  const prisma = new PrismaClient()
  try {
    const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true, progress: true } })
    assert.equal(parent?.status, 'COMPLETED')
    assert.equal(parent?.progress, 100)
    const children = await prisma.situationalAttempt.findMany({ where: { compositeAttemptId: parentId }, select: { id: true, status: true } })
    assert.equal(children.length, 1)
    assert.equal(children[0]?.id, childId)
    assert.equal(children[0]?.status, 'COMPLETED')
    assert.equal(await prisma.situationalRawSubmission.count({ where: { attemptId: childId } }), 1)
    const snapshots = await prisma.assessmentUnitSnapshot.findMany({
      where: { compositeAttemptId: parentId, sourceAttemptId: childId },
      select: { unitType: true, payloadKind: true },
    })
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0]?.unitType, 'SITUATIONAL')
    assert.equal(snapshots[0]?.payloadKind, 'UNIT_RESULT')
    record(`${label}-bundle-durable-completion`)
  } finally {
    await prisma.$disconnect()
  }
}

const runAuthenticatedBundle = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await loginStudent(page)
    const parentId = await startAuthenticatedParent(page)
    const childId = await enterEmbedded(page, parentId)
    record('authenticated-bundle-entry')
    await assertImageScene(page)
    await chooseOption(page, fixture.branching.options.directNested)
    await nextScene(page, fixture.branching.scenes.nested)
    await assertComicScene(page)
    await chooseOption(page, fixture.branching.options.nestedContinue)
    await nextScene(page, fixture.branching.scenes.roundTwo)

    let submitCount = 0
    const submitPath = `/api/composite-assessments/attempts/${parentId}/items/${fixture.item.id}/situational/${childId}/submit`
    const onRequest = (request) => { if (request.method() === 'POST' && request.url().includes(submitPath)) submitCount += 1 }
    page.on('request', onRequest)
    try {
      await page.getByRole('button', { name: '提交测评', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '还有必答通道未完成' }).waitFor({ state: 'visible', timeout: 30000 })
      assert.equal(submitCount, 0)
      await chooseOption(page, 'D')
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('提交测评'))
        if (!button) throw new Error('FINAL button not found')
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await page.waitForURL(new RegExp(`/student/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`), { timeout: 30000 })
      await page.waitForTimeout(300)
      assert.equal(submitCount, 1, 'rapid duplicate embedded FINAL emitted duplicate request')
      record('embedded-one-final-duplicate-guard')
    } finally {
      page.off('request', onRequest)
    }

    const parent = await waitParent(page, parentId)
    assert.equal(parent.status, 'COMPLETED')
    assert.equal(parent.progress, 100)
    const report = assertSuccess(await apiFetch(page, `/composite-assessments/attempts/${parentId}/report`), 'authenticated branching report')
    assertAggregateSafe(report, 'authenticated branching report')
    record('embedded-aggregate-safe-report')
    await assertEmbeddedDurable(parentId, childId, 'authenticated-branching')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-authenticated-bundle.png`, fullPage: true })
  } finally {
    await context.close()
  }
}

const runPublicBundle = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    const token = encodeURIComponent(fixture.publicToken)
    await page.goto(`${BASE_URL}/public/composite/${token}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.composite.name }).waitFor({ state: 'visible', timeout: 30000 })
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
        && response.url().includes(`/api/public/composite-assessments/${fixture.publicToken}/start`)
        && response.status() === 200
    ), { timeout: 30000 })
    await page.getByRole('button', { name: /开始匿名测评/, exact: true }).click()
    const body = await (await responsePromise).json()
    assert.equal(body.code, 0, body.message || 'public Bundle start failed')
    const parentId = body.data.attempt.id
    const recoveryToken = body.data.recoveryToken
    assert.ok(parentId && recoveryToken)
    await page.waitForFunction((key) => Boolean(window.sessionStorage.getItem(key)), `composite:recovery:attempt:${parentId}`, { timeout: 30000 })
    await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    const childId = await enterEmbedded(page, parentId, true, recoveryToken)
    record('public-anonymous-bundle-entry')

    await chooseOption(page, fixture.branching.options.longPath)
    await nextScene(page, fixture.branching.scenes.diagnostic)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitScene(page, fixture.branching.scenes.diagnostic)
    record('public-recovery-token-resume')
    await chooseOption(page, 'B')
    await nextScene(page, fixture.branching.scenes.nested)
    await chooseOption(page, fixture.branching.options.nestedTerminal)
    await waitProgress(page, 3, 3)
    await page.getByRole('button', { name: '提交测评', exact: true }).click()
    await page.waitForURL(new RegExp(`/public/composite/attempts/${parentId}(?:/report)?(?:\\?|$)`), { timeout: 30000 })

    const parent = await waitParent(page, parentId, recoveryToken)
    assert.equal(parent.status, 'COMPLETED')
    assert.equal(parent.progress, 100)
    const report = assertSuccess(
      await apiFetch(page, `/public/composite-assessments/attempts/${parentId}/report`, { headers: { 'X-Recovery-Token': recoveryToken } }),
      'public branching report',
    )
    assertAggregateSafe(report, 'public branching report')
    await assertEmbeddedDurable(parentId, childId, 'public-branching')

    const missingContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const missingPage = await missingContext.newPage()
    let embeddedGets = 0
    let assetGets = 0
    missingPage.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes(`/api/public/composite-assessments/attempts/${parentId}/items/${fixture.item.id}/situational/${childId}`)) embeddedGets += 1
      if (request.method() === 'GET' && request.url().includes('/assets/')) assetGets += 1
    })
    try {
      const returnTo = encodeURIComponent(`/public/composite/attempts/${parentId}`)
      await missingPage.goto(`${BASE_URL}/public/composite/situational/${childId}?compositeAttemptId=${parentId}&compositeItemId=${fixture.item.id}&returnTo=${returnTo}`, { waitUntil: 'domcontentloaded' })
      await missingPage.getByRole('alert').filter({ hasText: '恢复凭证' }).waitFor({ state: 'visible', timeout: 30000 })
      assert.equal(embeddedGets, 0)
      assert.equal(assetGets, 0)
      record('public-missing-token-fail-closed')
    } finally {
      await missingContext.close()
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-public-bundle.png`, fullPage: true })
  } finally {
    await context.close()
  }
}

const main = async () => {
  assert.ok(BROWSER_EXECUTABLE, `browser executable not found; checked: ${browserCandidates.join(', ')}`)
  assert.equal(fixture.item.instrumentKey, 'sjt-branching-e2e-fixture')
  assert.equal(fixture.item.instrumentVersion, '2.0.0')
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  try {
    await runStandaloneLongPath(browser)
    await runStandalonePruneAndEarlyTerminal(browser)
    await runAuthenticatedBundle(browser)
    await runPublicBundle(browser)
  } finally {
    await browser.close()
  }
  console.log('--- SIT-V2-E branching acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('ALL PASS')
}

main().catch((error) => {
  console.error('SIT-V2-E branching acceptance failed')
  console.error(error && error.stack ? error.stack : error)
  console.log('--- SIT-V2-E branching acceptance ---')
  for (const name of results) console.log(`✅ ${name}`)
  console.log('BLOCKED')
  process.exitCode = 1
})
