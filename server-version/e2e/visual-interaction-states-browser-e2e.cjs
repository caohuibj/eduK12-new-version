/* State and keyboard regression coverage. All API responses are local fixtures. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture, sampleCourse } = require('./visual-canonical-browser-e2e.cjs')
const { reportVisualFailure } = require('./visual-failure-diagnostics.cjs')
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const output = path.join(process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-visual-qa', 'interaction-states')
const widths = [360, 390, 768, 1440]
const longTitle = '面向学生与教师的学习反思及成长观察量表 · Long English Instrument Title for Responsive Reading'
const selectedFile = { name: '非常长的文件名-LongFilenameWithoutSpacesToStressWrapping'.repeat(3) + '.mp4', mimeType: 'video/mp4', buffer: Buffer.from('visual fixture') }
const entry = {
  identity: { instrumentKey: 'visual', instrumentVersion: '1.0.0', canonicalName: longTitle, abbreviation: 'VISUAL' },
  construct: { primaryDomain: 'SELF_REGULATION', constructDefinition: '了解学习计划、坚持与自我监控的日常表现。'.repeat(4), constructLevel: 'SPECIFIC_CONSTRUCT' },
  applicability: { minAge: 9, maxAge: 18, gradeRange: { minGrade: 3, maxGrade: 12 }, respondentTypes: ['SELF', 'PARENT', 'TEACHER'], developmentalEvidence: 'PARTIAL' },
  administration: { itemCount: 24, estimatedMinutes: 12, timeFrame: '过去两周', administrationModes: ['DIGITAL_SELF_ADMINISTERED'], requiredTraining: false },
  intendedUse: { intendedUses: [{ use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'SUPPORTED' }], forbiddenUses: ['DIAGNOSIS'] },
  localization: { targetLocale: 'zh-CN', sourceLocale: 'zh-CN', localizationVersion: '1.0.0', adaptationMethod: 'ORIGINAL_SOURCE', reviewStatus: 'APPROVED' },
  availability: { status: 'RESTRICTED', reasons: ['当前仅供浏览，授权与报告审核完成后才能开始。'] },
  source: { citation: 'Deterministic visual fixture' },
  rights: { status: 'NOT_GRANTED', commercialNature: 'NON_COMMERCIAL', locales: ['zh-CN'], territories: ['CN'] },
  references: { displayText: '仅提供描述性分数，无临床界值。', packageReferenceCount: 0, applicabilityCount: 0 },
  report: { maxEligibleLevel: null, scoreCount: 3, dimensionLabels: ['学习计划', '坚持', '自我监控'], limitations: ['不用于临床诊断，不替代专业评估。'], disclaimer: '仅供教育与研究使用。' },
  evidence: { recordCount: 0, coverageText: '尚无本地验证证据。' },
}
const fulfill = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, message: status === 200 ? 'ok' : '暂时无法加载，请重试', data }) })

async function capture(page, name, width) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(metrics.scroll <= width + 1, `${name}/${width}: page overflow ${metrics.scroll}`)
  await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true })
}

async function assertModal(page, dialog, background) {
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'initial focus is in modal')
  assert.equal(await dialog.evaluate(el => el.closest('dialog').matches(':modal')), true, 'native top layer is active')
  assert.equal(await dialog.evaluate(el => el.closest('dialog').getBoundingClientRect().top), 0, 'backdrop covers the viewport from the top')
  await background.evaluate(el => el.focus())
  assert.equal(await background.evaluate(el => el === document.activeElement), false, 'background programmatic focus is blocked')
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press(key)
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, `${key} remains in modal`)
    }
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await browsers[process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'].launch({ headless: true, channel: process.env.VISUAL_QA_BROWSER_CHANNEL || undefined })
  const results = []
  async function scenario(width, role, run) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1024 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    // Keep WebKit requestAnimationFrame actionability checks on an active page.
    await page.bringToFront()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = await installApiFixture(page, role)
    try {
      await run(page)
      assert.deepEqual(errors, [])
      assert.equal(requests.some(request => request.method !== 'GET'), false, 'no business writes')
    } catch (error) {
      reportVisualFailure({ engine: process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium', width, url: page.url(), output, script: __filename }, error)
      await page.screenshot({ path: path.join(output, `failure-${width}.png`), fullPage: true })
      console.error((await page.locator('body').innerText()).slice(-2500))
      throw error
    } finally { await context.close() }
  }
  try {
    for (const width of widths) {
      await scenario(width, 'ADMIN', async page => {
        let failed = true
        const teacher = { id: 'grant-teacher', username: 'teacher', nickname: '示例教师', role: 'TEACHER', teacherApproved: true, isActive: true, isFrozen: false }
        await page.route('**/api/scales?*', route => fulfill(route, { list: [{ id: 'grant-scale', code: 'GRANT', name: '授权保护示例', status: 'PUBLISHED', tags: [], createdAt: '2026-09-01', creator: { id: 'admin-visual-user', username: 'admin' }, _count: {} }], total: 1 }))
        await page.route('**/api/scales/tags', route => fulfill(route, { tags: [] }))
        await page.route('**/api/users?role=TEACHER*', route => fulfill(route, { list: [teacher], total: 1 }))
        await page.route('**/api/admin/material-grants?*', route => fulfill(route, { list: [{ teacherId: teacher.id }] }, failed ? 503 : 200))
        await page.goto(base + '/scales')
        const trigger = page.getByRole('button', { name: '将 授权保护示例 授权给教师' })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: '授权给教师' })
        await dialog.getByRole('alert').waitFor()
        assert.equal(await dialog.getByRole('button', { name: '保存', exact: true }).isDisabled(), true)
        assert.equal(await dialog.getByRole('checkbox').count(), 0)
        await assertModal(page, dialog, trigger)
        await capture(page, 'grant-read-error', width)
        failed = false
        await dialog.getByRole('button', { name: '重新加载' }).click()
        await dialog.getByLabel('示例教师（teacher）').waitFor()
        assert.equal(await dialog.getByLabel('示例教师（teacher）').isChecked(), true)
        assert.equal(await dialog.getByRole('button', { name: '保存', exact: true }).isEnabled(), true)
        await capture(page, 'grant-retry-success', width)
        await page.keyboard.press('Escape')
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
      })
      for (const kind of ['assignments', 'checkins', 'courses']) {
        await scenario(width, kind === 'courses' ? 'ADMIN' : 'TEACHER', async page => {
          const record = { id: 'modal-record', title: '弹窗回归示例', content: '', description: '', courseId: sampleCourse.id, course: sampleCourse, questions: [], videos: [], images: [], documents: [], tags: [], createdAt: '2026-09-01', endTime: '2026-12-31', _count: { submissions: 1 } }
          const submission = { id: 'submission-1', status: 'SUBMITTED', content: '学习反思', answers: [], images: [], createdAt: '2026-09-01', student: { id: 'student-1', username: 'student', nickname: '示例学生' } }
          await page.route(`**/api/${kind}`, route => fulfill(route, { list: kind === 'courses' ? [{ ...sampleCourse, creatorId: 'admin-visual-user' }] : [record], total: 1 }))
          await page.route(`**/api/${kind}/modal-record/submissions`, route => fulfill(route, { list: [submission] }))
          await page.route('**/api/assignments/tags', route => fulfill(route, { tags: [] }))
          await page.route('**/api/checkins/tags', route => fulfill(route, { tags: [] }))
          await page.goto(base + '/' + kind)
          const createName = kind === 'assignments' ? '布置作业' : kind === 'checkins' ? '创建打卡' : '创建课程'
          const trigger = page.getByRole('button', { name: createName, exact: true }).first()
          await trigger.click()
          const editor = page.getByRole('dialog')
          await assertModal(page, editor, trigger)
          const bodyWidth = await editor.locator('.staff-dialog__body').evaluate(element => ({ available: element.clientWidth, content: element.scrollWidth }))
          assert.ok(bodyWidth.content <= bodyWidth.available + 1, `${kind}/${width}: editor contents overflow horizontally`)
          await capture(page, `${kind}-editor-modal`, width)
          assert.equal(await editor.locator('button[type=submit]').count(), 1, 'native form submit remains available')
          if (kind !== 'courses') {
            const mediaTrigger = editor.getByRole('button', { name: '添加文档', exact: true })
            await mediaTrigger.click()
            const media = page.getByRole('dialog', { name: '选择文档' })
            await assertModal(page, media, mediaTrigger)
            assert.equal(await page.locator('dialog:modal').count(), 2)
            await page.keyboard.press('Escape')
            assert.equal(await page.locator('dialog:modal').count(), 1, 'Escape closes only the top dialog')
            assert.equal(await mediaTrigger.evaluate(el => el === document.activeElement), true)
            assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
          }
          await page.keyboard.press('Escape')
          assert.equal(await page.locator('dialog:modal').count(), 0)
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
          if (kind === 'courses') {
            await page.getByLabel(`${sampleCourse.title} 的更多操作`, { exact: true }).click()
            await page.getByRole('button', { name: '分享课程', exact: true }).click()
            const share = page.getByRole('dialog', { name: '分享课程' })
            await assertModal(page, share, trigger)
            await capture(page, 'courses-share-modal', width)
            await page.keyboard.press('Escape')
          } else {
            const submissionsTrigger = page.getByRole('button', { name: '查看提交', exact: true })
            await submissionsTrigger.click()
            const submissions = page.getByRole('dialog')
            await submissions.getByText('示例学生', { exact: true }).waitFor()
            await assertModal(page, submissions, trigger)
            await capture(page, `${kind}-submissions-modal`, width)
            if (kind === 'assignments') {
              const batchTrigger = submissions.getByRole('button', { name: '一键批量批复', exact: true })
              await batchTrigger.click()
              const batch = page.getByRole('dialog', { name: '一键批量批复' })
              await assertModal(page, batch, batchTrigger)
              await capture(page, 'assignments-batch-modal', width)
              await page.keyboard.press('Escape')
              assert.equal(await page.locator('dialog:modal').count(), 1)
              assert.equal(await batchTrigger.evaluate(el => el === document.activeElement), true)
            }
            await page.keyboard.press('Escape')
            assert.equal(await submissionsTrigger.evaluate(el => el === document.activeElement), true)
          }
          assert.equal(await page.locator('dialog:modal').count(), 0)
          assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
        })
      }
      for (const state of ['loading', 'populated', 'empty', 'filtered-empty', 'error', 'detail']) {
        await scenario(width, 'STUDENT', async page => {
          let release
          const wait = new Promise(resolve => { release = resolve })
          await page.route('**/api/scale-library**', async route => {
            if (state === 'loading') await wait
            return fulfill(route, state === 'detail' ? { entry } : { schemaVersion: 1, entries: state === 'populated' ? [entry] : [] }, state === 'error' ? 503 : 200)
          })
          await page.goto(base + (state === 'detail' ? '/scale-library/visual/1.0.0' : '/scale-library'))
          const ready = state === 'loading' ? '量表库加载中...' : state === 'error' ? '暂时无法加载，请重试' : state === 'detail' ? longTitle : '量表库'
          if (state === 'error') await page.getByRole('alert').waitFor()
          else if (state === 'loading') await page.getByText(ready, { exact: true }).waitFor()
          else await page.getByRole('heading', { name: state === 'detail' ? longTitle : '量表库', exact: true }).waitFor()
          if (state === 'populated') await page.getByRole('heading', { name: longTitle, exact: true }).waitFor()
          if (state === 'empty') await page.getByText('没有符合条件的量表').waitFor()
          if (state === 'filtered-empty') {
            await page.getByPlaceholder('名称、缩写或构念').fill('不存在的量表')
            await page.getByRole('button', { name: '应用筛选' }).click()
            await page.getByText('没有符合条件的量表').waitFor()
          }
          assert.equal(await page.locator('.hui-scale-library').count(), 1)
          assert.equal(await page.locator('.hui-scale-library').evaluate(el => getComputedStyle(el).maxWidth), '1216px')
          await capture(page, `scale-${state}`, width)
          release()
        })
      }
      await scenario(width, 'STUDENT', async page => {
        await page.route('**/api/scale-library**', route => fulfill(route, { schemaVersion: 1, entries: new URL(route.request().url()).searchParams.get('keyword') ? [] : [entry] }))
        await page.goto(base + '/scale-library')
        await page.getByRole('heading', { name: longTitle, exact: true }).waitFor()
        assert.equal(await page.getByLabel('年龄下界', { exact: true }).isVisible(), false, 'advanced fields are initially collapsed')
        const more = page.getByText('更多筛选', { exact: true })
        await more.press('Enter')
        await page.getByLabel('年龄下界', { exact: true }).fill('10')
        await capture(page, 'scale-more-filters', width)
        await page.getByLabel('关键词', { exact: true }).fill('未找到')
        await page.getByRole('button', { name: '应用筛选', exact: true }).click()
        await page.getByText('当前显示 0 个量表').waitFor()
        assert.equal(await page.getByLabel('年龄下界', { exact: true }).isVisible(), true, 'filter disclosure survives a request')
        assert.equal(await page.getByRole('button', { name: '移除年龄下界：10' }).isVisible(), true)
        await capture(page, 'scale-applied-filters', width)
        await page.getByRole('button', { name: '清除筛选并浏览全部' }).click()
        await page.getByRole('heading', { name: longTitle, exact: true }).waitFor()
        assert.equal(await page.getByLabel('已应用筛选').count(), 0)
        await page.getByText('版本与证据', { exact: true }).press('Enter')
        await capture(page, 'scale-card-evidence', width)
      })
      for (const state of ['loading', 'populated', 'empty', 'filtered-empty', 'error']) {
        await scenario(width, 'TEACHER', async page => {
          let release
          const wait = new Promise(resolve => { release = resolve })
          let failed = state === 'error'
          await page.route('**/api/assignments/tags', route => fulfill(route, { tags: [] }))
          await page.route('**/api/assignments', async route => {
            if (state === 'loading') await wait
            return fulfill(route, { list: ['populated', 'filtered-empty'].includes(state) ? [{ id: 'visual-list', title: longTitle, course: { title: '跨学科学习与成长观察课程 · Long Course Name' }, deadline: '2099-10-01T10:00:00Z', tags: ['学习反思', '成长观察'], questions: [], _count: { submissions: 13 } }] : [] }, failed ? 503 : 200)
          })
          await page.goto(base + '/assignments?id=visual-list')
          if (state === 'loading') await page.getByText('正在加载作业', { exact: true }).waitFor()
          else if (failed) await page.getByText('作业列表加载失败', { exact: true }).waitFor()
          else if (state === 'empty') await page.getByText('暂无匹配作业', { exact: true }).waitFor()
          else {
            await page.getByRole('button', { name: longTitle, exact: true }).waitFor()
            assert.equal(await page.locator('#assignment-record-visual-list').count(), 1, 'one record at all widths')
            assert.equal(await page.locator('#assignment-record-visual-list').evaluate(el => el === document.activeElement), true, 'course handoff focuses the record')
            if (width < 768) assert.equal(await page.locator('.staff-record-table').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'mobile records need no horizontal scrolling')
            if (state === 'filtered-empty') {
              await page.getByRole('searchbox', { name: '搜索作业' }).fill('unmatched')
              await page.getByText('暂无匹配作业', { exact: true }).waitFor()
            }
          }
          await capture(page, `assignments-${state}`, width)
          if (state === 'populated') {
            const request = page.waitForRequest(request => request.url().endsWith('/assignments/visual-list/submissions'))
            await page.getByRole('button', { name: '查看提交', exact: true }).press('Enter')
            assert.equal((await request).method(), 'GET')
            await page.getByRole('dialog', { name: '作业提交列表', exact: true }).waitFor()
            await page.getByLabel('关闭作业提交列表', { exact: true }).click()
            await page.getByLabel(`${longTitle} 的更多操作`, { exact: true }).press('Enter')
            assert.equal(await page.getByRole('button', { name: '导出提交', exact: true }).isVisible(), true)
          }
          release()
          if (failed) {
            assert.equal(await page.getByText('暂无匹配作业', { exact: true }).count(), 0)
            failed = false
            await page.getByRole('button', { name: '重试', exact: true }).click()
            await page.getByText('暂无匹配作业', { exact: true }).waitFor()
          }
        })
      }
      for (const state of ['loading', 'empty', 'error', 'populated']) {
        await scenario(width, 'STUDENT', async page => {
          let release
          const wait = new Promise(resolve => { release = resolve })
          let failed = state === 'error'
          await page.route('**/api/courses/my', async route => {
            if (state === 'loading') await wait
            return fulfill(route, { list: state === 'populated' ? [{ ...sampleCourse, title: longTitle }] : [] }, failed ? 503 : 200)
          })
          await page.goto(base + '/student')
          await page.getByText(state === 'loading' ? '正在加载课程' : state === 'error' ? '课程列表加载失败' : state === 'empty' ? '还没有加入任何课程' : longTitle, { exact: true }).waitFor()
          await capture(page, `student-${state}`, width)
          if (failed) {
            assert.equal(await page.getByText('还没有加入任何课程').count(), 0)
            failed = false
            await page.getByRole('button', { name: '重试', exact: true }).click()
            await page.getByText('还没有加入任何课程').waitFor()
          }
          release()
          if (state === 'populated') {
            const trigger = page.getByRole('button', { name: '加入课程', exact: true })
            await trigger.click()
            const dialog = page.getByRole('dialog', { name: '加入课程' })
            assert.equal(await page.getByLabel('课程号').evaluate(el => el === document.activeElement), true)
            await assertModal(page, dialog, trigger)
            await capture(page, 'student-modal-disabled', width)
            await page.keyboard.press('Escape')
            assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
          }
        })
      }
      await scenario(width, 'TEACHER', async page => {
        let failed = true
        await page.route('**/api/general-questionnaires', route => fulfill(route, { list: [{ id: 'visual-q', name: longTitle, status: 'PUBLISHED', code: 'V1', createdAt: '2026-09-01' }] }, failed ? 503 : 200))
        await page.goto(base + '/general-questionnaires')
        await page.getByText('问卷列表暂时无法加载').waitFor()
        assert.equal(await page.getByText('暂无泛化问卷').count(), 0)
        await capture(page, 'questionnaires-error', width)
        failed = false
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await page.getByLabel(`${longTitle} 的更多操作`, { exact: true }).click()
        const trigger = page.getByRole('button', { name: '令牌管理', exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: `令牌管理 · ${longTitle}` })
        await dialog.waitFor()
        await assertModal(page, dialog, page.getByRole('button', { name: '创建问卷', exact: true }))
        const input = page.getByLabel('最大参与次数（0 表示不限）')
        await input.fill('123')
        assert.equal(await input.evaluate(el => el === document.activeElement), true, 'rerender preserves input focus')
        await capture(page, 'management-modal-long-title', width)
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('dialog:modal').count(), 0)
      })
      await scenario(width, 'TEACHER', async page => {
        let failed = true
        await page.route('**/api/videos?*', route => fulfill(route, { list: [{ id: 'v1', title: longTitle, fileSize: 1024, fileName: 'clip.mp4', url: 'https://example.com/clip.mp4' }] }, failed ? 503 : 200))
        await page.route('**/api/assignments/tags', route => fulfill(route, { tags: [] }))
        await page.goto(base + '/assignments')
        await page.getByRole('button', { name: '布置作业', exact: true }).click()
        const trigger = page.getByRole('button', { name: '添加视频', exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: '选择视频' })
        await dialog.getByRole('alert').waitFor()
        await assertModal(page, dialog, trigger)
        await capture(page, 'media-error', width)
        failed = false
        await dialog.getByRole('button', { name: '重试', exact: true }).click()
        await dialog.getByText(longTitle).waitFor()
        await dialog.getByLabel('搜索素材').fill('unmatched')
        await dialog.getByText('没有符合搜索条件的视频').waitFor()
        await capture(page, 'media-filtered-empty', width)
        const uploadTab = dialog.getByRole('button', { name: '上传', exact: true })
        await uploadTab.focus()
        await page.keyboard.press('Enter')
        await dialog.getByRole('button', { name: '选择文件', exact: true }).focus()
        const chooserPromise = page.waitForEvent('filechooser')
        await page.keyboard.press('Space')
        await (await chooserPromise).setFiles(selectedFile)
        const reselect = dialog.getByRole('button', { name: '重新选择' })
        // Exercise actual keyboard modality after the native picker closes.
        // Firefox does not promise :focus-visible for programmatic focus.
        await dialog.focus()
        for (let step = 0; step < 12 && !await reselect.evaluate(el => el === document.activeElement); step++) await page.keyboard.press('Tab')
        assert.equal(await reselect.evaluate(el => el === document.activeElement), true, 'reselect is reachable by keyboard')
        assert.equal(await reselect.evaluate(el => el.matches(':focus-visible')), true)
        await capture(page, 'media-selected-long-file', width)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
      })
      // Exercise each native picker activation in an independent browser context.
      // Chained intercepted system pickers can retain asynchronous close/focus state.
      for (const key of ['Enter', 'Space']) {
        await scenario(width, 'TEACHER', async page => {
          await page.route('**/api/assignments/tags', route => fulfill(route, { tags: [] }))
          await page.goto(base + '/assignments')
          await page.getByRole('button', { name: '布置作业', exact: true }).click()
          const trigger = page.getByRole('button', { name: '添加视频', exact: true })
          await trigger.click()
          const dialog = page.getByRole('dialog', { name: '选择视频' })
          await dialog.getByRole('button', { name: '上传', exact: true }).click()
          await dialog.locator('input[type=file]').setInputFiles(selectedFile)
          const reselect = dialog.getByRole('button', { name: '重新选择' })
          const chooser = page.waitForEvent('filechooser')
          await reselect.press(key)
          await (await chooser).setFiles([])
          assert.equal(await dialog.isVisible(), true, `${key}: cancel keeps the media dialog open`)
          assert.equal(await dialog.getByText(selectedFile.name, { exact: true }).isVisible(), true, `${key}: cancel retains the selected file`)
          await dialog.getByRole('button', { name: '取消', exact: true }).click()
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
        })
      }
      results.push({ width, passed: true })
      console.log(`Interaction and state QA passed at ${width}px`)
    }
    fs.writeFileSync(path.join(output, 'qa.json'), JSON.stringify({ results }, null, 2))
  } finally { await browser.close() }
}
main().catch(error => {
  reportVisualFailure({ engine: process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium', width: 'setup-or-final', url: base, output, script: __filename }, error)
  console.error(error); process.exitCode = 1
})
