/* File-input and multipart frontend acceptance. The same sample workbook is
 * parsed and governed through real PostgreSQL by the SJT authoring suite. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture } = require('./visual-canonical-browser-e2e.cjs')
const template = require('../backend/src/modules/situational/authoring/examples/teacher-demonstration.json')
const workbookPath = path.join(__dirname, '../backend/assets/sjt-upload-example-v1.xlsx')
const workbook = fs.readFileSync(workbookPath)
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-r5-sjt'
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const engine = process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'
  const browser = await browsers[engine].launch({ headless: true })
  const cases = []
  try { for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(), errors = [], uploads = []
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    await installApiFixture(page, 'TEACHER')
    let saved = false
    const draft = { id: 'synthetic-sjt-upload', ownerId: 'teacher-visual-user', revision: 1, status: 'DRAFT', contentDigest: 'a'.repeat(64), template }
    // Browser interception omits binary file parts on some engines. Receive the
    // multipart stream over real loopback HTTP instead of reconstructing it.
    const server = http.createServer(async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', base)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token')
      response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
      let data, status = 200, issues
      try {
        assert.ok(['/api/situational/authoring/validate', '/api/situational/authoring/drafts'].includes(request.url), 'upload must not publish or approve content')
        assert.equal(request.method, 'POST')
        assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/)
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = Buffer.concat(chunks)
        if (body.includes(Buffer.from('invalid.xlsx'))) {
          status = 422; issues = [{ path: '基本信息!B2', code: 'CELL', message: '无法读取有效模板，请使用下载的 Excel 模板' }]
        } else {
          assert.ok(body.includes(workbook), 'the actual selected workbook bytes reach multipart upload')
          uploads.push(request.url)
          if (request.url.endsWith('/drafts')) { saved = true; data = draft }
          else data = { template, logicalNodes: template.nodes.length, questionCount: template.questions.length }
        }
      } catch (error) { errors.push(error.message); status = 500 }
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ code: status === 200 ? 0 : -1, message: status === 200 ? 'ok' : '模板检查未通过', issues, data }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const uploadBase = `http://127.0.0.1:${server.address().port}`
    await page.route('**/api/situational/authoring/**', async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname
      if (request.method() !== 'GET') return route.continue({ url: uploadBase + endpoint })
      const data = endpoint.endsWith('/drafts') ? saved ? [draft] : [] : draft
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data }) })
    })
    try {
      await page.goto(base + '/sjt-authoring')
      await page.getByText('尚无题包草稿', { exact: true }).waitFor()
      const file = page.getByLabel('选择 SJT 模板', { exact: true })
      await file.setInputFiles({ name: 'invalid.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('invalid synthetic workbook') })
      await page.getByRole('button', { name: '检查模板', exact: true }).click()
      await page.getByRole('alert').waitFor()
      await page.getByText(/基本信息!B2/).waitFor()
      assert.equal(saved, false)
      await file.setInputFiles(workbookPath)
      await page.getByRole('button', { name: '检查模板', exact: true }).click()
      await page.getByText(/检查通过：/).waitFor()
      await page.getByRole('button', { name: '保存新草稿', exact: true }).click()
      await page.getByRole('button', { name: `打开题包 ${template.instrumentKey} ${template.instrumentVersion}`, exact: true }).waitFor()
      await page.getByText('已保存草稿，可预览后提交审核。', { exact: true }).waitFor()
      assert.deepEqual(uploads, ['/api/situational/authoring/validate', '/api/situational/authoring/drafts'])
      assert.equal(await page.getByRole('button', { name: '审核通过并发布', exact: true }).count(), 0)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(output, `${engine}-${width}-sjt-upload.png`), fullPage: true })
      cases.push({ engine, width, actualWorkbookUploaded: true, invalidFileFeedback: true, savedDraftOnly: true })
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${engine}-${width}-sjt-failure.png`), fullPage: true })
      console.error(JSON.stringify({ errors, page: await page.locator('body').innerText() })); throw error
    } finally { await context.close(); await new Promise(resolve => server.close(resolve)) }
  }} finally { await browser.close() }
  fs.writeFileSync(path.join(output, `${engine}-sjt-upload.json`), JSON.stringify(cases, null, 2))
  console.log(JSON.stringify({ status: 'passed', engine, viewports: cases.length, api: 'deterministic fixture; real PostgreSQL governance verified separately' }))
})().catch(error => { console.error(error); process.exitCode = 1 })
