const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('../backend/node_modules/playwright-core')
const esbuild = require('../frontend/node_modules/esbuild')
const output = process.argv[2]
if (!output) throw new Error('Usage: node group-report-browser.cjs <evidence-directory>')
fs.mkdirSync(output, { recursive: true })
const bundle = path.join(output, 'group-fixture.js')
const printOnly = process.argv.includes('--print-only')
if (!printOnly) esbuild.buildSync({ entryPoints: [path.join(__dirname, 'group-report-fixture.tsx')], outfile: bundle, bundle: true,
  jsx: 'automatic', minify: true, nodePaths: [path.join(__dirname, '../frontend/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } })
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;background:#edf4f5;margin:0;padding:20px}button,select{font:inherit;padding:.5em}main{max-width:1400px;margin:auto}*{box-sizing:border-box}</style><style>${fs.readFileSync(bundle.replace(/\.js$/, '.css'), 'utf8')}</style><div id="root"></div><script>${fs.readFileSync(bundle, 'utf8')}</script></html>`
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.setContent(html)
    await page.getByRole('button', { name: '打开群体报告' }).click()
    await page.getByRole('article', { name: '群体报告阅读' }).waitFor()
    const screenshots = printOnly ? ['group-1440.png', 'group-390.png'] : []
    if (!printOnly) {
    const select = page.getByLabel('阅读指标')
    await select.selectOption('activities')
    assert.equal(await page.getByRole('table').isVisible(), true)
    assert.match(await page.getByRole('table').innerText(), /80%/)
    assert.equal(await page.evaluate(() => window.groupReportRequests.length), 2)
    await page.getByRole('button', { name: '生成更新版报告' }).click()
    await page.getByLabel('群体报告版本').selectOption('00000000-0000-4000-8000-000000000001')
    assert.equal(await page.evaluate(() => window.groupReportRequests.filter(row => row.method === 'POST').length), 1)
    await page.getByRole('button', { name: '全屏展示' }).click()
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('task-group-report'))
    await page.evaluate(() => document.exitFullscreen())
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`)
      await page.screenshot({ path: path.join(output, `group-${width}.png`), fullPage: true }); screenshots.push(`group-${width}.png`)
    }
    }
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.getByRole('button', { name: '打印 / 保存 PDF' }).isVisible(), false)
    assert.equal(await page.getByRole('table').isVisible(), true)
    assert.equal(await page.getByRole('heading', { name: '本周自习小时', exact: true, level: 2 }).isVisible(), true)
    await page.pdf({ path: path.join(output, 'group-report.pdf'), format: 'A4', printBackground: true })
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ passed: true, synthetic: true, printOnlyContinuation: printOnly,
      actualReactComponents: true, widths: [1440, 390], checks: ['open saved artifact', 'select leaf tool', 'explicit generation', 'read original version', 'local metric switch', 'actual fullscreen', 'all metrics printed', 'responsive overflow', 'no page errors'], screenshots }, null, 2))
    console.log('Group report browser passed; screenshots and printable PDF retained')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
