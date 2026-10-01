const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('../backend/node_modules/playwright-core')
const html = process.argv[2]
const output = process.argv[3]
if (!html || !output) throw new Error('Usage: node cognitive-report-reading-preview.cjs <preview.html> <evidence-directory>')
fs.mkdirSync(output, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.setContent(fs.readFileSync(html, 'utf8'))
    await page.locator('.cognitive-reading').waitFor()
    const select = page.getByLabel('选择报告样例')
    const shots = []
    const shot = async name => { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); shots.push(name) }
    const report = page.locator('.cognitive-reading')
    assert.match(await report.innerText(), /310 毫秒/)
    await shot('reaction-desktop')
    await page.getByRole('button', { name: '详细解读', exact: true }).click()
    assert.equal(await page.locator('.cognitive-reading__detail').isVisible(), true)
    await shot('reaction-detail')
    await page.getByRole('button', { name: '学生 / 家长', exact: true }).click()
    assert.equal(await page.locator('.cognitive-reading__detail').isVisible(), false)
    await select.selectOption('reaction-insufficient')
    assert.match(await report.innerText(), /部分关键指标暂不解释/)
    assert.doesNotMatch(await report.innerText(), /305 毫秒/)
    assert.equal(await page.locator('.cognitive-reading__chart').count(), 0)
    await shot('reaction-insufficient')
    await select.selectOption('reaction-empty')
    assert.doesNotMatch(await report.innerText(), /\d+ (ms|毫秒)/)
    await select.selectOption('reaction-limited')
    assert.match(await report.innerText(), /质量限制/)
    await shot('reaction-interrupted')
    await select.selectOption('memory-standard')
    assert.match(await report.innerText(), /最长数字序列/)
    await shot('memory-desktop')
    await select.selectOption('sst-experience')
    assert.doesNotMatch(await page.locator('.cognitive-reading__metrics').innerText(), /SSRT|停止反应估计/)
    await shot('sst-experience')
    await select.selectOption('sst-standard')
    assert.match(await report.innerText(), /不是临床抑制分数/)
    await shot('sst-standard')
    const options = await select.locator('option').evaluateAll(nodes => nodes.map(n => n.value))
    for (const key of options) {
      await select.selectOption(key)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, key)
      assert.equal(await report.locator('h1').count(), 1)
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const key of options) {
        await select.selectOption(key)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${key} at ${width}px`)
        await page.waitForFunction(() => [...document.querySelectorAll('.cognitive-reading__chart-scroll')].every(element => element.scrollWidth <= element.clientWidth))
        await page.getByRole('button', { name: '详细解读', exact: true }).click()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${key} details at ${width}px`)
        if (key === 'identity-matrix-1.0.0') assert.match(await page.locator('.cognitive-reading__detail').innerText(), /递进规律：100%/)
        if (key === 'identity-pairedassociate-1.0.0') assert.match(await page.locator('.cognitive-reading__detail').innerText(), /第 1 轮：/)
        if (width === 390 && ['identity-matrix-1.0.0', 'identity-pairedassociate-1.0.0', 'identity-picturesequence-1.0.0'].includes(key)) {
          const name = key.split('-')[1] + '-detail-mobile'
          await page.locator('.cognitive-reading__detail').screenshot({ path: path.join(output, name + '.png') })
          shots.push(name)
        }
        await page.getByRole('button', { name: '学生 / 家长', exact: true }).click()
      }
    }
    for (const key of ['reaction-valid', 'memory-standard', 'sst-standard']) {
      await select.selectOption(key)
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.waitForFunction(() => [...document.querySelectorAll('.cognitive-reading__chart-scroll')].every(element => element.scrollWidth <= element.clientWidth))
      await shot(key + '-mobile')
      await page.getByRole('button', { name: '详细解读', exact: true }).focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('.cognitive-reading__detail').isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${key} mobile details`)
      if (key === 'reaction-valid') await shot('reaction-detail-mobile')
      await page.setViewportSize({ width: 1280, height: 1000 })
    }
    await select.selectOption('reaction-valid')
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.locator('.cognitive-reading__detail').isVisible(), true)
    assert.equal(await page.locator('.preview-toolbar').isVisible(), false)
    await page.pdf({ path: path.join(output, 'reaction-report.pdf'), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'browser-validation.json'), JSON.stringify({ passed: true, synthetic: true, actualReactComponents: true, corpusChecked: options.length, viewportWidths: [1280, 390, 320], checks: ['quality states and speed withholding', 'SST short protocol caveat', 'teacher detail existing data only', 'keyboard activation', 'all previews at 390px and 320px without page or chart overflow', 'mobile detail without page overflow', 'print details visible', 'no browser runtime errors'], screenshots: shots }, null, 2))
    console.log(`Passed ${options.length} report previews, ${shots.length} screenshots and print PDF`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
