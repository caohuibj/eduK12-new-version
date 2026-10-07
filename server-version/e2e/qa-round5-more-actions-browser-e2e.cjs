/* Real browser regression: portal visibility, viewport bounds and focus. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture, sampleCourse } = require('./visual-canonical-browser-e2e.cjs')
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-r5-menus'

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const engine = process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'
  const browser = await browsers[engine].launch({ headless: true })
  const results = []
  try {
    for (const width of [375, 768, 1280, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      await page.bringToFront()
      page.setDefaultTimeout(15000)
      const requests = await installApiFixture(page, 'TEACHER')
      try {
        await page.goto(base + '/dashboard')
        const trigger = page.getByLabel(`${sampleCourse.title} 的更多操作`, { exact: true })
        await trigger.scrollIntoViewIfNeeded()
        await trigger.click()
        const menu = page.getByRole('group', { name: `${sampleCourse.title} 的更多操作菜单` })
        await menu.waitFor({ state: 'visible' })
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
        const bounds = await menu.boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 845, 'menu fits viewport')
        assert.equal(await menu.evaluate(element => element.contains(document.activeElement)), true, 'initial keyboard focus is inside visible menu')
        await page.screenshot({ path: path.join(output, `${engine}-${width}-menu.png`) })
        await page.keyboard.press('Escape')
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
        assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape restores trigger focus')
        await trigger.press('Enter')
        await menu.waitFor({ state: 'visible' })
        await page.locator('h1').click()
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'outside pointer dismisses')
        await trigger.click()
        await menu.getByRole('button', { name: '编辑课程', exact: true }).click()
        await page.getByRole('dialog', { name: '编辑课程' }).waitFor({ state: 'visible' })
        assert.equal(await menu.count(), 0, 'action dismisses menu and opens the intended dialog')
        await page.keyboard.press('Escape')
        await trigger.click()
        await page.mouse.move(5, 5)
        await page.mouse.wheel(0, 100)
        await menu.waitFor({ state: 'hidden' })
        assert.equal(requests.some(request => request.method !== 'GET'), false)
        results.push({ engine, width, status: 'passed' })
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${engine}-${width}-failure.png`) })
        const states = await page.locator('.staff-more-actions').evaluateAll(elements => elements.map(element => ({ text: element.innerText, expanded: element.querySelector('button')?.getAttribute('aria-expanded') })))
        console.error(JSON.stringify(states))
        console.error((await page.locator('body').innerText()).slice(-1500))
        throw error
      } finally { await context.close() }
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, `${engine}.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ status: 'passed', engine, viewports: results.length }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
