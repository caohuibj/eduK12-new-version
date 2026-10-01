const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('../backend/node_modules/playwright-core')
const [html, output] = process.argv.slice(2)
if (!html || !output) throw new Error('Usage: node cognitive-report-audiences-preview.cjs <preview.html> <evidence-directory>')
fs.mkdirSync(output, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(String(error)))
    await page.setContent(fs.readFileSync(html, 'utf8'))
    await page.locator('.cognitive-magazine').waitFor()
    const samples = page.getByLabel('选择报告样例')
    const audience = page.getByLabel('选择阅读版本')
    const options = await samples.locator('option').evaluateAll(nodes => nodes.map(node => node.value))
    const shots = []
    const shot = async name => { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); shots.push(name) }
    assert.match(await page.locator('.cognitive-magazine').innerText(), /驾驶员/)
    assert.match(await page.locator('.cognitive-magazine').innerText(), /不是职业资格/)
    assert.equal(await page.locator('.cognitive-magazine__story li').count(), 3)
    await shot('reaction-magazine-desktop')
    await audience.selectOption('professional')
    assert.match(await page.locator('.cognitive-professional').innerText(), /100ms|100 ms/)
    assert.match(await page.locator('.cognitive-professional').innerText(), /中位反应时/)
    await shot('reaction-professional-desktop')
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const version of ['participant', 'professional']) {
        await audience.selectOption(version)
        for (const key of options) {
          await samples.selectOption(key)
          assert.equal(await page.locator('.cognitive-reading h1').count(), 1, key)
          await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
          await page.waitForFunction(() => [...document.querySelectorAll('.cognitive-reading__chart-scroll')].every(element => element.scrollWidth <= element.clientWidth))
          if (key === 'reaction-insufficient' || key === 'reaction-empty') {
            assert.doesNotMatch(await page.locator('.cognitive-reading').innerText(), /305 毫秒/)
            assert.equal(await page.locator('.cognitive-reading__chart').count(), 0)
          }
        }
      }
    }
    for (const key of ['reaction-valid', 'reaction-insufficient', 'memory-standard', 'sst-experience', 'sst-standard']) {
      await samples.selectOption(key)
      for (const version of ['participant', 'professional']) {
        await audience.selectOption(version)
        await page.setViewportSize({ width: 390, height: 844 })
        await shot(`${key}-${version}-mobile`)
      }
    }
    await page.setViewportSize({ width: 1280, height: 1000 })
    await samples.selectOption('sst-experience'); await audience.selectOption('professional')
    assert.doesNotMatch(await page.locator('.cognitive-professional table').innerText(), /SSRT|停止信号反应时/)
    assert.match(await page.locator('.cognitive-professional__notice').innerText(), /当前协议不提供/)
    await samples.selectOption('memory-standard'); await audience.selectOption('participant'); await shot('memory-magazine-desktop')
    await samples.selectOption('sst-standard'); await shot('sst-magazine-desktop')
    await audience.selectOption('professional'); await shot('sst-professional-desktop')
    await samples.selectOption('reaction-valid')
    for (const version of ['participant', 'professional']) {
      await audience.selectOption(version)
      await page.emulateMedia({ media: 'print' })
      assert.equal(await page.locator('.preview-toolbar').isVisible(), false)
      assert.equal(await page.getByRole('button', { name: version === 'participant' ? '打印这份报告' : '打印专业报告' }).isVisible(), false)
      if (version === 'participant') {
        assert.equal(await page.locator('.cognitive-magazine__print-notes').isVisible(), true)
        assert.match(await page.locator('.cognitive-magazine__print-notes').innerText(), /呈现 1.2.0/)
      }
      await page.pdf({ path: path.join(output, `reaction-${version}.pdf`), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
      await page.emulateMedia({ media: 'screen' })
    }
    await audience.selectOption('participant')
    await page.locator('.cognitive-magazine__notes summary').focus(); await page.keyboard.press('Enter')
    assert.equal(await page.locator('.cognitive-magazine__notes').getAttribute('open'), '')
    await audience.selectOption('professional')
    await page.evaluate(() => {
      const report = document.querySelector('.cognitive-professional')
      const shell = document.createElement('div'); shell.className = 'cognitive-staff-report-open'
      const unrelated = document.createElement('div'); unrelated.className = 'staff-print-unrelated'; unrelated.textContent = '任务编辑与公开链接控件'
      const reader = document.createElement('section'); reader.setAttribute('data-cognitive-report-reader', '')
      report.parentNode.insertBefore(shell, report); shell.append(unrelated, reader); reader.append(report)
    })
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.locator('.staff-print-unrelated').isVisible(), false)
    assert.equal(await page.locator('.cognitive-professional').isVisible(), true)
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'browser-validation.json'), JSON.stringify({ passed: true, synthetic: true, actualReactComponents: true,
      corpusChecked: options.length, audienceVariants: 2, viewportWidths: [1280, 390, 320], screenshots: shots,
      checks: ['216 report/width/audience combinations without page or chart overflow', 'professional formulas and frozen method', 'insufficient and empty values withheld in both versions', 'SST short estimate withheld', 'occupational example scope', 'keyboard explanation expansion', 'separate print PDFs', 'closed explanatory notes retained in print', 'staff editing controls excluded from report print', 'no runtime errors'] }, null, 2))
    console.log(`Passed ${options.length * 2 * 3} audience/viewport reports, ${shots.length} screenshots and 2 PDFs`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
