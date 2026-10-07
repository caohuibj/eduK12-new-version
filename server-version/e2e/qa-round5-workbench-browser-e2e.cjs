/* Real layout/action validation with synthetic API fixtures; authority and
 * persistence are tested separately against isolated PostgreSQL. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture, sampleCourse } = require('./visual-canonical-browser-e2e.cjs')
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-r5-workbench'

const fields = [0, 1].map(index => ({ id: 'field-' + index, type: 'FORM', formType: 'text_input', formLabel: '合成字段 ' + index, required: true, position: index, formSectionId: 'section-' + index }))
const detail = { id: 'workbench-fixture', name: '合成组合编制', status: 'DRAFT', revision: 1, questionnaireType: 'COURSE', questionnaireCourses: [{ courseId: sampleCourse.id }], publicEnabled: false, instruction: '', description: '', opensAt: null, expiresAt: null, items: fields, formSections: fields.map((field, index) => ({ id: field.formSectionId, title: '合成区段 ' + index, position: index, contextSection: false, items: [field] })) }

async function run(browser, engine, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Tokyo' })
  const page = await context.newPage(), errors = [], commands = []
  page.on('pageerror', error => errors.push(error.message))
  await installApiFixture(page, 'TEACHER')
  await page.route('**/api/questionnaire-products**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    let data
    if (request.method() === 'POST') {
      commands.push({ pathname, body: request.postDataJSON() })
      if (pathname.endsWith('/preflight')) data = { revision: 1, ok: false, checks: [{ key: 'content', label: '内容检查', status: 'failed', message: '合成定位提示', targetId: 'section-0' }] }
      else if (pathname.endsWith('/instantiate')) data = { id: detail.id }
      else return route.fulfill({ status: 405, json: { code: -1, message: 'Unexpected synthetic command' } })
    } else if (pathname.endsWith('/resources')) data = { courses: [sampleCourse], scales: [], cognitive: [], situational: [] }
    else if (pathname.endsWith('/templates')) data = { list: [{ id: 'private-template', name: '我的私有组合模板' }], total: 1 }
    else if (pathname.includes('/workspace/courses/')) data = {
      course: sampleCourse, list: [{ id: detail.id, name: detail.name, status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', attempts: { COMPLETED: 2, IN_PROGRESS: 1 } }], total: 1, page: 1, pageSize: 20, countMeaning: '合成作答次数，不作为人数或心理指标。',
      quality: [{ id: 'session', participant: '合成参与者', title: '合成认知任务', status: 'COMPLETED', qualityState: 'limited', finishedAt: '2026-10-07T00:00:00Z', reportHref: '/composite-assessments/workbench-fixture/attempts/attempt/report?partial=1' }], qualityHasMore: false,
    }
    else data = detail
    return route.fulfill({ status: 200, json: { code: 0, message: 'ok', data } })
  })
  async function screenshot(name) {
    await page.screenshot({ path: path.join(output, `${engine}-${width}-${name}.png`), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal page overflow`)
  }
  try {
    await page.goto(base + '/questionnaire-products/' + detail.id)
    await page.getByText('合成字段 0', { exact: true }).waitFor()
    await page.getByRole('button', { name: '配置第 2 项', exact: true }).click()
    await page.getByText('合成字段 1', { exact: true }).waitFor()
    assert.equal(await page.getByText('合成字段 0', { exact: true }).count(), 0, 'single configuration panel')
    if (width >= 1024) assert.match(await page.locator('.questionnaire-editor-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns), /^240px /)
    await page.getByRole('button', { name: '发布前自检', exact: true }).click()
    await page.getByRole('button', { name: '配置对应单元', exact: true }).click()
    await page.getByText('合成字段 0', { exact: true }).waitFor()
    await screenshot('editor')
    await page.goto(base + '/assessment-workbench?courseId=' + sampleCourse.id)
    await page.getByText('合成参与者 · 合成认知任务').waitFor()
    await page.getByText(/已完成 · 质量受限 ·/).waitFor()
    assert.match(await page.getByRole('link', { name: '按权限查看单项结果' }).getAttribute('href'), /^\/composite-assessments\//)
    await screenshot('overview')
    await page.goto(base + '/assessment-templates')
    await page.getByText('我的私有组合模板', { exact: true }).waitFor()
    await page.getByRole('heading', { name: '固定测评包 · 整体报告' }).waitFor()
    await screenshot('templates')
    await page.getByRole('button', { name: '复制为新草稿', exact: true }).click()
    await page.getByRole('heading', { name: '编制组合测评', exact: true }).waitFor()
    assert.equal(commands.length, 2)
    assert.match(commands[1].body.requestId, /^[a-f0-9-]{36}$/)
    assert.deepEqual(Object.keys(commands[1].body), ['requestId'])
    assert.deepEqual(errors, [])
    await reviewBoundaries(browser, engine, width)
    return { engine, width, passed: true, pages: ['editor', 'overview', 'templates', 'hold-review', 'participant-deferred-feedback'] }
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${engine}-${width}-failure.png`), fullPage: true })
    console.error(JSON.stringify({ url: page.url(), pageErrors: errors, body: (await page.locator('body').innerText()).slice(-6000) }))
    throw error
  } finally { await context.close() }
}

async function reviewBoundaries(browser, engine, width) {
  const options = { viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Tokyo' }
  const adminContext = await browser.newContext(options), adminPage = await adminContext.newPage()
  const errors = [], approvals = []
  adminPage.on('pageerror', error => errors.push(error.message))
  let record = { id: 'held', bundleKey: 'synthetic-held', bundleVersion: '1.0.0', status: 'HOLD', installedBy: 'another-admin', contentHash: 'a'.repeat(64), content: { schemaVersion: 1 } }
  const preview = { contentHash: record.contentHash, blockers: [], requiredClaims: ['independent_summary'], definition: { name: '合成暂停版本', bundleVersion: '1.0.0', slots: [] }, scenarios: [], report: {}, scientific: {} }
  await installApiFixture(adminPage, 'ADMIN')
  await adminPage.route('**/api/bundle-products/admin/**', async route => {
    const req = route.request(), pathname = new URL(req.url()).pathname
    let data
    if (req.method() === 'POST' && pathname.endsWith('/approve')) {
      approvals.push(req.postDataJSON())
      record = { ...record, status: 'PUBLISHED' }; data = record
    } else if (req.method() === 'POST' && pathname.endsWith('/preview')) data = preview
    else if (req.method() === 'GET') data = pathname.endsWith('/definitions') ? [record] : record
    else return route.fulfill({ status: 405, json: { code: -1, message: 'Unexpected synthetic command' } })
    return route.fulfill({ status: 200, json: { code: 0, message: 'ok', data } })
  })
  async function shot(page, name) {
    await page.screenshot({ path: path.join(output, `${engine}-${width}-${name}.png`), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, name + ': no horizontal overflow')
  }
  try {
    await adminPage.goto(base + '/admin/bundle-authoring')
    await adminPage.getByRole('button', { name: '查看定义与审批' }).click()
    const restore = adminPage.getByRole('button', { name: '重新审核并恢复发布', exact: true })
    await restore.waitFor(); assert.equal(await restore.isDisabled(), true)
    const checks = adminPage.getByRole('checkbox')
    assert.equal(await checks.count(), 4)
    for (let index = 0; index < 4; index++) {
      await checks.nth(index).check()
      assert.equal(await restore.isDisabled(), index < 3)
    }
    assert.equal(approvals.length, 0)
    await shot(adminPage, 'hold-review')
    await restore.click()
    await adminPage.getByRole('dialog', { name: '重新审核并恢复固定包发布' }).waitFor()
    assert.equal(approvals.length, 0)
    await adminPage.getByRole('button', { name: '重新审核并恢复', exact: true }).click()
    await adminPage.getByRole('button', { name: '独立续审并发布' }).waitFor()
    assert.equal(approvals.length, 1)
    assert.deepEqual(approvals[0], { contentHash: record.contentHash, scientific: true, rights: true, language: true, report: true, claims: ['independent_summary'] })
  } finally { await adminContext.close() }
  const studentContext = await browser.newContext(options), page = await studentContext.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await installApiFixture(page, 'STUDENT')
  await page.route('**/api/cognitive/sessions/session-reviewed', route => route.fulfill({ status: 200, json: { code: 0, message: 'ok', data: { sessionId: 'session-reviewed', status: 'COMPLETED', feedbackDeferred: true } } }))
  await page.route('**/api/situational/attempts/sjt-reviewed/**', route => route.fulfill({ status: 200, json: { code: 0, message: 'ok', data: { feedbackDeferred: true, attempt: { id: 'sjt-reviewed', status: 'COMPLETED', instrumentKey: 'fixture' } } } }))
  await page.route('**/api/composite-assessments/attempts/parent-reviewed/report**', route => {
    assert.equal(new URL(route.request().url()).searchParams.has('partial'), false)
    return route.fulfill({ status: 400, json: { code: -1, message: '综合测评尚未完成', data: null } })
  })
  try {
    await page.goto(base + '/student/cognitive/sessions/session-reviewed/result')
    await page.getByText('单项已提交，反馈暂未开放', { exact: true }).waitFor()
    await shot(page, 'deferred-cognitive')
    await page.goto(base + '/student/situational/attempts/sjt-reviewed/result')
    await page.getByText('单项已提交，反馈暂未开放', { exact: true }).waitFor()
    await shot(page, 'deferred-situational')
    await page.goto(base + '/student/composite/attempts/parent-reviewed/report?partial=1')
    await page.getByText('综合测评尚未完成', { exact: true }).waitFor()
    await shot(page, 'deferred-composition')
    assert.deepEqual(errors, [])
  } finally { await studentContext.close() }
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const engine = process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'
  const browser = await browsers[engine].launch({ headless: true })
  const results = []
  try { for (const width of [375, 768, 1280, 1920]) results.push(await run(browser, engine, width)) }
  finally { await browser.close() }
  fs.writeFileSync(path.join(output, engine + '.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ engine, passed: true, viewports: results.length }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
