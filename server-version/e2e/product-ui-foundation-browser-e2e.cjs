/* Run against Vite's standalone /examples/product-ui.html. No backend required. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const base = process.env.PRODUCT_UI_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.PRODUCT_UI_EVIDENCE_DIR || '/tmp/eduk12-product-ui-foundation'

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: process.env.PRODUCT_UI_BROWSER_CHANNEL || undefined })
  const evidence = []
  try {
    for (const width of [360, 390, 768, 820, 1366]) {
      for (const hasTouch of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch })
        const page = await context.newPage()
        const errors = []
        const apiRequests = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()) })
        await page.goto(`${base}/examples/product-ui.html`)
        await page.getByRole('heading', { name: '了解自己的学习方式' }).waitFor()
        assert.equal(await page.locator('main').count(), 1)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        assert.equal(overflow, false, `horizontal overflow at ${width}`)
        const buttons = await page.locator('.hui-button').evaluateAll((nodes) => nodes.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })))
        assert(buttons.every((box) => box.width >= 44 && box.height >= 44))
        const labels = await page.locator('.example-answer').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
        assert(labels.every((height) => height >= 44))
        if (width < 640) {
          const group = await page.getByRole('group', { name: '示例操作' }).boundingBox()
          const primary = await page.getByRole('button', { name: '确认示例操作', exact: true }).boundingBox()
          assert(Math.abs(group.width - primary.width) < 2)
        }
        if (hasTouch) {
          await page.getByText('先看一遍说明，再开始', { exact: true }).tap()
          await page.getByRole('button', { name: '确认示例操作', exact: true }).tap()
        } else {
          await page.keyboard.press('Tab')
          assert(await page.getByRole('radio').first().evaluate((node) => node === document.activeElement))
          await page.keyboard.press('Space')
          await page.keyboard.press('Tab')
          assert(await page.getByRole('textbox').evaluate((node) => node === document.activeElement))
          await page.keyboard.press('Tab')
          const focused = page.getByRole('button', { name: '确认示例操作', exact: true })
          assert(await focused.evaluate((node) => node === document.activeElement))
          assert.equal(await focused.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid')
          await page.keyboard.press('Enter')
        }
        assert(await page.getByRole('radio').first().isChecked())
        await page.getByRole('status').filter({ hasText: '示例操作已确认' }).waitFor()
        const unscoped = await page.locator('#legacy-sentinel').evaluate((node) => getComputedStyle(node).getPropertyValue('--hui-color-action'))
        assert.equal(unscoped, '', 'tokens leaked outside product scope')
        assert.deepEqual(apiRequests, [])
        assert.deepEqual(errors, [])
        await page.screenshot({ path: path.join(output, `${width}-${hasTouch ? 'touch' : 'keyboard'}.png`), fullPage: true })
        evidence.push({ width, input: hasTouch ? 'emulated-touch' : 'keyboard', passed: true })
        await context.close()
      }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(`${base}/examples/product-ui.html`)
    await page.getByRole('heading', { name: '了解自己的学习方式' }).waitFor()
    assert.equal(await page.locator('.hui-button').first().evaluate((node) => getComputedStyle(node).animationName), 'none')
    evidence.push({ reducedMotion: true, passed: true })
    await context.close()
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
    console.log(`Passed ${evidence.length} product UI browser cases; evidence: ${output}`)
  } finally { await browser.close() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
