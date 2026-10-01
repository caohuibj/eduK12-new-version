/* Production frontend acceptance with deterministic HTTP fixtures; no database writes. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')
const base = process.env.INBOX_E2E_BASE_URL || 'http://127.0.0.1:5181'
const output = process.env.INBOX_E2E_OUTPUT || '/tmp/huisurvey-inbox-evidence'
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  try {
    for (const role of ['STUDENT', 'TEACHER', 'PARENT', 'ADMIN']) for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url())
        let data = { list: [], total: 0, page: 1, totalPages: 1 }
        if (url.pathname === '/api/auth/me' || url.pathname === '/api/users/me') data = { id: 'own-respondent', role, username: '试点参与者', mustChangePassword: false }
        if (url.pathname === '/api/auth/csrf') data = { csrfToken: 'test-only' }
        if (url.pathname === '/api/capabilities') data = { cognitive: true }
        if (url.pathname === '/api/my-assessments') data = { pendingCount: 1, truncated: false, list: [
          { taskId: 'self:1', sourceType: 'SELF_SERVICE', sourceId: '1', title: '本人的测评', state: 'IN_PROGRESS', consentState: 'NOT_REQUIRED', launchTarget: '/student/scales/own-scale', reportTarget: null, resultAvailability: 'PENDING', deadline: null },
          { taskId: 'receipt:1', sourceType: 'RELATIONAL', sourceId: '2', title: '课堂体验反馈', state: 'COMPLETED', consentState: 'NOT_REQUIRED', launchTarget: null, reportTarget: null, resultAvailability: 'COMPLETION_ONLY', deadline: null, feedback: { title: '感谢你分享本次体验', message: '本次回答已保存，不向你展示被评价者的个人得分或排名。' } },
        ] }
        if (url.pathname === '/api/my-assessments/longitudinal') data = { list: [{ id: 'own-longitudinal', generatedAt: '2026-10-01', projection: { kind: 'MY_LONGITUDINAL', waves: [{ ordinal: 1, evidenceLevel: 'PILOT', metrics: { score: { state: 'present', value: 3 } } }, { ordinal: 2, evidenceLevel: 'PILOT', metrics: { score: { state: 'present', value: 4 } } }], comparisons: [{ fromOrdinal: 1, toOrdinal: 2, metrics: { score: { comparability: 'EXACT', delta: 1 } } }], limitations: ['多次结果仅反映所记录的测量情况，不能单独用于诊断或因果判断。'] } }] }
        if (url.pathname === '/api/my-assessments/catalog') data = { list: [] }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data, message: 'ok' }) })
      })
      await page.goto(`${base}/my-assessments`)
      await page.getByRole('heading', { name: '我的测评', exact: true }).waitFor()
      await page.getByRole('link', { name: '继续作答', exact: true }).waitFor()
      await page.getByText('不向你展示被评价者的个人得分或排名', { exact: false }).waitFor()
      assert.equal(await page.getByRole('link', { name: '我的报告', exact: true }).count(), 0)
      await page.getByRole('button', { name: '查看我的多次反馈', exact: true }).click()
      await page.getByText('第 1 次：3', { exact: true }).waitFor()
      await page.getByText('第 2 次：4', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${role}/${width} overflow`)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(output, `${role}-${width}.png`), fullPage: true })
      await context.close()
    }
    console.log('PASS: 12 respondent inbox scenarios at 390/768/1440; protected feedback receipt has no report link')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
