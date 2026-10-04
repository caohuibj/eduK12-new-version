/* dotqa_20261004_m4x8: production bundle with local HTTP fixtures; no live service writes. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')
const base = process.env.DOTQA_BASE_URL || 'http://127.0.0.1:5184'
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, 'fixture suite only targets a local server')
const output = process.env.DOTQA_EVIDENCE_DIR || '/tmp/dotqa-20261004-m4x8'
const course = { id: 'course-1', title: '验收课程', courseCode: 'DOTQA', status: 'PUBLISHED', creatorId: 'teacher-1' }
const assignment = {
  id: 'assignment-1', title: '验收作业', courseId: course.id, course, status: 'PUBLISHED', deadline: '2026-10-11T15:59:00.000Z',
  content: '<p>验收作业内容</p>', description: '', tags: [], _count: { submissions: 1 },
  questions: [{ id: 'q1', type: 'single_choice', question: '颜色？', options: [{ key: 'C', text: '绿色系' }] }],
  videos: [{ type: 'external', title: '示例视频', url: '/fixture.mp4' }],
  images: [{ name: '示例图片', url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>' }],
  documents: [{ id: 'doc-1', title: '示例文档', url: '/fixture.pdf' }],
}
async function setup(browser, role, width, timezoneId = 'Asia/Shanghai') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const state = { qrFailures: 1, writes: [], errors: [] }
  page.on('pageerror', error => state.errors.push(error.message))
  await page.route('**/api/**', async route => {
    const req = route.request(), pathname = new URL(req.url()).pathname
    let status = 200, message = 'ok', code = 0, data = { list: [], total: 0, page: 1, pageSize: 100 }
    if (req.method() !== 'GET') {
      state.writes.push({ pathname, body: req.postDataJSON() })
      if (pathname === '/api/assignments/assignment-1' && req.method() === 'PUT') data = assignment
      else if (pathname === '/api/composite-assessments/c1/attempts') { status = 409; code = 409; message = '已达到综合测评最大次数'; data = null }
      else { status = 405; code = 405; message = 'fixture does not accept this write'; data = null }
    } else if (pathname === '/api/capabilities') data = { cognitive: true, parentPortal: false }
    else if (pathname === '/api/auth/me' || pathname === '/api/users/me') data = { id: `${role.toLowerCase()}-1`, role, username: 'dotqa', nickname: '验收用户', mustChangePassword: false }
    else if (pathname === '/api/auth/csrf') data = { csrfToken: 'fixture-csrf' }
    else if (pathname === '/api/organizations') data = { ...data, allowedActions: [], platformRole: role === 'ADMIN' ? 'SYSTEM_ADMIN' : 'STANDARD' }
    else if (/^\/api\/organizations\//.test(pathname)) { status = 404; code = 404; data = null; message = '组织不存在' }
    else if (pathname === '/api/courses') data = { list: [course] }
    else if (pathname === '/api/assignments') data = { list: [assignment] }
    else if (pathname === '/api/assignments/tags') data = { tags: [] }
    else if (pathname === '/api/assignments/assignment-1/submissions') data = { list: [{ id: 'sub-1', studentId: 's1', student: { id: 's1', username: '学生' }, status: 'SUBMITTED', answers: { '0': 'C' }, submittedAt: '2026-10-04T00:00:00Z' }] }
    else if (pathname === '/api/users') data = { list: [{ id: 'teacher-1', role: 'TEACHER', username: 'teacher', nickname: '验收教师', createdAt: '2026-01-01T00:00:00Z' }] }
    else if (pathname === '/api/classrooms/class-1') data = { id: 'class-1', name: '验收课堂', code: '390765', status: 'ACTIVE', course, questions: [{ id: 'q1', questionIndex: 1, questionContent: { question: '颜色？' }, startedAt: '2026-10-04T00:00:00Z', endedAt: '2026-10-04T00:01:00Z' }] }
    else if (pathname === '/api/classrooms/class-1/qrcode') {
      if (state.qrFailures-- > 0) { status = 503; code = 503; data = null; message = '二维码暂不可用' }
      else data = { classroomId: 'class-1', name: '验收课堂', code: '390765', qrcodeUrl: 'https://eduk12.top/student/classroom/join?code=390765' }
    } else if (pathname === '/api/composite-assessments/available') data = { list: [{ id: 'c1', latestCompletedAttempt: { id: 'completed-1' } }] }
    else if (pathname === '/api/composite-assessments/attempts/completed-1/report') data = { name: '已有测评结果', backgroundValues: [{ itemId: 'color', label: '颜色', value: 'blue', displayValue: '蓝色' }], unitReports: [] }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, message, data }) })
  })
  return { context, page, state }
}
async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: process.env.DOTQA_BROWSER_CHANNEL || 'chrome' })
  const results = []
  async function scenario(name, role, width, run, timezoneId) {
    const fixture = await setup(browser, role, width, timezoneId)
    try { await run(fixture); assert.deepEqual(fixture.state.errors, []); results.push({ name, width, timezoneId: timezoneId || 'Asia/Shanghai', passed: true }) }
    catch (error) { await fixture.page.screenshot({ path: path.join(output, `failure-${name}.png`), fullPage: true }); throw error }
    finally { await fixture.context.close() }
  }
  try {
    for (const width of [1440, 390]) {
      await scenario(`assignment-${width}`, 'TEACHER', width, async ({ page, state }) => {
        await page.goto(`${base}/assignments`)
        const trigger = page.getByRole('button', { name: '验收作业 的更多操作' })
        await trigger.click()
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
        for (const action of ['导出提交', '复制作业', '编辑作业', '删除作业']) assert.equal(await page.getByRole('button', { name: action, exact: true }).isVisible(), true)
        const menu = page.getByRole('group', { name: '验收作业 的更多操作菜单' })
        const box = await menu.boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900)
        await page.screenshot({ path: path.join(output, `assignment-menu-${width}.png`), fullPage: false })
        assert.equal(await menu.isVisible(), true, 'menu remains open after the viewport screenshot')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: '查看提交', exact: true }).click()
        await page.getByText('题目1：绿色系', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await trigger.click(); await page.getByRole('button', { name: '编辑作业', exact: true }).click()
        for (const label of ['移除视频 示例视频', '移除图片 示例图片', '移除文档 示例文档']) assert.equal(await page.getByRole('button', { name: label }).count(), 1)
        assert.equal(await page.getByLabel('截止时间', { exact: true }).inputValue(), '2026-10-11T23:59')
        await page.getByLabel('截止时间', { exact: true }).fill('2026-10-12T23:59')
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assignments/assignment-1' && response.request().method() === 'PUT')
        await page.getByRole('button', { name: '保存修改' }).click()
        await saved
        assert.equal(state.writes.find(write => write.pathname === '/api/assignments/assignment-1').body.deadline, '2026-10-12T15:59:00.000Z')
      })
      await scenario(`classroom-${width}`, 'TEACHER', width, async ({ page }) => {
        await page.goto(`${base}/teacher/classrooms/class-1/control`)
        await page.getByText('答题已结束', { exact: true }).waitFor()
        assert.equal(await page.getByText('答题进行中', { exact: true }).count(), 0)
        await page.getByRole('button', { name: '二维码', exact: true }).click()
        await page.getByRole('button', { name: '生成二维码' }).click()
        await page.getByText('二维码暂不可用', { exact: true }).waitFor()
        await page.getByRole('button', { name: '重新生成' }).click()
        await page.getByRole('button', { name: '下载二维码' }).waitFor()
        const darkPixels = await page.locator('canvas').evaluate(canvas => {
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          let dark = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 128 && pixels[index + 3]) dark++
          return dark
        })
        assert(darkPixels > 1000, 'QR must have actual drawn dark modules')
        await page.screenshot({ path: path.join(output, `classroom-qr-${width}.png`), fullPage: true })
      })
      await scenario(`attempt-limit-${width}`, 'STUDENT', width, async ({ page }) => {
        await page.goto(`${base}/student/composite/c1`)
        await page.getByText('本次测评的参与次数已用尽').waitFor()
        await page.getByRole('button', { name: '查看已有结果' }).click()
        await page.getByRole('heading', { name: '已有测评结果' }).waitFor()
        await page.getByText('蓝色', { exact: true }).waitFor()
        assert.equal(await page.getByText('blue', { exact: true }).count(), 0)
        assert.equal(await page.getByText(/报告读取失败不会改变/).count(), 0)
      })
    }
    await scenario('organization-denied', 'ADMIN', 1440, async ({ page, state }) => {
      await page.goto(`${base}/organizations/new`)
      await page.getByText('当前服务器未授予组织创建权限。').waitFor()
      assert.equal(await page.getByRole('textbox', { name: '首位管理员用户 ID' }).count(), 0)
      assert.equal(await page.getByRole('link', { name: '创建组织', exact: true }).count(), 0)
      assert.equal(await page.getByRole('combobox', { name: '当前组织' }).count(), 0)
      await page.goto(`${base}/organizations/unavailable`)
      await page.getByText('组织不存在，或当前账户没有访问权限。请返回组织列表选择可访问的组织。').waitFor()
      assert.equal(await page.getByRole('link', { name: '组织概览', exact: true }).count(), 0)
      assert.equal(state.writes.length, 0)
    })
    await scenario('user-id', 'ADMIN', 1440, async ({ page }) => {
      await page.goto(`${base}/users`)
      await page.getByRole('button', { name: '复制 验收教师 的用户 ID' }).waitFor()
      assert.equal(await page.getByText('teacher-1', { exact: true }).count(), 1)
    })
    await scenario('deadline-utc', 'TEACHER', 1440, async ({ page }) => {
      await page.goto(`${base}/assignments`)
      await page.getByRole('button', { name: '验收作业 的更多操作' }).click()
      await page.getByRole('button', { name: '编辑作业' }).click()
      assert.equal(await page.getByLabel('截止时间', { exact: true }).inputValue(), '2026-10-11T15:59')
      assert.equal(await page.getByText(/截止时间按当前设备时区输入：UTC/).count(), 1)
    }, 'UTC')
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, liveServiceWrites: false, results }, null, 2))
    console.log(JSON.stringify({ passed: results.length, output }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
