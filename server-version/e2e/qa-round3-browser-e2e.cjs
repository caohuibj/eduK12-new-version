/** Local synthetic-data browser regression using the actual runtime components.
 * No production URL, account, recovery capability, or business API is accepted. */
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const esbuild = require('../frontend/node_modules/esbuild')
const { chromium } = require('../backend/node_modules/playwright-core')
const output = path.resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('Usage: node qa-round3-browser-e2e.cjs <evidence-directory>')
fs.mkdirSync(output, { recursive: true })
const options = [1, 2, 3, 4].map(value => ({ value: 'option_' + value, label: '选项 ' + value, score: value }))
const items = [1, 2, 3].map(number => ({ itemCode: 'Q' + number, content: '浏览器量表题 ' + number, type: 'single', required: true, sortOrder: number, responseSetKey: 'default', randomizeOptions: false, options }))
let definition = { schemaVersion: 2, responseSets: [{ key: 'default', options }], items, scoring: { scores: [], itemRules: [] } }
const resources = [], specs = []
const fixture = { attempt: {
  id: 'r3-browser-attempt', name: '本地合成测评', status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1,
  currentIndex: 0, completedItems: 0, totalItems: 1, items: [{ id: 'unit-1', type: 'SCALE', label: '量表', index: 0 }],
  currentItem: { id: 'unit-1', type: 'SCALE', definitionHash: 'local-r3-definition', scaleAssessmentId: 'r3-browser-scale-attempt', scale: { id: 'scale-1', name: '本地三题量表', definition } },
} }
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'qa-round3-browser-fixture.tsx')], outfile: path.join(output, 'fixture.js'),
  bundle: true, jsx: 'automatic', nodePaths: [path.join(__dirname, '../frontend/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } })
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script id="fixture" type="application/json">' +
  JSON.stringify(fixture).replace(/</g, '\\u003c') + '</script><script src="/fixture.js"></script></html>'
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(output, 'fixture.js'))); return }
  if (url.pathname === '/fixture.css') {
    const assets = path.join(__dirname, '../frontend/dist/assets')
    res.setHeader('Content-Type', 'text/css'); res.end(fs.existsSync(assets) ? fs.readdirSync(assets).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n') : ''); return
  }
  if (!url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'text/html'); res.end(html); return }
  let raw = ''; for await (const chunk of req) raw += chunk
  let data = {}
  if (url.pathname === '/api/auth/csrf') data = { csrfToken: 'local-synthetic-csrf-only' }
  else if (url.pathname === '/api/organizations/measurement-resources') {
    if (req.method === 'POST') {
      const input = JSON.parse(raw); assert.equal(input.scaleId, 'original-1'); assert.equal(input.mode, 'INDIVIDUAL')
      resources.push({ id: 'resource-1', status: 'DRAFT', scale_id: input.scaleId, resource_key: 'custom-scale:original-1:INDIVIDUAL', resource_version: '1.0.1', entry: { title: '本地原创量表（个人自评）', description: '描述性试用', applicability: { analysisMode: 'INDIVIDUAL_ONLY' }, resultDisclosure: { audiences: { SUBJECT: { metricKeys: ['total'] } } } } })
      data = resources[0]
    } else data = { list: resources, truncated: false }
  }
  else if (/^\/api\/organizations\/measurement-resources\/resource-1\/(review|publish)$/.test(url.pathname)) {
    assert.equal(req.method, 'POST'); const row = resources[0], review = url.pathname.endsWith('/review')
    assert.equal(row.status, review ? 'DRAFT' : 'REVIEWED'); row.status = review ? 'REVIEWED' : 'PUBLISHED'; data = row
  }
  else if (url.pathname === '/api/organizations/reporting-specs') data = { list: specs, nextPage: null }
  else if (url.pathname === '/api/organizations/reporting-specs/descriptive') {
    const input = JSON.parse(raw); assert.equal(resources[0].status, 'PUBLISHED'); assert.equal(input.resourceId, 'resource-1')
    assert.equal(input.analysisKind, 'INDIVIDUAL_LONGITUDINAL'); assert.equal(input.minimumN, 3)
    specs.push({ id: 'spec-1', status: 'DRAFT', specKey: input.specKey, version: input.version, specHash: 'local-synthetic', definition: { analysisKind: input.analysisKind, reportEvidenceCeiling: 'PILOT', metricRules: [{ metricId: 'total', sourceResourceKey: resources[0].resource_key }] } }); data = specs[0]
  }
  else if (/^\/api\/organizations\/reporting-specs\/spec-1\/(review|publish)$/.test(url.pathname)) {
    assert.equal(req.method, 'POST'); const row = specs[0], review = url.pathname.endsWith('/review')
    assert.equal(row.status, review ? 'DRAFT' : 'REVIEWED'); row.status = review ? 'REVIEWED' : 'PUBLISHED'; data = row
  }
  else if (url.pathname === '/api/scales') data = { list: [{ id: 'scale-1', code: 'r3', name: '本地量表', status: 'DEPRECATED', definition, creator: { username: 'local-fixture' }, _count: { assessments: 1 } }, { id: 'original-1', code: 'original', name: '本地原创量表', status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', creator: { username: 'local-fixture' }, _count: { assessments: 0 } }], total: 2 }
  else if (url.pathname === '/api/scales/tags') data = { tags: [] }
  else if (url.pathname === '/api/scales/scale-1/export/preview') data = { completedCount: 1, itemCount: 3, dimensionCount: 0, fields: [{ name: 'score', label: '总分' }] }
  else if (url.pathname === '/api/scales/scale-1/export') {
    const format = JSON.parse(raw).format
    data = { recordCount: 1, fieldCount: 1, artifacts: (format === 'spss' ? ['csv', 'sps'] : [format]).map(extension => ({ id: 'local-' + extension, fileName: 'scale.' + extension, downloadUrl: '/api/local-artifact' })) }
  }
  else if (url.pathname === '/api/scales/scale-1/definition') { definition = JSON.parse(raw).definition; data = { definition } }
  else if (url.pathname === '/api/scales/scale-1') data = { id: 'scale-1', code: 'browser-r3', name: '本地计分定义', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition }
  else if (url.pathname === '/api/cognitive/assignments/source') data = { id: 'source', title: '本地认知任务', status: 'ARCHIVED', listedStandalone: true, config: {} }
  else if (url.pathname.endsWith('/collections')) data = [{ id: 'collection', name: '本地同版本问卷', completedCount: 1 }]
  else if (url.pathname.endsWith('/public-tokens')) data = { list: [] }
  else if (url.pathname === '/api/composite-assessments/collection/export') data = { artifacts: [{ id: 'artifact', fileName: JSON.parse(raw).detail + '.csv', downloadUrl: '/api/local-artifact' }] }
  else if (url.pathname === '/api/local-artifact/status') data = { status: 'READY' }
  else if (url.pathname === '/api/local-artifact') { res.setHeader('Content-Type', 'text/csv'); res.end('score,quality\n10,limited\n'); return }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 0, message: 'ok', data }))
})
;(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  const browser = await chromium.launch({ headless: true })
  const evidence = { status: 'PASS', syntheticData: true, businessApiAccess: false, checks: [] }
  try {
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(base + '/?mode=draft')
    await page.getByRole('button', { name: '选项 3', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '选项 3', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '下一题', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '选项 3', exact: true }).getAttribute('aria-pressed'), 'false')
    await page.getByRole('button', { name: '选项 4', exact: true }).click()
    await page.getByRole('button', { name: '保存并退出', exact: true }).click()
    await page.getByRole('button', { name: '恢复草稿' }).click()
    assert.equal(await page.getByRole('button', { name: '选项 3', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '下一题', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '选项 4', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.reload()
    await page.getByRole('button', { name: '下一题', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '选项 4', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.screenshot({ path: path.join(output, 'draft-restored.png'), fullPage: true })
    evidence.checks.push('Q2 selected answer persists in real IndexedDB through save/exit and page reload; explicit navigation and no selection bleed')
    await page.goto(base + '/?mode=scoring')
    await page.getByRole('button', { name: '计分', exact: true }).click()
    await page.getByRole('button', { name: '+ 总分', exact: true }).click()
    for (const name of ['Q1', 'Q2', 'Q3']) await page.getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name: '保存计分定义' }).click()
    await page.getByText(/已保存，并重新读取确认/).waitFor()
    await page.reload()
    await page.getByRole('button', { name: '计分', exact: true }).click()
    for (const name of ['Q1', 'Q2', 'Q3']) assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
    evidence.checks.push('all three explicitly selected score items survive save, HTTP readback and reload')
    await page.goto(base + '/?mode=scale-export')
    const scaleDownloads = []
    const recordDownload = download => scaleDownloads.push(download)
    page.on('download', recordDownload)
    for (const [label, extensions] of [['CSV', ['csv']], ['SAV (SPSS)', ['sav']], ['CSV + SPS', ['csv', 'sps']]]) {
      await page.getByRole('button', { name: '导出 本地量表 的测评数据', exact: true }).click()
      await page.getByRole('radio', { name: label, exact: true }).check()
      const count = scaleDownloads.length
      await page.getByRole('button', { name: '确认导出', exact: true }).click()
      await page.getByRole('dialog', { name: '导出测评数据' }).waitFor({ state: 'hidden' })
      assert.equal(scaleDownloads.length - count, extensions.length)
      for (const [index, extension] of extensions.entries()) {
        const download = scaleDownloads[count + index]
        assert.equal(download.suggestedFilename(), 'scale.' + extension)
        await download.saveAs(path.join(output, label === 'CSV + SPS' ? 'pair.' + extension : 'scale.' + extension))
      }
    }
    page.off('download', recordDownload)
    evidence.checks.push('actual scale export dialog triggers CSV, SAV and both CSV+SPS browser downloads (synthetic artifact bytes; native formats verified by PostgreSQL integration)')
    await page.goto(base + '/?mode=cognitive')
    await page.getByRole('combobox', { name: '认知数据来源' }).selectOption('collection')
    for (const [label, name] of [['导出摘要', 'summary.csv'], ['导出完整数据', 'full.csv']]) {
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: label, exact: true }).click()
      const download = await pending
      assert.equal(download.suggestedFilename(), name)
      const file = path.join(output, name); await download.saveAs(file)
      assert.match(fs.readFileSync(file, 'utf8'), /10,limited/)
    }
    evidence.checks.push('summary and full downloads emit real browser download events and save nonempty CSV files')
    await page.goto(base + '/?mode=reaction')
    await page.getByRole('button', { name: '开始练习', exact: true }).click()
    for (let index = 0; index < 3; index++) {
      await page.waitForFunction(() => document.querySelector('[aria-label^="practice trial"]')?.className.includes('bg-green-500'))
      await page.waitForTimeout(180)
      await page.keyboard.press('Space')
      await page.getByText('很好！保持专注，等绿色出现再点击。', { exact: true }).waitFor()
      await page.getByRole('button', { name: index === 2 ? '开始正式测评' : '下一个', exact: true }).click()
    }
    evidence.checks.push('actual frame-timed Reaction runner accepts Space in all three practice trials')
    await page.goto(base + '/?mode=content')
    await page.getByRole('combobox', { name: '原创量表', exact: true }).selectOption('original-1')
    await page.getByRole('button', { name: '注册资源草稿', exact: true }).click()
    await page.getByRole('heading', { name: '本地原创量表（个人自评） · 草稿' }).waitFor()
    for (const [action, status] of [['审核', '已审核'], ['发布', '已发布']]) {
      await page.getByRole('button', { name: action, exact: true }).click()
      await page.getByRole('heading', { name: '本地原创量表（个人自评） · ' + status }).waitFor()
    }
    await page.getByRole('combobox', { name: '已发布测量资源', exact: true }).selectOption('resource-1')
    await page.getByLabel('方案名称', { exact: true }).fill('本地两波次描述方案')
    await page.getByRole('button', { name: '创建方案草稿', exact: true }).click()
    await page.getByRole('heading', { name: '本地两波次描述方案 v1 · 草稿' }).waitFor()
    for (const [action, status] of [['审核', '已审核'], ['发布', '已发布']]) {
      await page.getByRole('button', { name: action, exact: true }).click()
      await page.getByRole('heading', { name: '本地两波次描述方案 v1 · ' + status }).waitFor()
    }
    await page.reload()
    await page.getByRole('heading', { name: '本地两波次描述方案 v1 · 已发布' }).waitFor()
    await page.screenshot({ path: path.join(output, 'reporting-content-published.png'), fullPage: true })
    evidence.checks.push('normal management UI registers, reviews and publishes a resource and matching report spec, retaining published state on reload (synthetic HTTP fixture; actual services and scoring verified separately in PostgreSQL)')
    assert.deepEqual(errors, [])
    evidence.pageErrors = errors
    fs.writeFileSync(path.join(output, 'browser-proof.json'), JSON.stringify(evidence, null, 2) + '\n')
    console.log(JSON.stringify(evidence))
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
