/* Production UI, local deterministic API fixtures; writes never reach a backend. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture, sampleCourse } = require('./visual-canonical-browser-e2e.cjs')
const { reportVisualFailure } = require('./visual-failure-diagnostics.cjs')
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const engine = process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'
const output = path.join(process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-visual-qa', `legacy-dialogs-${engine}`)
const questionnaire = { id: 'legacy', name: '弹窗验收问卷', code: 'LEGACY', status: 'DRAFT', type: 'COURSE', visibility: 'COURSE', createdAt: '2026-09-01', tags: [], courseQuestionnaires: [], scaleCount: 0, totalItems: 0, creator: { id: 'admin-visual-user', username: 'admin' }, _count: { assessments: 1 } }
const fulfill = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, message: status === 200 ? 'ok' : '验收模拟失败', data }) })

async function installLegacyFixture(page) {
  const requests = await installApiFixture(page, 'ADMIN')
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (route.request().method() !== 'GET') return route.fallback()
    if (p === '/api/questionnaires' || p === '/api/scales') return fulfill(route, { list: [questionnaire], total: 1 })
    if (p.endsWith('/tags')) return fulfill(route, { tags: [] })
    if (p === '/api/documents' || p === '/api/videos') return fulfill(route, { list: [{ id: 'media', title: '预览验收素材', fileName: 'fixture', fileSize: 128, createdAt: '2026-09-01', teacherId: 'admin-visual-user', usageCount: 0, url: 'about:blank' }], total: 1 })
    if (p === '/api/uploads/images') return fulfill(route, { list: [{ id: 'media', name: '预览验收图片.png', size: 128, createdAt: '2026-09-01', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1kAAAAASUVORK5CYII=' }] })
    if (p === '/api/questionnaires/legacy-item' || p === '/api/general-questionnaires/legacy') return fulfill(route, questionnaire)
    if (p.endsWith('/export/preview')) return fulfill(route, { fields: [], totalRecords: 0, completedRecords: 0 })
    return route.fallback()
  })
  return requests
}

async function assertModal(page, panel, trigger) {
  await panel.waitFor()
  assert.equal(await panel.evaluate(el => el.closest('dialog').matches(':modal')), true)
  await trigger.evaluate(el => el.focus())
  assert.equal(await trigger.evaluate(el => el === document.activeElement), false, 'background focus is isolated')
  for (const key of ['Tab', 'Shift+Tab']) for (let index = 0; index < 12; index++) {
    await page.keyboard.press(key)
    assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true, `${key} remains inside dialog`)
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await browsers[engine].launch({ headless: true })
  const results = []
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await installLegacyFixture(page)
      try {
        for (const [route, open, label, picker, mime, filename] of [
          ['/documents', '上传文档', '上传PDF文档', '选择PDF文件', 'application/pdf', 'draft.pdf'],
          ['/images', '上传图片', '上传图片', '选择图片文件', 'image/png', 'draft.png'],
          ['/videos', '上传视频', '批量上传视频', '添加视频文件', 'video/mp4', 'draft.mp4'],
        ]) {
          await page.goto(base + route)
          const trigger = page.getByRole('button', { name: open, exact: true })
          await trigger.click()
          const panel = page.getByRole('dialog', { name: label, exact: true })
          await assertModal(page, panel, trigger)
          const fileChooser = page.waitForEvent('filechooser')
          await panel.getByRole('button', { name: picker }).focus()
          await page.keyboard.press('Enter')
          await (await fileChooser).setFiles({ name: filename, mimeType: mime, buffer: Buffer.from('local fixture') })
          await page.keyboard.press('Escape')
          const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？' })
          await confirm.getByRole('button', { name: '继续编辑' }).click()
          await panel.waitFor()
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: '放弃修改', exact: true }).click()
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          results.push({ engine, width, scenario: label, passed: true })
        }
        for (const [route, name, label] of [['/documents', '预览', '预览验收素材预览'], ['/images', '预览', '预览验收图片.png预览'], ['/videos', '预览 预览验收素材', '预览验收素材预览']]) {
          await page.goto(base + route)
          const trigger = page.getByRole('button', { name, exact: true })
          await trigger.click()
          const panel = page.getByRole('dialog', { name: label, exact: true })
          await assertModal(page, panel, trigger)
          if (route === '/videos') {
            await panel.focus()
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            assert.equal(await panel.locator('video').evaluate(element => element === document.activeElement), true, 'video controls have a keyboard entry')
          }
          // Embedded PDF documents have their own keyboard event scope.
          await panel.getByRole('button', { name: '关闭', exact: true }).focus()
          await page.keyboard.press('Escape')
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          results.push({ engine, width, scenario: `${route} preview`, passed: true })
        }
        for (const [route, name, label] of [['/questionnaires/legacy', '导出 弹窗验收问卷 的测评数据', '导出问卷数据'], ['/scales', '导出 弹窗验收问卷 的测评数据', '导出测评数据']]) {
          await page.goto(base + route)
          const trigger = page.getByRole('button', { name, exact: true })
          await trigger.click()
          const panel = page.getByRole('dialog', { name: label, exact: true })
          await assertModal(page, panel, trigger)
          await page.keyboard.press('Escape')
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          results.push({ engine, width, scenario: label, passed: true })
        }
        for (const route of ['/questionnaires/legacy-item', '/general-questionnaires/legacy/edit']) {
          await page.goto(base + route)
          await page.getByRole('button', { name: '内容编排', exact: true }).click()
          const trigger = page.getByRole('button', { name: '添加表单题目', exact: true })
          await trigger.click()
          const panel = page.getByRole('dialog', { name: '添加表单题目', exact: true })
          await assertModal(page, panel, trigger)
          await panel.getByLabel(/题目标签/).fill('未保存的题目')
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: '放弃修改', exact: true }).click()
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          results.push({ engine, width, scenario: route, passed: true })
        }
        // Keep a real editor request pending and fail it once. Assert guard
        // behavior at the form handler, including a programmatic second submit.
        let releaseSave
        let markStarted
        const started = new Promise(resolve => { markStarted = resolve })
        let writes = 0
        await page.route('**/api/assignments', async route => {
          if (route.request().method() === 'GET') return route.fallback()
          writes++
          markStarted()
          if (writes === 1) await new Promise(resolve => { releaseSave = resolve })
          return fulfill(route, writes === 1 ? null : { id: 'saved' }, writes === 1 ? 503 : 200)
        })
        await page.goto(base + '/assignments')
        const create = page.getByRole('button', { name: '布置作业', exact: true })
        await create.click()
        const editor = page.getByRole('dialog', { name: '布置作业', exact: true })
        await editor.getByLabel(/选择课程/).selectOption(sampleCourse.id)
        await editor.getByLabel(/作业标题/).fill('失败重试保留草稿')
        await editor.getByRole('button', { name: '创建作业', exact: true }).click()
        await started
        await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-busy="true"]'))
        await editor.dispatchEvent('submit')
        await page.keyboard.press('Escape')
        assert.equal(await editor.count(), 1)
        assert.equal(await editor.getByLabel(/作业标题/).isDisabled(), true)
        await page.waitForFunction(() => document.querySelector('[role="dialog"] [inert]'))
        assert.equal(writes, 1)
        releaseSave()
        await editor.getByRole('alert').waitFor()
        assert.equal(await editor.getByLabel(/作业标题/).inputValue(), '失败重试保留草稿')
        await editor.getByRole('button', { name: '创建作业', exact: true }).click()
        await editor.waitFor({ state: 'detached' })
        assert.equal(writes, 2)
        results.push({ engine, width, scenario: 'assignment pending/failure/retry', passed: true })
        await require('./material-recovery-browser-e2e.cjs').verifyRecovery(page, { base, engine, width, results, output })
        assert.deepEqual(errors, [])
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
        await page.screenshot({ path: path.join(output, `legacy-${width}.png`), fullPage: true })
      } catch (error) {
        reportVisualFailure({ engine, width, url: page.url(), output, script: __filename }, error)
        await page.screenshot({ path: path.join(output, `failure-${width}.png`), fullPage: true })
        throw error
      } finally { await context.close() }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      await installApiFixture(page, 'STUDENT')
      let failed = false
      const queries = []
      await page.route('**/api/courses/my/tasks?*', route => {
        const query = new URL(route.request().url()).searchParams
        queries.push(query.toString())
        const state = query.get('state')
        const list = state ? [] : [{ id: 'task', kind: 'ASSIGNMENT', title: '继续实验记录', courses: [{ id: sampleCourse.id, title: sampleCourse.title }], state: 'IN_PROGRESS', deadline: null, opensAt: null, canContinue: true, canStart: false, href: '/student/assignments/task' }]
        return fulfill(route, failed ? null : { list, total: list.length, page: 1, pageSize: 20, generatedAt: '2026-09-30T00:00:00Z', counts: { PENDING: 0, IN_PROGRESS: 1, UPCOMING: 0, EXPIRED: 0, COMPLETED: 0, UNAVAILABLE: 0 } }, failed ? 503 : 200)
      })
      await page.goto(base + '/student')
      await page.getByRole('link', { name: '继续继续实验记录', exact: true }).waitFor()
      assert.equal(queries.length, 1, 'home uses a single task aggregation request')
      failed = true
      await page.getByLabel('任务状态', { exact: true }).selectOption('COMPLETED')
      await page.getByText('待办加载失败', { exact: true }).waitFor()
      assert.equal(await page.getByText('当前没有此类任务', { exact: true }).count(), 0)
      failed = false
      await page.getByRole('button', { name: '重试待办', exact: true }).click()
      await page.getByText('当前没有此类任务', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      results.push({ engine, width: 390, scenario: 'student aggregate/error/retry', passed: true })
    } finally { await context.close() }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)) }
  console.log(`${engine}: ${results.length} legacy dialog scenarios passed`)
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { installLegacyFixture }
