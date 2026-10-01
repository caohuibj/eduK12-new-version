// Real Chromium + IndexedDB + local API + dedicated synthetic PostgreSQL.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')
const base = process.env.SITUATIONAL_VNEXT_BROWSER_BASE_URL || 'http://127.0.0.1:51473'
if (base !== 'http://127.0.0.1:51473') throw new Error('Synthetic local acceptance URL required')
const fixture = JSON.parse(fs.readFileSync('/tmp/eduk12-situational-vnext-browser.json', 'utf8'))
const evidence = '/tmp/eduk12-situational-vnext-evidence'
const executablePath = [process.env.SITUATIONAL_VNEXT_BROWSER_EXECUTABLE, chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p))
const cases = []
const pass = name => { cases.push(name); console.log(`[PASS] ${name}`) }
async function waitScene(page, key) { await page.getByRole('heading', { name: `Synthetic ${key}`, exact: true, level: 1 }).waitFor({ timeout: 60000 }) }
async function choice(page, key) { await page.locator(`input[type=radio][value=${key}]`).first().click(); await page.getByText('最新作答已保存到本机。', { exact: true }).waitFor() }
async function next(page, key) { await page.getByRole('button', { name: '下一题', exact: true }).click(); await waitScene(page, key) }
async function previous(page, key) { await page.getByRole('button', { name: '上一题', exact: true }).click(); await waitScene(page, key) }
async function submit(page) {
  const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && /\/situational\/attempts\/[^/]+\/submit$/.test(new URL(r.url()).pathname), { timeout: 60000 })
  await page.getByRole('button', { name: '提交测评', exact: true }).click()
  const response = await responsePromise
  assert.equal(response.status(), 200, JSON.stringify(await response.json()))
  await page.waitForURL(/\/result$/, { timeout: 60000 }); return response
}
async function run() {
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile })
      const page = await context.newPage(); const errors = []
      process.on('uncaughtExceptionMonitor', () => { void page.screenshot({ path: path.join(evidence, 'browser-failure.png'), fullPage: true }) })
      page.on('pageerror', e => errors.push(e.message))
      let finals = 0, checkpoints = 0
      page.on('request', r => { if (r.method() === 'POST' && /\/submit$/.test(new URL(r.url()).pathname)) finals++; if (r.method() === 'POST' && new URL(r.url()).pathname.includes('/situational/') && /checkpoint|\/responses$/.test(new URL(r.url()).pathname)) checkpoints++ })
      await loginWithSession(page, { baseUrl: base, route: '/student/login', username: fixture.username, password: fixture.password, timeout: 60000 })
      await page.goto(`${base}/student/situational/synthetic-situational-vnext`); await waitScene(page, 'entry')
      assert.equal(await page.getByText('Synthetic probe 1', { exact: true }).count(), 0)
      await choice(page, 'A')
      await page.getByRole('button', { name: '确认行动选择', exact: true }).click()
      await page.getByRole('slider', { name: /Synthetic probe 1/ }).waitFor()
      assert.equal(await page.locator('input[type=radio][value=A]').isDisabled(), true)
      await page.screenshot({ path: path.join(evidence, mobile ? 'mobile-staged.png' : 'desktop-staged.png'), fullPage: true })
      await page.reload(); await waitScene(page, 'entry')
      assert.equal(await page.locator('input[type=radio][value=A]').isDisabled(), true)
      const probe = page.getByRole('slider', { name: /Synthetic probe 1/ }); await probe.fill('80'); await probe.focus(); await probe.press('Enter')
      await page.getByText('最新作答已保存到本机。', { exact: true }).waitFor()
      for (const i of [1, 2, 3]) {
        await page.getByRole('slider', { name: new RegExp(`Synthetic probe ${i}`) }).waitFor()
        await page.getByRole('button', { name: '确认本阶段作答', exact: true }).click()
        if (i < 3) await page.getByRole('slider', { name: new RegExp(`Synthetic probe ${i + 1}`) }).waitFor()
      }
      await next(page, 'left'); await choice(page, 'A'); await next(page, 'common'); await choice(page, 'A')
      await submit(page)
      const attempt = /attempts\/([^/]+)\/result/.exec(page.url())[1]
      const denied = await sessionJsonFetch(page, `/situational/attempts/${attempt}/research-export`)
      assert.equal(denied.status, 403); assert.ok(!JSON.stringify(denied.body).includes('rawResponses'))
      assert.equal(finals, 1); assert.equal(checkpoints, 0); assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(evidence, mobile ? 'mobile-result.png' : 'desktop-result.png'), fullPage: true })
      pass(`${mobile ? 'mobile' : 'desktop'}: staged probe disclosure, keyboard commit, resume lock, one FINAL, result, research deny`)
      await page.goto(`${base}/student/situational/synthetic-situational-history`); await waitScene(page, 'entry')
      await choice(page, 'A'); await next(page, 'left'); await choice(page, 'A'); await next(page, 'common'); await choice(page, 'A')
      await previous(page, 'left'); await previous(page, 'entry'); await choice(page, 'B')
      await next(page, 'right'); await choice(page, 'A'); await next(page, 'common')
      assert.equal(await page.locator('input[type=radio]:checked').count(), 0, 'old common answer leaked across histories')
      await page.reload(); await waitScene(page, 'common'); assert.equal(await page.locator('input[type=radio]:checked').count(), 0)
      await page.screenshot({ path: path.join(evidence, mobile ? 'mobile-history-invalidated.png' : 'desktop-history-invalidated.png'), fullPage: true })
      await choice(page, 'B'); await submit(page)
      assert.equal(finals, 2); assert.equal(checkpoints, 0); assert.deepEqual(errors, [])
      pass(`${mobile ? 'mobile' : 'desktop'}: A/common answered → B/common still reachable invalidation survives reload and FINAL`)
      await context.close()
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await loginWithSession(page, { baseUrl: base, route: '/student/login', username: fixture.username, password: fixture.password, timeout: 60000 })
    const sizes = []
    for (const count of [10, 30, 60]) {
      const begin = Date.now()
      await page.goto(`${base}/student/situational/synthetic-situational-size-${count}`); await waitScene(page, 'S0')
      const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null)
      for (let i = 0; i < count; i++) {
        await choice(page, 'A')
        for (const probeKey of [1, 4, 5]) {
          const probe = page.getByRole('slider', { name: new RegExp(`Synthetic probe ${probeKey}`) })
          await probe.fill('80'); await probe.focus(); await probe.press('Enter')
          await page.getByText('最新作答已保存到本机。', { exact: true }).waitFor()
        }
        if (i < count - 1) await next(page, `S${i + 1}`)
      }
      const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null)
      const response = await submit(page), bytes = Buffer.byteLength(response.request().postData() || '')
      assert.ok(bytes < 512 * 1024)
      if (heapBefore !== null && heapAfter !== null) assert.ok(heapAfter - heapBefore < 100 * 1024 * 1024)
      const size = { scenes: count, channels: 6, responses: count * 4, finalBytes: bytes, heapBefore, heapAfter, browserMs: Date.now() - begin }
      sizes.push(size); console.log(JSON.stringify(size)); pass(`browser ${count} scenes: six channels, durable local draft, bounded memory/payload, one FINAL`)
    }
    fs.writeFileSync(path.join(evidence, 'browser-performance.json'), JSON.stringify(sizes, null, 2))
    await context.close()
    fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify({ cases, browser: 'Chromium', syntheticOnly: true }, null, 2))
  } finally { await browser.close() }
}
run().catch(e => { console.error(e); process.exitCode = 1 })
