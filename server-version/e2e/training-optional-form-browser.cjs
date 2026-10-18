const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require('../backend/node_modules/playwright-core')
const { readSessionUser, sessionJsonFetch } = require('./helpers/session-auth.cjs')
assert.equal(process.env.QUESTIONNAIRE_PRODUCT_ISOLATED_DB, '1')
assert.equal(process.env.NODE_ENV, 'test')
const fixture = JSON.parse(fs.readFileSync(process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json', 'utf8'))
const base = 'https://training.eduk12.top:5443'
const output = process.env.TRAINING_OPTIONAL_EVIDENCE || '/tmp/eduk12-training-optional-e2e'
fs.mkdirSync(output, { recursive: true })
const checks = [], screenshots = [], writes = [], errors = [], diagnostics = []
const text = '中文反思，含"引号"\n第二行🙂'
const labels = ['必填反思', '选填填空', '选填单选', '选填多选', '选填年月']
const types = ['text_input', 'fill_blank', 'single_choice', 'multiple_choice', 'year_month']
const ok = r => { assert.equal(r.status, 200); assert.equal(r.body.code, 0); return r.body.data }
const check = name => { checks.push(name); console.log('PASS:', name) }
function worker(work, batchId = '') {
  execFileSync(path.resolve('backend/node_modules/.bin/tsx'), ['e2e/questionnaire-products-fixture.ts'], {
    env: { ...process.env, TRAINING_OPTIONAL_WORK: work, TRAINING_OPTIONAL_BATCH_ID: batchId },
    timeout: 60000, stdio: 'pipe', maxBuffer: 1024 * 1024,
  })
}
async function loginTraining(page, route, user, role) {
  await page.goto(base + route)
  await page.getByPlaceholder('请输入用户名').fill(user.username)
  await page.getByPlaceholder('请输入密码').fill(user.password)
  const response = page.waitForResponse(r => r.request().method() === 'POST'
    && new URL(r.url()).pathname === '/api/auth/training-login')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  assert.equal((await response).status(), 200)
  const session = ok(await readSessionUser(page))
  assert.ok(session.id)
  assert.equal(session.role, role)
  await page.waitForURL(url => url.pathname !== route)
}
async function shots(page, name) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' overflow ' + width)
    const file = name + '-' + width + '.png'
    await page.screenshot({ path: path.join(output, file), fullPage: true })
    screenshots.push({ file, width })
  }
}
// RFC4180 parser preserves quoted newlines, escaped quotes and empty cells.
function parseCsv(source) {
  const rows = []; let row = [], value = '', quoted = false
  source = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') { if (quoted && source[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(value); value = '' }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = '' }
    else value += c
  }
  assert.equal(quoted, false)
  if (row.length || value) { row.push(value); rows.push(row) }
  return rows
}
async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: ['--host-resolver-rules=MAP training.eduk12.top 127.0.0.1', '--no-proxy-server'],
  })
  try {
    const teacher = await (await browser.newContext()).newPage()
    const student = await (await browser.newContext()).newPage()
    for (const page of [teacher, student]) {
      page.setDefaultTimeout(20000)
      page.on('pageerror', error => errors.push(error.message))
    }
    await loginTraining(teacher, '/teacher/account-login', fixture.teacher, 'TEACHER')
    check('Teacher real Training login and session role verified')
    await teacher.goto(base + '/questionnaire-products/new')
    const secure = await teacher.evaluate(() => ({ pathname: location.pathname, secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID }))
    diagnostics.push(secure)
    assert.equal(secure.secureContext, true, 'Training production-origin scenario requires a genuine secure context')
    assert.equal(secure.randomUUID, 'function')
    await teacher.getByLabel('测评名称', { exact: true }).fill('Training选填浏览器验收 ' + Date.now())
    await teacher.getByLabel(fixture.courses[0].title, { exact: true }).check()
    await teacher.getByRole('button', { name: '创建草稿', exact: true }).click()
    await teacher.waitForURL(url => /^\/questionnaire-products\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'))
    let id = new URL(teacher.url()).pathname.split('/').pop()
    for (let i = 0; i < types.length; i++) {
      await teacher.getByLabel('测评类型', { exact: true }).selectOption('FORM')
      await teacher.getByLabel('题目文字', { exact: true }).fill(labels[i])
      await teacher.getByLabel('题型', { exact: true }).selectOption(types[i])
      if (i === 2 || i === 3) await teacher.getByLabel('选项（值=标签，以逗号分隔）', { exact: true }).fill('a=选项甲,b=选项乙')
      await teacher.getByLabel('必填', { exact: true }).setChecked(i === 0)
      const added = teacher.waitForResponse(r => r.url().endsWith('/items') && r.request().method() === 'POST')
      await teacher.getByRole('button', { name: '添加到测评', exact: true }).click()
      assert.equal((await added).status(), 200)
      await teacher.locator('.questionnaire-unit-trigger').nth(i).click()
      await teacher.getByText(labels[i] + ' · ' + (i ? '选填' : '必填'), { exact: true }).waitFor()
    }
    await teacher.locator('.training-form-management').waitFor()
    await shots(teacher, 'teacher-authoring')
    await teacher.getByRole('button', { name: '发布前自检', exact: true }).click()
    await teacher.getByText('当前草稿自检通过', { exact: true }).waitFor()
    const published = teacher.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST')
    await teacher.getByRole('button', { name: '发布组合测评', exact: true }).click()
    assert.equal((await published).status(), 200)
    const definition = ok(await sessionJsonFetch(teacher, '/questionnaire-products/' + id))
    assert.deepEqual(definition.items.map(i => i.required), [true, false, false, false, false])
    check('Teacher UI authoring and authorized publish freeze five required flags')
    // The new path must actually consume a legacy optional source, not merely
    // repeat authoring on a newly created QUESTIONNAIRE.
    worker('copy-source')
    const legacy = JSON.parse(fs.readFileSync(process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json', 'utf8')).legacyCopySource
    await teacher.goto(base + '/questionnaires')
    const sourceCard = teacher.locator('article').filter({ has: teacher.getByRole('heading', { name: legacy.name, exact: true }) })
    await sourceCard.getByRole('button', { name: '复制为新草稿', exact: true }).click()
    await teacher.waitForURL(url => /^\/questionnaire-products\/[^/]+$/.test(url.pathname))
    id = new URL(teacher.url()).pathname.split('/').pop()
    const copiedForm = ok(await sessionJsonFetch(teacher, '/questionnaire-products/' + id))
    assert.notEqual(id, legacy.id)
    assert.equal(copiedForm.status, 'DRAFT')
    assert.deepEqual(copiedForm.items.map(item => item.required), [true, false, false, false, false])
    await teacher.getByRole('button', { name: '发布前自检', exact: true }).click()
    await teacher.getByText('当前草稿自检通过', { exact: true }).waitFor()
    const copiedPublished = teacher.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST')
    await teacher.getByRole('button', { name: '发布组合测评', exact: true }).click()
    assert.equal((await copiedPublished).status(), 200)
    check('Legacy optional Form copied via actual UI to independent draft and republished')

    await loginTraining(student, '/student/login', fixture.student, 'STUDENT')
    student.on('request', request => {
      const pathname = new URL(request.url()).pathname
      if (request.method() === 'POST' && pathname.startsWith('/api/composite-assessments/attempts/')) {
        // Persist only route shape and answer values from this synthetic fixture. No headers/tokens/URL query.
        const body = request.postDataJSON()
        writes.push({ route: pathname.replace(/[a-f0-9-]{32,}/g, ':id'), answers: body?.answers })
      }
    })
    await student.goto(base + '/student/composite/' + id)
    await student.locator('.training-form-surface').waitFor()
    const before = writes.length
    await student.getByRole('button', { name: '提交整个区段', exact: true }).click()
    await student.getByText('还有 1 个必填字段未完成', { exact: true }).waitFor()
    assert.equal(writes.length, before)
    await student.locator('.form-player textarea').fill(text)
    await student.waitForFunction(async expected => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('eduk12-final-drafts-v1')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction('draftAnswers').objectStore('draftAnswers').getAll()
          request.onsuccess = () => resolve(request.result.some(row => row.value === expected))
          request.onerror = () => reject(request.error)
        })
      } finally { db.close() }
    }, text)
    await student.reload()
    await student.locator('.form-player textarea').waitFor()
    assert.equal(await student.locator('.form-player textarea').inputValue(), text)
    assert.equal(writes.length, before, 'Typing/reload must not emit legacy drafts or FINAL')
    await shots(student, 'student-required')
    const accepted = []
    for (let i = 0; i < types.length; i++) {
      await student.locator('.form-player').getByText(labels[i], { exact: false }).first().waitFor()
      if (i) {
        if (i === 1) await student.locator('.form-player textarea').fill('将清空的草稿')
        if (i === 2) await student.locator('.form-player input[type="radio"]').first().check()
        if (i === 3) await student.locator('.form-player input[type="checkbox"]').first().check()
        if (i === 4) await student.locator('.form-player input[type="month"]').fill('2026-10')
        const clear = student.getByRole('button', { name: '清空本题（不作答）', exact: true })
        await clear.click()
        if (i === 2) await shots(student, 'student-optional-cleared')
      }
      assert.equal(writes.length, i, 'Only previous section FINALs may have written')
      const final = student.waitForResponse(r => /\/form-sections\/[^/]+\/submit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
      await student.getByRole('button', { name: '提交整个区段', exact: true }).click()
      const response = await final
      assert.equal(response.status(), 200)
      accepted.push(response.request().postDataJSON())
    }
    assert.equal(writes.length, 5)
    assert.equal(accepted[0].answers[0].value, text)
    assert.deepEqual(accepted.slice(1).map(p => p.answers[0].value), [null, null, null, null])
    check('IndexedDB draft survives reload; five FINALs only; explicit nulls after clear')
    worker('reports')
    await student.reload()
    const reportButton = student.getByRole('button', { name: '查看个人报告', exact: true })
    if (await reportButton.isVisible()) await reportButton.click()
    await student.getByText('未作答', { exact: true }).first().waitFor()
    assert.equal(await student.getByText('未作答', { exact: true }).count(), 4)
    await shots(student, 'student-report')
    await teacher.goto(base + '/composite-assessments/' + id + '/results')
    await teacher.getByRole('button', { name: '查看', exact: true }).click()
    await teacher.getByText('未作答', { exact: true }).first().waitFor()
    assert.equal(await teacher.getByText('未作答', { exact: true }).count(), 4)
    await shots(teacher, 'teacher-report')
    check('Both actual authenticated report pages retain four missing values')
    // The questionnaire page exposes JSON, not a CSV button. Exercise the existing
    // CSV API with the same teacher browser cookie/CSRF, and parse the real bytes.
    const batch = ok(await sessionJsonFetch(teacher, '/composite-assessments/' + id + '/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'csv', detail: 'full', anonymize: true }),
    }))
    worker('export', batch.batchId)
    const downloadUrl = batch.artifacts[0].downloadUrl
    const csv = await teacher.evaluate(async url => {
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) throw Error('CSV download HTTP ' + response.status)
      return response.text()
    }, downloadUrl)
    const rows = parseCsv(csv)
    assert.equal(rows.length, 2)
    const indexes = labels.map((_, i) => rows[0].indexOf('F' + String(i + 1).padStart(3, '0') + '_value'))
    assert.ok(indexes.every((value, i) => value >= 0 && (!i || value > indexes[i - 1])), 'Five Form columns remain ordered')
    assert.equal(rows[1][indexes[0]], text)
    assert.deepEqual(indexes.slice(1).map(index => rows[1][index]), ['', '', '', ''])
    assert.equal(csv.includes('将清空的草稿'), false)
    const denied = await student.evaluate(async url => (await fetch(url, { credentials: 'same-origin' })).status, downloadUrl)
    assert.equal(denied, 403)
    check('Actual CSV preserves Chinese quotes/newline, ordered empty columns and teacher-only access')
    const originalScale = ok(await sessionJsonFetch(teacher, '/scales/' + fixture.scaleId))
    assert.equal(originalScale.copyEligibility.allowed, true)
    await teacher.goto(base + '/scales/' + fixture.scaleId)
    await teacher.getByText('已发布 · 只读', { exact: true }).waitFor()
    await shots(teacher, 'scale-original-readonly')
    await teacher.getByRole('button', { name: '复制为新草稿', exact: true }).click()
    await teacher.waitForURL(url => url.pathname.startsWith('/scales/') && !url.pathname.endsWith(fixture.scaleId))
    const scaleCopyId = new URL(teacher.url()).pathname.split('/').pop()
    await teacher.getByRole('complementary', { name: '量表副本来源', exact: true }).waitFor()
    const copyName = 'Training复制量表浏览器验收'
    await teacher.getByLabel('量表名称', { exact: true }).fill(copyName)
    await teacher.getByLabel('可见性', { exact: true }).selectOption('COURSE')
    await teacher.getByRole('button', { name: '保存草稿', exact: true }).click()
    await teacher.getByText('草稿内容已保存', { exact: true }).waitFor()
    await shots(teacher, 'scale-copy-draft')
    const scalePublished = teacher.waitForResponse(r => new URL(r.url()).pathname === '/api/scales/' + scaleCopyId + '/publish' && r.request().method() === 'POST')
    await teacher.getByRole('button', { name: '发布描述性量表', exact: true }).click()
    assert.equal((await scalePublished).status(), 200)
    await teacher.getByText('已发布 · 只读', { exact: true }).waitFor()
    const copiedScale = ok(await sessionJsonFetch(teacher, '/scales/' + scaleCopyId))
    assert.equal(copiedScale.name, copyName)
    assert.equal(copiedScale.copySource.parentId, fixture.scaleId)
    const sourceAfter = ok(await sessionJsonFetch(teacher, '/scales/' + fixture.scaleId))
    assert.equal(sourceAfter.definitionHash, originalScale.definitionHash)
    assert.deepEqual(sourceAfter.definition, originalScale.definition)
    ok(await sessionJsonFetch(teacher, '/scales/' + scaleCopyId + '/courses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseIds: [fixture.courses[0].id] }),
    }))
    await shots(teacher, 'scale-copy-published')
    const scaleStarted = student.waitForResponse(r => new URL(r.url()).pathname === '/api/scales/' + scaleCopyId + '/assessments' && r.request().method() === 'POST')
    await student.goto(base + '/student/scales/' + scaleCopyId)
    assert.equal((await scaleStarted).status(), 200)
    await student.getByRole('radio', { name: '是', exact: true }).check()
    const scaleFinal = student.waitForResponse(r => /\/api\/scales\/assessments\/[^/]+\/submit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
    await student.getByRole('button', { name: '完成测评', exact: true }).click()
    assert.equal((await scaleFinal).status(), 200)
    await student.waitForURL(url => url.pathname.startsWith('/student/scales/result/'))
    await student.getByRole('heading', { name: copyName, exact: true }).waitFor()
    await shots(student, 'scale-copy-report')
    check('Scale UI copy/edit/publish preserves source; authorized course student completes actual FINAL and report')

    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', head: process.env.GITHUB_SHA, checks, screenshots, writes, csvBytes: Buffer.byteLength(csv), errors }, null, 2))
  } finally { await browser.close() }
}
main().catch(error => {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'FAIL', head: process.env.GITHUB_SHA, checks, screenshots, errors, diagnostics, error: error.message }, null, 2))
  console.error(error.message); process.exitCode = 1
})
