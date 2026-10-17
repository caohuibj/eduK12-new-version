/**
 * Real candidate Chromium smoke; no API mocking, no injected answers/trials,
 * no virtual clock, no product-source changes, no production network access.
 *
 * Prerequisites (CI owns setup/cleanup):
 * - Candidate backend/frontend images already built, migrated isolated PG16
 *   survey_candidate_ci_test + Redis7; feature flags SURVEY_WORKSPACE_ENABLED,
 *   SURVEY_PUBLICATION_ENABLED, SURVEY_ANALYTICS_ENABLED and
 *   COGNITIVE_MODULE_ENABLED=true; background/media workers disabled.
 * - Seed using backend/scripts/survey-candidate-fixture.ts with identical API
 *   secrets. Its private mode-0600 output is SURVEY_CANDIDATE_FIXTURE.
 * - Map survey.eduk12.top AND training.eduk12.top to 127.0.0.1 in /etc/hosts.
 *   Serve the actual built frontend + /api proxy over trusted test HTTPS at
 *   fixture.surveyUrl/adminUrl (configurable canonical hosts, e.g. :3189).
 *   Trust setup is outside this script. No ignoreHTTPSErrors/cert bypass.
 *   If using a nonstandard port, fixture proxy explicitly maps Origin to
 *   canonical HTTPS origin; this smoke does NOT prove production ingress.
 * - Official Playwright Chromium installed. By default require the repo's
 *   .github/release-tools/node_modules/playwright-core; SURVEY_PLAYWRIGHT_MODULE
 *   may name
 *   an absolute installed module. BROWSER_EXECUTABLE is optional.
 * - Pinned release-tools axe-core audits the affected main surface once at
 *   admin, researcher, participant consent and completion, outside timed work.
 *   The existing repository threshold remains zero WCAG A/AA violations.
 *
 * Supply SURVEY_CI_SOURCE_SHA (40 hex), SURVEY_CI_FRONTEND_IMAGE_ID and
 * SURVEY_CI_BACKEND_IMAGE_ID (docker inspect immutable sha256 IDs).
 *
 * SURVEY_CANDIDATE_ISOLATED=1 SURVEY_CANDIDATE_FIXTURE=/private/fixture.json \
 * SURVEY_CANDIDATE_OUTPUT=/artifacts/browser \
 * node server-version/e2e/survey-candidate-browser.cjs
 *
 * Budget: 5 minutes including real, fixed 120-trial GoNoGo timing; an outer
 * CI timeout should allow startup/artifact cleanup separately. Artifacts:
 * result.json (sanitized checks/request statuses), masked screenshots, and
 * synthetic CSV/codebook/manifest downloads. NEVER upload the private fixture,
 * browser profile, trace/HAR, raw request bodies, or browser storage.
 * Not covered: invitation claim/password login/MFA enrollment, complete
 * authoring editors, linked-wave/branch variants, touch devices, capacity,
 * physical display/keyboard timing, production TLS/cookie/origin deployment.
 * Local retention is checked using real IndexedDB transactions, cross-tab Web
 * Locks and actual GoNoGo trial writes; only unrelated synthetic records are seeded.
 */
'use strict'
const assert = require('node:assert/strict')
const { isDeepStrictEqual } = require('node:util')
const fs = require('node:fs')
const path = require('node:path')
const dns = require('node:dns').promises
const { createHash, createHmac, randomUUID } = require('node:crypto')
const { chromium } = require(process.env.SURVEY_PLAYWRIGHT_MODULE || '../../.github/release-tools/node_modules/playwright-core')
const axeSource = fs.readFileSync(require.resolve('../../.github/release-tools/node_modules/axe-core/axe.min.js'), 'utf8')
const axeVersion = require('../../.github/release-tools/node_modules/axe-core/package.json').version
assert.equal(axeVersion, require('../../.github/release-tools/package.json').dependencies['axe-core'], 'Use the repository-pinned axe-core version')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const SHA256 = value => createHash('sha256').update(value).digest('hex')
let fixture, output, browser, activePage, phase = 'setup', timer
const evidence = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(),
  environment: { node: process.version }, checks: [], requests: [], browserErrors: [], accessibility: [], visualFailures: [],
  scope: 'Real Chromium UI + isolated candidate API/PostgreSQL. Synthetic actors and content only.',
  timingClaim: 'Unaccelerated software-observed browser timing; not physical device attestation.' }
const save = () => { if (output) fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2)) }
function check(name, actual, expected = true) {
  assert.deepEqual(actual, expected, name)
  evidence.checks.push({ name, pass: true }); save()
}
// Pure presentation failures are collected so independent safe participant
// checks still run. Every security, API, state and timing prerequisite remains
// fail-fast; the final visual assertion is mandatory before status can pass.
function visualCheck(name, actual, expected) {
  const pass = isDeepStrictEqual(actual, expected)
  evidence.checks.push({ name, pass })
  if (!pass) evidence.visualFailures.push({ phase, name })
  save()
}
function milestone(name) { phase = name; evidence.phase = name; save(); console.log('Survey browser: ' + name) }
async function loopback(url, hostname) {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, hostname)
  assert.equal(parsed.protocol, 'https:', 'Use a trusted ephemeral test CA, not a certificate bypass')
  assert(!parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash)
  const addresses = await dns.lookup(parsed.hostname, { all: true })
  assert(addresses.length && addresses.every(x => ['127.0.0.1', '::1'].includes(x.address)),
    'Canonical fixture host must resolve only to loopback; production access prohibited')
}
function totp() {
  const count = Buffer.alloc(8); count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const mac = createHmac('sha1', Buffer.from(fixture.researcher.totpSecretBase64, 'base64')).update(count).digest()
  return String((mac.readUInt32BE(mac[mac.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, '0')
}
async function responseData(response, label) {
  assert.equal(response.status(), 200, label + ': HTTP ' + response.status())
  const body = await response.json()
  assert.equal(body.code, 0, label + ': unsuccessful API envelope')
  assert(body.data !== null && body.data !== undefined, label + ': missing response data')
  return body.data
}
async function action(page, endpoint, trigger, method = 'POST') {
  const [response] = await Promise.all([
    page.waitForResponse(r => r.request().method() === method &&
      (endpoint instanceof RegExp ? endpoint.test(new URL(r.url()).pathname) : new URL(r.url()).pathname === endpoint)),
    trigger(),
  ])
  return { data: await responseData(response, phase), request: response.request() }
}
async function newPage(cookies = []) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    screen: { width: 1440, height: 1000 }, acceptDownloads: true, locale: 'zh-CN', timezoneId: 'UTC',
    serviceWorkers: 'block' })
  await context.addCookies(cookies)
  const page = await context.newPage()
  page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(30000)
  page.on('pageerror', error => { evidence.browserErrors.push({ phase, name: error.name, message: error.message.slice(0, 300) }) })
  page.on('response', response => {
    const url = new URL(response.url())
    if (!/^\/api\/(?:survey|public\/survey|platform\/survey)(?:\/|$)/.test(url.pathname)) return
    evidence.requests.push({ method: response.request().method(),
      path: url.pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi, ':id'), status: response.status() })
  })
  // Dialogs are not globally auto-accepted. This journey has no destructive
  // UI action; an unexpected dialog is a failure requiring investigation.
  page.on('dialog', async dialog => { evidence.browserErrors.push({ phase, name: 'UnexpectedDialog', message: dialog.type() }); await dialog.dismiss() })
  activePage = page
  return page
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true,
    mask: [page.locator('code, svg, input[type="password"]')] })
}
async function widths(page, name) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    // Two rendering frames after a real resize, never advance task clocks.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    visualCheck(name + ' has no document horizontal overflow at ' + width, overflow, false)
    await screenshot(page, name + '-' + width)
  }
}
async function accessibility(page, state) {
  assert.equal(await page.locator('main').count(), 1, state + ': affected main surface must be unambiguous')
  await page.evaluate(() => document.fonts.ready)
  // Match the Survey smoke: load pinned test tooling at one same-origin route,
  // preserving the built image's CSP and all actual application/API responses.
  // No HTML, input values, invitation URLs or raw axe nodes enter evidence.
  if (!await page.evaluate(() => typeof window.axe === 'object')) {
    const toolUrl = new URL('/survey-candidate-ci-axe.js', page.url()).href
    const serveTool = route => route.fulfill({ contentType: 'application/javascript', body: axeSource })
    await page.route(toolUrl, serveTool)
    try { await page.addScriptTag({ url: toolUrl }) } finally { await page.unroute(toolUrl, serveTool) }
  }
  const result = await page.evaluate(async () => {
    const result = await window.axe.run({ include: ['main'] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
    return { version: window.axe.version, passes: result.passes.length, incomplete: result.incomplete.length,
      violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodeCount: v.nodes.length })) }
  })
  evidence.accessibility.push({ state, scope: 'main', viewport: page.viewportSize(),
    sourceSha256: SHA256(axeSource), ...result }); save()
  check(state + ' uses the pinned axe-core runtime', result.version, axeVersion)
  visualCheck(state + ' has no WCAG A/AA violations, including serious/critical', result.violations, [])
}
function parseCsv(input) {
  const result = []; let row = [], field = '', quoted = false
  input = input.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"') { if (input[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field); result.push(row); row = []; field = ''
    } else field += char
  }
  assert(!quoted, 'CSV quoting closes')
  if (row.length || field) { row.push(field); result.push(row) }
  const headers = result.shift()
  assert(headers && new Set(headers).size === headers.length, 'Unique CSV columns')
  return result.map(cells => { assert.equal(cells.length, headers.length); return Object.fromEntries(headers.map((key, i) => [key, cells[i]])) })
}
async function adminJourney() {
  milestone('admin invitation and source grant')
  const page = await newPage(fixture.adminCookies)
  await page.goto(fixture.adminUrl + '/admin/survey-researchers', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Survey｜研究者与工具授权', exact: true }).waitFor()
  await page.getByLabel('当前管理员密码（敏感操作再次验证）').fill(fixture.adminPassword)
  const invitation = await action(page, '/api/platform/survey/researcher-invitations',
    () => page.getByRole('button', { name: '生成研究者邀请', exact: true }).click())
  check('Admin creates an actual synthetic one-time invitation', typeof invitation.data.token === 'string' && invitation.data.token.length === 43)
  // Do not navigate to, log, screenshot unmasked, or send this invitation.
  await page.getByText('一次性邀请仅在本次操作显示，请通过受控渠道交付。', { exact: true }).waitFor()
  const grants = page.getByRole('region', { name: '研究工具版本授权', exact: true })
  await grants.getByLabel('授权给研究者').selectOption(fixture.researcher.id)
  await grants.getByLabel('来源类型').selectOption('FORM')
  await action(page, /\/api\/platform\/survey\/source-catalog$/, () => grants.getByRole('button', { name: '查询可授权版本', exact: true }).click(), 'GET')
  const grant = await action(page, '/api/platform/survey/researchers/' + fixture.researcher.id + '/tool-grants',
    () => grants.getByRole('button', { name: '授权此版本：' + fixture.sourceForm.title, exact: true }).click())
  check('Admin grant binds requested synthetic source', grant.data.sourceRef.sourceId, fixture.sourceForm.id)
  await grants.getByText('已授权该明确版本；研究者可在自己的项目中导入。', { exact: true }).waitFor()
  await accessibility(page, 'admin-invitation-grants')
  await widths(page, 'admin')
  await page.context().close()
}
async function researcherJourney() {
  milestone('researcher four-type composition and publication')
  const page = await newPage(fixture.researcherCookies)
  await page.goto(fixture.surveyUrl + '/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '我的研究', exact: true }).waitFor()
  check('Browser has genuine secure-context primitives', await page.evaluate(() => isSecureContext &&
    typeof crypto.randomUUID === 'function' && typeof indexedDB === 'object'))
  await page.locator('article').filter({ has: page.getByRole('heading', { name: fixture.project.title, exact: true }) })
    .getByRole('button', { name: '查看/编辑', exact: true }).click()
  const builder = page.getByRole('region', { name: 'Survey Research Builder', exact: true })
  const imported = await action(page, /\/api\/survey\/projects\/[^/]+\/catalog\/[^/]+\/import$/,
    () => builder.getByRole('button', { name: '导入此版本：' + fixture.sourceForm.title, exact: true }).click())
  check('Researcher imports actual catalog source as read-only', imported.data.readOnly, true)
  check('Imported source keeps grant identity', Boolean(imported.data.catalogGrantId))
  await builder.getByText('已导入明确版本的原版工具，内容与计分只读。', { exact: true }).waitFor()
  const waves = page.getByRole('region', { name: '研究波次', exact: true })
  await waves.getByLabel('波次标题', { exact: true }).fill('Synthetic four-type browser wave')
  await waves.getByLabel('参与说明与知情同意', { exact: true }).fill(
    'Synthetic software acceptance study only. Participation is voluntary. No real personal data. Withdrawal is available. This pilot provides descriptive feedback without diagnosis.')
  await waves.getByLabel('通用完成反馈（不显示个人分数）', { exact: true }).fill('SYNTHETIC BROWSER THANK YOU')
  for (const tool of fixture.instruments) await waves.getByRole('checkbox', { name: tool.kind + ' · ' + tool.title, exact: true }).check()
  const created = await action(page, '/api/survey/projects/' + fixture.project.id + '/waves',
    () => waves.getByRole('button', { name: '创建波次', exact: true }).click())
  const wave = created.data
  check('UI composes all four tools in intentional order', wave.instrumentIds, fixture.instruments.map(tool => tool.id))
  const base = '/api/survey/projects/' + fixture.project.id + '/waves/' + wave.id
  const preflight = await action(page, base + '/preflight',
    () => waves.getByRole('button', { name: '检查知情同意与所有工具', exact: true }).click())
  check('Candidate preflight accepts real four-type definitions', preflight.data.ok)
  await action(page, base + '/prepare', () => waves.getByRole('button', { name: '冻结研究定义', exact: true }).click())
  const opened = await action(page, base + '/open', () => waves.getByRole('button', { name: '正式开放本轮', exact: true }).click())
  check('UI publication returns real recruitment capability', typeof opened.data.researchUrl === 'string')
  const generated = new URL(opened.data.researchUrl)
  assert.equal(generated.hostname, 'survey.eduk12.top')
  assert(/^\/r\/[a-f0-9-]{36}$/i.test(generated.pathname))
  assert(generated.hash, 'Recruitment URL carries its real capability')
  // Product emits canonical production-format links; keep path and capability
  // byte-for-byte, but use the isolated test transport's port.
  const entryUrl = fixture.surveyUrl + generated.pathname + generated.search + generated.hash
  await page.getByText('已创建一次性招募链接，请通过受控渠道交付', { exact: true }).waitFor()
  await accessibility(page, 'researcher-published-wave')
  await widths(page, 'researcher')
  return { page, wave, entryUrl }
}
async function driveKeyboard(page, endButton, budgetMs) {
  const until = Date.now() + budgetMs; let pressed = false, presses = 0
  while (Date.now() < until) {
    if (await page.getByRole('button', { name: endButton, exact: true }).isVisible()) return presses
    const signal = await page.locator('button[aria-label="respond"]').evaluateAll(elements => {
      const button = elements[0]
      return button?.classList.contains('bg-green-500') ? 'go' : button?.classList.contains('bg-red-500') ? 'nogo' : 'gap'
    })
    if (signal === 'gap') pressed = false
    if (signal === 'go' && !pressed) {
      // Real elapsed delay avoids the frozen 100 ms valid-RT floor. Read only
      // rendered colour; no random-seed access, task state edits, or timers.
      await delay(180)
      const stillGo = await page.locator('button[aria-label="respond"]').evaluateAll(elements => elements[0]?.classList.contains('bg-green-500') === true)
      if (stillGo) { await page.keyboard.press('Space'); presses++; pressed = true }
    }
    await delay(20)
  }
  throw Error('Real keyboard phase exceeded its unaccelerated protocol budget')
}
async function retentionJourney(page, entryUrl) {
  milestone('real IndexedDB retention and cross-tab activity lock')
  const ids = Object.fromEntries(['stale', 'recent', 'sealed', 'pending', 'other', 'legacy', 'active'].map(name => [name, randomUUID()]))
  const publicId = new URL(entryUrl).pathname.split('/').at(-1)
  // A rendered heading can precede the app's asynchronous IDB initialization.
  // Observe creation without opening the DB, then abort any unexpected upgrade
  // so this probe can never create an empty version-1 database before the app.
  await page.waitForFunction(async () => (await indexedDB.databases()).some(db =>
    db.name === 'eduk12-final-drafts-v1' && db.version === 1), undefined, { timeout: 10000 })
  await page.evaluate(async ({ ids, publicId }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('eduk12-final-drafts-v1', 1)
      request.onupgradeneeded = () => request.transaction.abort()
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const stores = ['draftMeta', 'draftAnswers', 'draftTrials']
    if (stores.some(name => !db.objectStoreNames.contains(name))) throw Error('Candidate final-draft schema is absent')
    const now = Date.now(), old = now - 7 * 24 * 60 * 60 * 1000 - 60000
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      for (const [name, id] of Object.entries(ids)) {
        const draftKey = 'cognitive:' + id
        const meta = { draftKey, instrument: 'cognitive', attemptId: id, attemptEpoch: 1,
          definitionHash: 'synthetic-retention-fixture', contextSnapshotHash: null, deliveryMode: 'final_only',
          submissionId: 'synthetic-' + id, status: name === 'pending' ? 'RETRY_PENDING' : 'DRAFT',
          createdAt: old, updatedAt: old }
        if (!['other', 'legacy'].includes(name)) meta.surveyRetention = { schemaVersion: 1, lastWriteAt: name === 'recent' ? now : old }
        if (name === 'sealed') meta.sealedSubmission = { schemaVersion: 1, sealedAt: old, payload: { submissionId: 'synthetic-' + id } }
        tx.objectStore('draftMeta').put(meta)
        tx.objectStore('draftAnswers').put({ draftKey, itemKey: 'synthetic', value: 'synthetic', updatedAt: old })
        tx.objectStore('draftTrials').put({ draftKey, trialIndex: 0, payload: { syntheticRetentionFixture: true }, createdAt: old })
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
    })
    db.close()
    localStorage.setItem('huisurvey:v1:cognitive-sessions:' + publicId,
      JSON.stringify([{ attemptId: 'synthetic-parent', sessionId: ids.legacy }]))
    if (!navigator.locks) throw Error('Web Locks unavailable in candidate secure context')
    await new Promise((resolve, reject) => {
      navigator.locks.request('huisurvey:cognitive-draft:' + ids.active, { mode: 'shared' }, async () => {
        await new Promise(release => { window.__surveyCandidateReleaseLock = release; resolve() })
      }).catch(reject)
    })
  }, { ids, publicId })
  const read = () => page.evaluate(async ids => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('eduk12-final-drafts-v1', 1)
      request.onupgradeneeded = () => request.transaction.abort()
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['draftMeta', 'draftAnswers', 'draftTrials'], 'readonly'), result = {}
    await Promise.all(Object.entries(ids).map(async ([name, id]) => {
      const key = 'cognitive:' + id
      const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
      // Issue every request synchronously, before awaiting this transaction.
      const meta = request(tx.objectStore('draftMeta').get(key))
      const answers = request(tx.objectStore('draftAnswers').index('draftKey').count(key))
      const trials = request(tx.objectStore('draftTrials').index('draftKey').count(key))
      const [value, answerCount, trialCount] = await Promise.all([meta, answers, trials])
      result[name] = { present: !!value, answerCount, trialCount,
        marked: !!value?.surveyRetention, sealed: !!value?.sealedSubmission }
    }))
    db.close(); return result
  }, ids)
  const probe = await page.context().newPage()
  try {
    await probe.goto(entryUrl, { waitUntil: 'domcontentloaded' })
    await probe.getByRole('heading', { name: '研究波次', exact: true }).waitFor()
    let snapshot, until = Date.now() + 10000
    do { snapshot = await read(); if (!snapshot.stale.present && snapshot.legacy.marked) break; await delay(25) } while (Date.now() < until)
    evidence.retention = { firstSweep: snapshot }; save()
    check('Expired inactive Survey draft is atomically removed from all stores', snapshot.stale,
      { present: false, answerCount: 0, trialCount: 0, marked: false, sealed: false })
    for (const name of ['recent', 'sealed', 'pending', 'other', 'legacy', 'active']) {
      check('Retention protects ' + name + ' draft and child rows', snapshot[name].present && snapshot[name].answerCount === 1 && snapshot[name].trialCount === 1)
    }
    check('Legacy Survey draft receives a fresh explicit retention clock', snapshot.legacy.marked)
    check('Unrelated product draft remains unmarked', snapshot.other.marked, false)
    check('Pending immutable sealed payload remains present', snapshot.sealed.sealed)
    await page.evaluate(() => { window.__surveyCandidateReleaseLock(); delete window.__surveyCandidateReleaseLock })
    await probe.reload({ waitUntil: 'domcontentloaded' })
    await probe.getByRole('heading', { name: '研究波次', exact: true }).waitFor()
    until = Date.now() + 10000
    do { snapshot = await read(); if (!snapshot.active.present) break; await delay(25) } while (Date.now() < until)
    evidence.retention.afterLockRelease = snapshot; save()
    check('Expired draft is removed only after the other tab releases its lock', snapshot.active,
      { present: false, answerCount: 0, trialCount: 0, marked: false, sealed: false })
  } finally {
    await page.evaluate(() => { window.__surveyCandidateReleaseLock?.(); delete window.__surveyCandidateReleaseLock }).catch(() => {})
    await probe.close(); await page.bringToFront()
  }
}

async function liveCognitiveDraft(page, sessionId) {
  return page.evaluate(async sessionId => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('eduk12-final-drafts-v1', 1)
      request.onupgradeneeded = () => request.transaction.abort()
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['draftMeta', 'draftTrials'], 'readonly'), key = 'cognitive:' + sessionId
    const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const [meta, trialCount] = await Promise.all([request(tx.objectStore('draftMeta').get(key)),
      request(tx.objectStore('draftTrials').index('draftKey').count(key))])
    db.close()
    const locks = await navigator.locks.query()
    return { trialCount, status: meta?.status, lastWriteAt: meta?.surveyRetention?.lastWriteAt,
      activeSharedLock: locks.held.some(lock => lock.name === 'huisurvey:cognitive-draft:' + sessionId && lock.mode === 'shared') }
  }, sessionId)
}

async function participantJourney(entryUrl) {
  milestone('participant consent, Form, timed Scale and SJT')
  const page = await newPage()
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '研究波次', exact: true }).waitFor()
  await retentionJourney(page, entryUrl)
  milestone('participant consent, Form, timed Scale and SJT')
  await page.getByRole('button', { name: '选择本轮', exact: true }).click()
  const start = page.getByRole('button', { name: '开始或恢复本轮作答', exact: true })
  check('Participant cannot start before consent', await start.isDisabled())
  await accessibility(page, 'participant-consent')
  await page.getByRole('checkbox', { name: /我已阅读并同意本轮研究说明/ }).check()
  const taskResponse = await action(page, /\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/task$/, () => start.click())
  const task = taskResponse.data
  check('Participant receives all four actual frozen kinds', task.units.map(unit => unit.kind), ['FORM', 'SCALE', 'SJT', 'COGNITIVE'])
  check('Public task excludes private scoring configuration', /privateScoring|contributions|compiledSnapshot/.test(JSON.stringify(task)), false)
  const advance = () => page.getByRole('button', { name: '确认当前工具，继续', exact: true }).click()
  for (const [n, answer] of [[1, 'Synthetic A'], [2, 'Synthetic B']]) {
    const group = page.getByRole('group', { name: 'Synthetic Form question ' + n + ' *', exact: true })
    await group.getByRole('radio', { name: answer, exact: true }).check()
    if (n === 1) await page.getByRole('navigation', { name: '问卷分页', exact: true }).getByRole('button', { name: '下一页', exact: true }).click()
  }
  await advance()
  const scale = page.getByRole('region', { name: '逐题施测：Synthetic SCALE', exact: true })
  await scale.getByRole('radio', { name: 'Synthetic A', exact: true }).check()
  await scale.getByRole('button', { name: '下一题', exact: true }).click()
  await scale.getByRole('radio', { name: 'Synthetic B', exact: true }).check()
  await scale.getByRole('button', { name: '上一题', exact: true }).click()
  await scale.getByRole('radio', { name: 'Synthetic B', exact: true }).check()
  await scale.getByRole('button', { name: '下一题', exact: true }).click()
  await advance()
  for (const [n, answer] of [[1, 'Synthetic A'], [2, 'Synthetic B']]) {
    await page.getByRole('group', { name: 'Synthetic SJT question ' + n + ' *', exact: true })
      .getByRole('radio', { name: answer, exact: true }).check()
  }
  await advance()
  milestone('participant real keyboard GoNoGo practice and 120 trials')
  await page.getByRole('checkbox', { name: /我正在使用桌面／笔记本电脑和实体键盘/ }).check()
  await page.getByRole('textbox', { name: '键盘检查', exact: true }).press('Enter')
  const admitted = await action(page, /\/cognitive\/cognitive\/start$/,
    () => page.getByRole('button', { name: '检查暂存并进入认知任务', exact: true }).click())
  check('Real cognitive session is a fresh admission', admitted.data.freshAdmission, true)
  check('Cognitive start locks actual prerequisite answers', admitted.data.lockedPriorAnswers,
    { form: { q1: 'a', q2: 'b' }, scale: { q1: 'b', q2: 'b' }, sjt: { q1: 'a', q2: 'b' } })
  await page.getByRole('button', { name: '开始测评', exact: true }).click()
  await page.getByRole('button', { name: '开始练习', exact: true }).click()
  const practicePresses = await driveKeyboard(page, '开始正式测验', 20000)
  check('Practice is passed using real keyboard responses', practicePresses, 2)
  const beforeFormal = await liveCognitiveDraft(page, admitted.data.sessionId)
  check('Live Survey unit holds its own shared retention lock', beforeFormal.activeSharedLock)
  check('Practice does not pollute persisted formal trials', beforeFormal.trialCount, 0)
  check('Live Survey draft has a real write clock', Number.isFinite(beforeFormal.lastWriteAt))
  await page.getByRole('button', { name: '开始正式测验', exact: true }).click()
  const formalPresses = await driveKeyboard(page, '完成测评', 180000)
  check('Formal Go trials receive 90 real keyboard responses', formalPresses, 90)
  const afterFormal = await liveCognitiveDraft(page, admitted.data.sessionId)
  check('All 120 real formal trials are durable in IndexedDB', afterFormal.trialCount, 120)
  check('Effective trial writes advance the Survey retention clock', afterFormal.lastWriteAt > beforeFormal.lastWriteAt)
  check('Live unit stays protected throughout formal trials', afterFormal.activeSharedLock)
  const child = await action(page, /\/cognitive\/cognitive\/[^/]+\/final$/,
    () => page.getByRole('button', { name: '完成测评', exact: true }).click())
  const childPayload = child.request.postDataJSON()
  check('Candidate persists a real child FINAL', child.data.completed)
  check('Browser runner seals the full 120-trial protocol', childPayload.trials.length, 120)
  check('Actual administration is keyboard on desktop', childPayload.administrationProvenance,
    { schemaVersion: 1, deviceClass: 'DESKTOP_LAPTOP', administrationMode: 'KEYBOARD_MOUSE' })
  await page.getByRole('heading', { name: '此任务已提交', exact: true }).waitFor()
  check('Child receipt does not masquerade as parent completion', await page.getByRole('heading', { name: '本轮研究已提交', exact: true }).count(), 0)
  const parent = await action(page, /\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/final$/,
    () => page.getByRole('button', { name: '提交本轮正式回答', exact: true }).click())
  const parentPayload = parent.request.postDataJSON()
  check('Parent FINAL is persisted', parent.data.status, 'COMPLETED')
  check('Parent FINAL references the exact committed child', parentPayload.cognitiveReferences, [child.data.resultReference])
  const timings = parentPayload.itemTimings.scale
  check('Scale timing records change and revisit from real UI', timings.q1.changeCount === 1 && timings.q1.revisitCount >= 1)
  for (const [key, timing] of Object.entries(timings)) {
    check('Real first response and active time for ' + key, Number.isInteger(timing.firstResponseMs) &&
      timing.firstResponseMs >= 0 && timing.activeTimeMs >= timing.firstResponseMs && timing.recoveredWithoutClock === false)
  }
  await page.getByRole('region', { name: '本次表现描述性反馈', exact: true }).waitFor()
  await page.getByText('SYNTHETIC BROWSER THANK YOU', { exact: true }).waitFor()
  check('Final receipt exposes descriptive pilot feedback', await page.getByText(/试点测量 · 质量状态/).count() > 0)
  await accessibility(page, 'participant-completed-feedback')
  await widths(page, 'participant-completed')
  await page.context().close()
  return { timings, child: child.data.resultReference, parent: parent.data }
}
async function exportJourney(page, wave, participant) {
  milestone('researcher timing and cognitive provenance exports')
  activePage = page
  await page.bringToFront()
  const analytics = page.getByRole('region', { name: '研究数据', exact: true })
  const overview = await action(page, '/api/survey/projects/' + fixture.project.id + '/analytics/overview',
    () => analytics.getByRole('button', { name: '刷新完成进度', exact: true }).click(), 'GET')
  check('Analytics counts the single completed parent', overview.data.waves.find(row => row.id === wave.id).finalCompleted, 1)
  await analytics.getByLabel('最新 TOTP 动态验证码', { exact: true }).fill(totp())
  await action(page, '/api/survey/auth/mfa/step-up',
    () => analytics.getByRole('button', { name: '完成五分钟内二次认证', exact: true }).click())
  const artifacts = {}
  const exportSection = analytics.locator('div.border.rounded-xl').filter({ has: page.getByRole('heading', { name: '匿名科研数据导出', exact: true }) })
  check('Exactly one researcher export section exists', await exportSection.count(), 1)
  for (const format of ['RAW_WAVE', 'COGNITIVE_TRIAL_LONG']) {
    milestone('researcher export format selection: ' + format)
    // Role names exclude nested option text; exact label text includes it.
    const formatSelect = exportSection.getByRole('combobox', { name: '数据格式', exact: true })
    check(format + ' format control is unique', await formatSelect.count(), 1)
    check(format + ' is a real UI option', await formatSelect.locator('option').evaluateAll((options, value) => options.some(option => option.value === value), format))
    check(format + ' UI selects the requested format', await formatSelect.selectOption(format), [format])
    check(format + ' selected format is retained', await formatSelect.inputValue(), format)
    milestone('researcher export wave selection: ' + format)
    const waveSelect = exportSection.getByRole('combobox', { name: '波次', exact: true })
    check(format + ' wave control is unique', await waveSelect.count(), 1)
    check(format + ' contains the completed wave option', await waveSelect.locator('option').evaluateAll((options, value) => options.some(option => option.value === value), wave.id))
    check(format + ' UI selects the completed wave', await waveSelect.selectOption(wave.id), [wave.id])
    check(format + ' selected wave is retained', await waveSelect.inputValue(), wave.id)
    milestone('researcher export ticket and download: ' + format)
    const ticket = await action(page, '/api/survey/projects/' + fixture.project.id + '/exports',
      () => exportSection.getByRole('button', { name: '创建受控导出', exact: true }).click())
    const selection = ticket.request.postDataJSON()
    check(format + ' request binds selected format and completed wave', { format: selection.format, waveId: selection.waveId }, { format, waveId: wave.id })
    check(format + ' ticket is ready for the selected format', { status: ticket.data.status, format: ticket.data.format }, { status: 'READY', format })
    check(format + ' fits the declared single bounded page', ticket.data.nextCursor == null)
    const downloads = []
    const listener = download => downloads.push(download)
    page.on('download', listener)
    const downloaded = await action(page, '/api/survey/projects/' + fixture.project.id + '/exports/' + ticket.data.id + '/download',
      () => analytics.getByRole('button', { name: '下载当前批次 CSV、Codebook 与 Manifest', exact: true }).click(), 'GET')
    const until = Date.now() + 10000
    while (downloads.length < 3 && Date.now() < until) await delay(25)
    page.off('download', listener)
    check(format + ' UI downloads CSV, codebook and manifest', downloads.length, 3)
    const filenames = downloads.map(download => download.suggestedFilename())
    check(format + ' download filenames are unique', new Set(filenames).size, 3)
    for (const suffix of ['.csv', '_codebook.json', '_manifest.json']) {
      check(format + ' has exactly one ' + suffix + ' artifact', filenames.filter(name => name.endsWith(suffix)).length, 1)
    }
    for (const download of downloads) {
      assert(/^[a-zA-Z0-9_.-]+$/.test(download.suggestedFilename()), 'Safe download filename')
      await download.saveAs(path.join(output, download.suggestedFilename()))
      assert.equal(await download.failure(), null)
    }
    const artifact = downloaded.data, rows = parseCsv(artifact.csv)
    check(format + ' download is the requested ticket and format', { id: artifact.id, format: artifact.format }, { id: ticket.data.id, format })
    check(format + ' manifest records the requested selection', artifact.manifest.selection.format, format)
    check(format + ' manifest row count matches actual CSV', rows.length, artifact.manifest.rowCount)
    check(format + ' manifest project identity', artifact.manifest.projectId, fixture.project.id)
    check(format + ' manifest binds actual CSV bytes', artifact.manifest.dataDigest, SHA256(JSON.stringify(artifact.csv)))
    check(format + ' downloaded CSV is the actual API artifact',
      fs.readFileSync(path.join(output, downloads.find(d => d.suggestedFilename().endsWith('.csv')).suggestedFilename()), 'utf8').replace(/^\uFEFF/, ''), artifact.csv)
    check(format + ' codebook matches downloaded artifact', JSON.parse(fs.readFileSync(path.join(output,
      downloads.find(d => d.suggestedFilename().endsWith('_codebook.json')).suggestedFilename()), 'utf8')), artifact.codebook)
    check(format + ' downloaded manifest matches actual artifact', JSON.parse(fs.readFileSync(path.join(output,
      downloads.find(d => d.suggestedFilename().endsWith('_manifest.json')).suggestedFilename()), 'utf8')), artifact.manifest)
    artifacts[format] = { rows, manifest: artifact.manifest }
  }
  const raw = artifacts.RAW_WAVE.rows
  for (const key of ['q1', 'q2']) {
    const row = raw.find(item => item.instrument_key === 'scale' && item.item_key === key), timing = participant.timings[key]
    assert(row, 'Scale item is present in raw export')
    check('Export preserves browser timing for ' + key,
      [row.first_response_ms, row.active_time_ms, row.answer_change_count, row.item_revisit_count],
      [timing.firstResponseMs, timing.activeTimeMs, timing.changeCount, timing.revisitCount].map(String))
    check('Export marks valid recorded timing for ' + key, row.timing_status, 'RECORDED')
  }
  check('Form and SJT real answers are in raw export', raw.some(row => row.instrument_key === 'form') && raw.some(row => row.instrument_key === 'sjt'))
  const trials = artifacts.COGNITIVE_TRIAL_LONG.rows
  check('Cognitive export includes exactly 120 formal trials', trials.length, 120)
  check('Cognitive export excludes practice', trials.every(row => row.phase === 'test'))
  check('Cognitive indexes are complete', trials.map(row => Number(row.trial_index)).sort((a, b) => a - b), Array.from({ length: 120 }, (_, i) => i))
  check('Cognitive export binds exact child hash and measurement', trials.every(row => row.source_result_hash === participant.child.resultHash &&
    row.measurement_digest === participant.child.measurementDigest && row.epoch === String(participant.child.epoch)))
  check('Every exported row has a complete parent FINAL hash', [...raw, ...trials].every(row => /^[a-f0-9]{64}$/.test(row.source_final_hash)))
  check('All exports share one verified parent FINAL hash', new Set([...raw, ...trials].map(row => row.source_final_hash)).size, 1)
  check('Cognitive manifest binds the exported parent FINAL hash', artifacts.COGNITIVE_TRIAL_LONG.manifest.batch.parentFinalHash, trials[0].source_final_hash)
  check('Cognitive export retains software-frame protocol', trials.every(row => row.timing_policy === 'software-frame-v1' && row.config_version === '1.1.0'))
  check('Cognitive export has keyboard provenance', trials.every(row => {
    const provenance = JSON.parse(row.administration_provenance)
    return provenance.deviceClass === 'DESKTOP_LAPTOP' && provenance.administrationMode === 'KEYBOARD_MOUSE'
  }))
  check('Cognitive Go reactions are real bounded responses', trials.filter(row => row.stimulus_code === 'go').length === 90 &&
    trials.filter(row => row.stimulus_code === 'go').every(row => row.responded === 'true' && Number(row.rt) >= 100 && Number(row.rt) <= 800))
  check('Cognitive NoGo reactions remain withheld with missingness reason', trials.filter(row => row.stimulus_code === 'nogo').length === 30 &&
    trials.filter(row => row.stimulus_code === 'nogo').every(row => row.responded === 'false' && row.rt === '' && row.rt_missing_reason === 'NO_GO_WITHHELD'))
  check('Cognitive export explicitly disclaims physical timing', artifacts.COGNITIVE_TRIAL_LONG.manifest.timingProvenance, 'MONOTONIC_SOFTWARE_OBSERVED_MS_NOT_PHYSICAL_ONSET')
  await screenshot(page, 'researcher-exports')
}
async function main() {
  assert.equal(process.env.SURVEY_CANDIDATE_ISOLATED, '1')
  const file = process.env.SURVEY_CANDIDATE_FIXTURE
  assert(file, 'SURVEY_CANDIDATE_FIXTURE is required')
  const stat = fs.statSync(file)
  assert(stat.isFile() && (stat.mode & 0o077) === 0, 'Fixture must be a private mode-0600 file')
  fixture = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(fixture.schemaVersion, 1); assert.equal(fixture.isolated, true)
  const fixtureAge = Date.now() - Date.parse(fixture.createdAt)
  assert(fixtureAge >= 0 && fixtureAge < 3600000, 'Use a fresh synthetic fixture')
  await loopback(fixture.surveyUrl, 'survey.eduk12.top'); await loopback(fixture.adminUrl, 'training.eduk12.top')
  output = path.resolve(process.env.SURVEY_CANDIDATE_OUTPUT || '/tmp/survey-candidate-browser')
  assert(!fs.existsSync(output), 'Use a new artifact directory, never overwrite evidence')
  assert(!path.resolve(file).startsWith(output + path.sep), 'Private fixture cannot live inside artifact output')
  fs.mkdirSync(output, { recursive: true, mode: 0o700 })
  evidence.fixtureRunId = fixture.runId
  assert(/^[a-f0-9]{40}$/.test(process.env.SURVEY_CI_SOURCE_SHA || ''), 'Exact candidate source SHA required')
  assert.equal(fixture.sourceCommit, process.env.SURVEY_CI_SOURCE_SHA, 'Fixture must belong to the same candidate')
  for (const key of ['SURVEY_CI_FRONTEND_IMAGE_ID', 'SURVEY_CI_BACKEND_IMAGE_ID']) {
    assert(/^sha256:[a-f0-9]{64}$/.test(process.env[key] || ''), key + ' must bind the exact built image')
  }
  evidence.sourceCommit = process.env.SURVEY_CI_SOURCE_SHA
  evidence.images = { frontend: process.env.SURVEY_CI_FRONTEND_IMAGE_ID, backend: process.env.SURVEY_CI_BACKEND_IMAGE_ID }
  evidence.harnessSha256 = SHA256(fs.readFileSync(__filename))
  evidence.transport = { survey: fixture.surveyUrl, admin: fixture.adminUrl,
    statement: 'Loopback-only trusted test HTTPS; no production ingress certification.' }
  save()
  browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: ['--no-proxy-server', '--disable-background-networking',
      '--host-resolver-rules=MAP survey.eduk12.top 127.0.0.1, MAP training.eduk12.top 127.0.0.1, MAP * ~NOTFOUND'] })
  evidence.environment.chromium = browser.version()
  timer = setTimeout(() => { evidence.status = 'failed'; evidence.failure = { phase, message: 'Five-minute browser budget exceeded' }; save(); void browser.close() }, 300000)
  await adminJourney()
  const researcher = await researcherJourney()
  const participant = await participantJourney(researcher.entryUrl)
  await exportJourney(researcher.page, researcher.wave, participant)
  check('No browser runtime errors', evidence.browserErrors, [])
  check('All observed Survey API responses succeed', evidence.requests.filter(request => request.status >= 400), [])
  check('No collected visual or accessibility failures', evidence.visualFailures, [])
  evidence.status = 'pass'; evidence.finishedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ status: 'pass', checks: evidence.checks.length, requests: evidence.requests.length }))
}
main().catch(async error => {
  evidence.status = 'failed'
  // Avoid Playwright call-log dumps: locators can include synthetic passwords,
  // invitation capabilities or DOM snapshots. Keep only sanitized first line.
  let message = String(error.message).split('\n')[0].slice(0, 500)
  for (const secret of [fixture?.adminPassword, fixture?.researcher?.totpSecretBase64].filter(Boolean)) message = message.replaceAll(secret, '[redacted]')
  message = message.replace(/#(?:entry|token|secret)=[^\s]+/g, '#[redacted]')
  evidence.failure ||= { phase, name: error.name, message }; save()
  if (activePage && !activePage.isClosed()) await screenshot(activePage, 'failure-masked').catch(() => {})
  console.error(JSON.stringify(evidence.failure)); process.exitCode = 1
}).finally(async () => { clearTimeout(timer); if (browser) await browser.close(); save() })
