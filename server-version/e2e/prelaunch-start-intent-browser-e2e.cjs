// Run with backend/node_modules/.bin/tsx in the existing isolated browser gate.
// This exercises the actual browser store and public START, not a mock IDB.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { chromium } = require('../backend/node_modules/playwright-core')
const { transformSync } = require('../frontend/node_modules/esbuild')
const { prisma } = require('../backend/src/config/database')
const { createAccessTokenForAssignment } = require('../backend/src/modules/cognitive/public.service')

const BASE = (process.env.SITUATIONAL_BUNDLE_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const out = process.env.SITUATIONAL_BUNDLE_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-bundle-e2e'
const executablePath = [process.env.SITUATIONAL_BUNDLE_E2E_BROWSER_EXECUTABLE, chromium.executablePath(),
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((value) => value && fs.existsSync(value))
const checks = []
const passed = (name) => { checks.push(name); console.log(`PASS ${name}`) }
const browserSource = transformSync(fs.readFileSync(path.join(__dirname, '../frontend/src/modules/cognitive/core/start-intent.ts'), 'utf8'), {
  loader: 'ts', format: 'iife', globalName: 'HuisurveyStartIntent', target: 'es2020',
}).code

async function nativeStorage(browser) {
  const context = await browser.newContext()
  try {
    await context.route('**/__prelaunch_intent_test__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage test</title>' }))
    const pages = await Promise.all([context.newPage(), context.newPage()])
    for (const page of pages) {
      await page.goto(`${BASE}/__prelaunch_intent_test__`)
      await page.addScriptTag({ content: browserSource })
    }
    // Independent browser pages race their very first readwrite transactions.
    const values = await Promise.all(pages.map((page) => page.evaluate(() => window.HuisurveyStartIntent.getOrCreateCognitiveStartIntent('synthetic-shared-access'))))
    assert.ok(values[0] === values[1] && /^[A-Za-z0-9_-]{43}$/.test(values[0]), 'first competing tabs must share one strong secret')
    passed('native-IDB-first-cross-tab-create')
    await pages[0].reload()
    await pages[0].addScriptTag({ content: browserSource })
    assert.ok(await pages[0].evaluate((expected) => window.HuisurveyStartIntent.readCognitiveStartIntent('synthetic-shared-access').then((actual) => actual === expected), values[0]))
    passed('native-IDB-reload-durable-intent')
    const rotated = await Promise.all(pages.map((page) => page.evaluate((expected) => window.HuisurveyStartIntent.rotateCognitiveStartIntent('synthetic-shared-access', expected), values[0])))
    assert.ok(rotated[0] === rotated[1] && rotated[0] !== values[0], 'concurrent explicit rotations must converge')
    assert.ok(await pages[1].evaluate((expected) => window.HuisurveyStartIntent.rotateCognitiveStartIntent('synthetic-shared-access', expected.old).then((actual) => actual === expected.current), { old: values[0], current: rotated[0] }))
    passed('native-IDB-rotation-CAS')
    const migration = await pages[0].evaluate(async () => {
      const legacy = 'C'.repeat(43)
      localStorage.setItem('cognitive:start-intent:synthetic-legacy-access', legacy)
      const result = await window.HuisurveyStartIntent.readCognitiveStartIntent('synthetic-legacy-access')
      return result === legacy && localStorage.getItem('cognitive:start-intent:synthetic-legacy-access') === null
    })
    assert.ok(migration, 'legacy response-lost intent must migrate without replacement')
    passed('native-IDB-legacy-intent-migration')
    const aborted = await pages[0].evaluate(async () => {
      const original = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) {
        const request = original.apply(this, args)
        this.transaction.abort()
        return request
      }
      let rejected = false
      try { await window.HuisurveyStartIntent.getOrCreateCognitiveStartIntent('synthetic-aborted-access') }
      catch { rejected = true }
      finally { IDBObjectStore.prototype.put = original }
      return rejected && (await window.HuisurveyStartIntent.readCognitiveStartIntent('synthetic-aborted-access')) === ''
    })
    assert.ok(aborted, 'a successful put request must not acknowledge an aborted transaction')
    passed('native-IDB-abort-does-not-acknowledge')
  } finally { await context.close() }
}

async function main() {
  assert.equal(process.env.NODE_ENV, 'test', 'browser fault gate is test-only')
  assert.ok(process.env.DATABASE_URL && process.env.RELEASE_INTEGRATION_DATABASE_URL, 'isolated browser integration URLs are required')
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL).hostname), 'only the loopback CI database is allowed')
  assert.ok(executablePath, 'Chromium must be installed; this gate must not skip')
  const browser = await chromium.launch({ headless: true, executablePath })
  let ownerId
  let assignmentId
  const tokenIds = []
  try {
    await nativeStorage(browser)
    const config = await prisma.cognitiveTestConfig.findFirst({ where: { testType: 'fake', status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' } })
    assert.ok(config, 'seeded published fake Cognitive config required')
    const owner = await prisma.user.create({ data: { username: `prelaunch-start-${randomUUID()}`, passwordHash: 'test-only-not-a-login', role: 'TEACHER', teacherApproved: true } })
    ownerId = owner.id
    const assignment = await prisma.cognitiveAssignment.create({ data: {
      title: 'Prelaunch anonymous START fixture', configId: config.id, createdBy: ownerId, status: 'PUBLISHED', maxAttempts: 2,
    } })
    assignmentId = assignment.id
    const createToken = async () => {
      const token = await createAccessTokenForAssignment(ownerId, 'TEACHER', assignmentId, new Date(Date.now() + 3_600_000).toISOString(), 1)
      tokenIds.push(token.id)
      return token
    }
    const token = await createToken()
    const context = await browser.newContext()
    try {
      const pages = await Promise.all([context.newPage(), context.newPage()])
      const intents = []
      for (const page of pages) {
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().endsWith(`/assignments/${token.token}/start`)) {
            intents.push(request.postDataJSON()?.startIntent)
          }
        })
        await page.goto(`${BASE}/public/cognitive/assignments/${token.token}`)
        await page.getByRole('button', { name: '开始匿名测评', exact: true }).waitFor()
      }
      const routePattern = `**/api/public/cognitive/assignments/${token.token}/start`
      await pages[0].route(routePattern, async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        assert.equal(body.code, 0, 'lost response must follow successful durable START')
        await route.abort('failed')
      }, { times: 1 })
      await Promise.all(pages.map((page) => page.getByRole('button', { name: '开始匿名测评', exact: true }).click()))
      await pages[1].waitForURL(/\/public\/cognitive\/sessions\//)
      await pages[0].getByRole('alert').waitFor()
      assert.ok(intents.length >= 2 && intents.every((value) => value === intents[0]), 'both actual HTTP STARTs must use the same committed intent')
      let sessions = await prisma.cognitiveSession.findMany({ where: { accessTokenId: token.id }, select: { id: true } })
      assert.equal(sessions.length, 1)
      assert.equal((await prisma.cognitiveAccessToken.findUniqueOrThrow({ where: { id: token.id } })).usedCount, 1)
      assert.ok(pages[1].url().includes(sessions[0].id))
      passed('two-tabs-one-session-one-quota')
      // No recovery token reached tab A. The exhausted public info endpoint
      // must not prevent replay through the already persisted secret intent.
      await pages[0].reload()
      await pages[0].getByRole('heading', { name: '继续匿名认知测评', exact: true }).waitFor()
      await pages[0].getByRole('button', { name: '开始匿名测评', exact: true }).click()
      await pages[0].waitForURL(/\/public\/cognitive\/sessions\//)
      assert.ok(pages[0].url().includes(sessions[0].id))
      sessions = await prisma.cognitiveSession.findMany({ where: { accessTokenId: token.id }, select: { id: true } })
      assert.equal(sessions.length, 1)
      assert.equal((await prisma.cognitiveAccessToken.findUniqueOrThrow({ where: { id: token.id } })).usedCount, 1)
      passed('commit-response-loss-exhausted-link-replay')
    } finally { await context.close() }

    const untouched = await createToken()
    const blocked = await browser.newContext()
    try {
      await blocked.addInitScript(() => {
        IDBFactory.prototype.open = function () { throw new DOMException('Blocked test storage', 'SecurityError') }
      })
      const page = await blocked.newPage()
      let starts = 0
      page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/assignments/${untouched.token}/start`)) starts += 1 })
      await page.goto(`${BASE}/public/cognitive/assignments/${untouched.token}`)
      await page.getByRole('button', { name: '开始匿名测评', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.equal(starts, 0, 'blocked durable storage must prevent HTTP START')
      assert.equal((await prisma.cognitiveAccessToken.findUniqueOrThrow({ where: { id: untouched.id } })).usedCount, 0)
      passed('storage-denial-zero-HTTP-starts-zero-quota')
    } finally { await blocked.close() }
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'prelaunch-start-intent.json'), JSON.stringify({ status: 'PASS', checks }, null, 2))
  } finally {
    await browser.close()
    if (tokenIds.length) {
      await prisma.cognitiveSession.deleteMany({ where: { accessTokenId: { in: tokenIds } } })
      await prisma.cognitiveAccessToken.deleteMany({ where: { id: { in: tokenIds } } })
    }
    if (assignmentId) await prisma.cognitiveAssignment.delete({ where: { id: assignmentId } })
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } })
    await prisma.$disconnect()
  }
}
main().catch((error) => {
  console.error('Prelaunch anonymous START browser gate failed:', error?.message || 'unknown error')
  process.exitCode = 1
})
