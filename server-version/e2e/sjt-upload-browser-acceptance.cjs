// Opt-in acceptance: localhost browser and a dedicated disposable synthetic database only.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')
const bcrypt = require('../backend/node_modules/bcryptjs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')
if (
  !/^postgresql:\/\/situational_test:.*@127\.0\.0\.1:55473\/situational_vnext/.test(
    process.env.DATABASE_URL || '',
  )
)
  throw new Error('Dedicated synthetic database required')
const baseUrl = 'http://127.0.0.1:51473',
  db = new PrismaClient(),
  out = '/tmp/huisurvey-sjt-upload-evidence'
const fixturePath = path.join(out, 'sjt-browser-fixture.json')
async function main() {
  let fixture
  try {
    fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
  } catch {
    fixture = {}
    for (const [key, role] of [
      ['author', 'TEACHER'],
      ['reviewer', 'ADMIN'],
      ['other', 'TEACHER'],
      ['student', 'STUDENT'],
    ]) {
      const id = randomUUID(),
        username = `synthetic-upload-${id}`,
        password = `Synthetic-${randomUUID()}`
      await db.user.create({
        data: {
          id,
          username,
          passwordHash: await bcrypt.hash(password, 10),
          role,
          teacherApproved: true,
          mustChangePassword: false,
        },
      })
      fixture[key] = { id, username, password }
    }
    await fs.writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
  }
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  })
  try {
    async function login(key) {
      const page = await browser.newPage()
      page.setDefaultTimeout(60000)
      const admin = key === 'reviewer'
      await loginWithSession(page, {
        baseUrl,
        route: admin
          ? '/admin/login'
          : key === 'student'
            ? '/student/login'
            : '/teacher/account-login',
        ...fixture[key],
        usernamePlaceholder: admin ? '请输入管理员账号' : '请输入用户名',
        submitName: admin ? '管理员登录' : '登录',
        timeout: 60000,
      })
      return page
    }
    const author = await login('author')
    console.log('PASS synthetic teacher session')
    if (process.env.SJT_BROWSER_VERIFY_RESULT_ONLY === '1') {
      assert.ok(fixture.attemptId)
      await author.goto(`${baseUrl}/teacher/situational/attempts/${fixture.attemptId}/result`)
      const saved = await sessionJsonFetch(
        author,
        `/teacher/situational/attempts/${fixture.attemptId}/result`,
      )
      assert.equal(saved.status, 200)
      await author
        .getByText(saved.body.data.result.narrative.paragraphs[0], { exact: true })
        .waitFor()
      await author.getByText('存在非回答，报告按已回答内容描述。', { exact: true }).waitFor()
      await author.screenshot({ path: path.join(out, 'sjt-teacher-report.png'), fullPage: true })
      console.log('PASS saved report renders in browser after retirement')
      return
    }
    await author.goto(`${baseUrl}/sjt-authoring`)
    await author.getByRole('heading', { name: 'SJT 模板与题包' }).waitFor()
    if (!fixture.draftId) {
      await author
        .getByLabel('选择 SJT 模板')
        .setInputFiles(path.resolve(__dirname, '../backend/assets/sjt-upload-example-v1.xlsx'))
      await author.getByRole('button', { name: '检查模板', exact: true }).click()
      await author.getByRole('status').filter({ hasText: '检查通过' }).waitFor()
      const saved = author.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/situational/authoring/drafts',
      )
      await author.getByRole('button', { name: '保存新草稿', exact: true }).click()
      const body = await (await saved).json()
      assert.equal(body.code, 0)
      fixture.draftId = body.data.id
      await fs.writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
      console.log('PASS workbook check and save draft')
    } else {
      await author
        .getByRole('button', { name: '打开题包 sjt-teacher-demonstration 1.0.0', exact: true })
        .click()
    }
    await author.getByRole('button', { name: '预览作答与报告', exact: true }).click()
    for (let i = 0; i < 6; i++) {
      const fields = author.locator('fieldset')
      await fields.first().waitFor()
      await fields.first().getByRole('radio').first().check()
      await author.getByRole('button', { name: '确认行动', exact: true }).click()
      await author.getByText('追问可跳过；确认后继续下一情境。', { exact: false }).waitFor()
      for (let j = 0; j < (await fields.count()); j++)
        await fields.nth(j).getByRole('radio').last().check()
      await author.getByRole('button', { name: '确认追问并继续', exact: true }).click()
    }
    await author.getByRole('heading', { name: '预览报告', exact: true }).waitFor()
    await author.screenshot({ path: path.join(out, 'sjt-author-preview.png'), fullPage: true })
    console.log('PASS six logical nodes, action-first probes and preview report')
    const current = await sessionJsonFetch(
      author,
      `/situational/authoring/drafts/${fixture.draftId}`,
    )
    if (current.body.data.status === 'DRAFT') {
      await author.getByRole('button', { name: '提交审核', exact: true }).click()
      await author.getByText(/待审核 · 修订/).waitFor()
    }
    const reviewer = await login('reviewer')
    await reviewer.goto(`${baseUrl}/sjt-authoring`)
    await reviewer
      .getByRole('button', { name: '打开题包 sjt-teacher-demonstration 1.0.0', exact: true })
      .click()
    if (current.body.data.status !== 'PUBLISHED') {
      await reviewer
        .getByText('审核意见', { exact: true })
        .locator('textarea')
        .fill('仅在独立合成数据库验证上传与独立审核，不授权生产发布。')
      await reviewer.getByRole('button', { name: '审核通过并发布', exact: true }).click()
      await reviewer.getByRole('button').filter({ hasText: '已发布 · 修订' }).waitFor()
    }
    console.log('PASS independent admin review and immutable release')
    await author.goto(`${baseUrl}/teacher/situational`)
    await author.locator('a[href="/teacher/situational/sjt-teacher-demonstration"]').click()
    await author.getByRole('button', { name: '确认行动选择', exact: true }).waitFor()
    for (let i = 0; i < 6; i++) {
      const fields = author.locator('fieldset:not([disabled])')
      const radio =
        i === 0
          ? fields.first().getByRole('radio').last()
          : fields.first().getByRole('radio').first()
      await radio.click()
      await author.waitForFunction((el) => el.checked, await radio.elementHandle())
      await author.getByRole('button', { name: '确认行动选择', exact: true }).click()
      await author.getByRole('button', { name: '确认本阶段作答', exact: true }).waitFor()
      for (let j = 0; j < (await fields.count()); j++) {
        const radio = fields.nth(j).getByRole('radio').last()
        await radio.click()
        await author.waitForFunction((el) => el.checked, await radio.elementHandle())
      }
      await author.getByRole('button', { name: '确认本阶段作答', exact: true }).click()
      if (i < 5) {
        await author.getByRole('button', { name: '下一题', exact: true }).click()
        await author.getByRole('button', { name: '确认行动选择', exact: true }).waitFor()
      }
    }
    assert.equal(await author.getByText('最初', { exact: true }).count(), 0)
    const submitted = author.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/teacher\/situational\/attempts\/[^/]+\/submit$/.test(new URL(r.url()).pathname),
    )
    await author.getByRole('button', { name: '提交测评', exact: true }).click()
    const response = await (await submitted).json()
    assert.equal(response.code, 0, JSON.stringify(response))
    assert.ok(response.data.result.narrative.paragraphs.length > 6)
    fixture.attemptId = response.data.attempt.id
    await fs.writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
    assert.equal(response.data.result.metrics.find((m) => m.key === 'E').value, null)
    assert.ok(response.data.result.metrics.every((m) => !('contributions' in m)))
    assert.equal(
      await db.situationalRawSubmission.count({ where: { attemptId: fixture.attemptId } }),
      1,
    )
    await author.waitForURL(/\/result$/)
    await author.getByText(response.data.result.narrative.paragraphs[0], { exact: true }).waitFor()
    await author.screenshot({ path: path.join(out, 'sjt-teacher-report.png'), fullPage: true })
    const other = await login('other')
    const forbidden = await sessionJsonFetch(
      other,
      `/teacher/situational/attempts/${fixture.attemptId}/result`,
    )
    assert.equal(forbidden.status, 403)
    const denied = await sessionJsonFetch(
      reviewer,
      `/situational/attempts/${fixture.attemptId}/research-export`,
    )
    assert.equal(denied.status, 403)
    console.log('PASS teacher U/N flow, delayed narrative, one FINAL and ownership/export denial')
    await reviewer
      .getByText('停用说明', { exact: true })
      .locator('textarea')
      .fill('合成验收完成，停止新的测试作答。')
    await reviewer.getByRole('button', { name: '停用此发布版本', exact: true }).click()
    await reviewer.getByText('此版本已停用，历史作答保留。').waitFor()
    const savedResult = await sessionJsonFetch(
      author,
      `/teacher/situational/attempts/${fixture.attemptId}/result`,
    )
    assert.equal(savedResult.body.data.instrument.releaseStatus, 'RETIRED')
    assert.deepEqual(savedResult.body.data.result, response.data.result)
    console.log('PASS retirement retains frozen result')
    await fs.writeFile(
      path.join(out, 'sjt-browser-result.json'),
      JSON.stringify({
        status: 'passed',
        checks: [
          'upload',
          'preview',
          'independent-review',
          'teacher-UN',
          'single-FINAL',
          'ownership',
          'research-denial',
          'retirement-frozen-result',
        ],
      }),
    )
  } finally {
    await browser.close()
  }
}
main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
