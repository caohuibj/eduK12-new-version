/* State and keyboard regression coverage. All API responses are local fixtures. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const { installApiFixture, sampleCourse } = require('./visual-canonical-browser-e2e.cjs')
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
  const browser = await chromium.launch({ headless: true, channel: process.env.VISUAL_QA_BROWSER_CHANNEL || undefined })
  const results = []
  async function scenario(width, role, run) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1024 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = await installApiFixture(page, role)
    try {
      await run(page)
      assert.deepEqual(errors, [])
      assert.equal(requests.some(request => request.method !== 'GET'), false, 'no business writes')
    } catch (error) {
      await page.screenshot({ path: path.join(output, `failure-${width}.png`), fullPage: true })
      console.error((await page.locator('body').innerText()).slice(-2500))
      throw error
    } finally { await context.close() }
  }
  try {
    for (const width of widths) {
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
        await reselect.focus()
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
main().catch(error => { console.error(error); process.exitCode = 1 })
