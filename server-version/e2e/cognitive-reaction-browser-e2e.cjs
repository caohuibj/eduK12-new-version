// eduK12 CognitiveRunner Reaction Test Browser E2E（Milestone E Session 2 §37）
// 真实 Chromium：Student Login → CognitiveHome → Assignment entry → Runner
//   → instruction → practice ×3 → formal ×20 → complete → Result（+ refresh 不重新评分）
//
// 运行前提（与 Fake E2E 相同的 ops fixture 约定，F7）：
//   1. seed 已运行（backend `npm run db:seed`）：reaction/1.0.0 PUBLISHED config 存在
//      （名称含 "Reaction Time v1.0.0 [INTERNAL PILOT]"）
//   2. 已存在 PUBLISHED 的 Reaction Assignment，标题 = "E2E Reaction v1"
//      （创建方式与 Fake "E2E Fake Test v2" 相同：admin/teacher 经 API 或 DB 建 assignment →
//       publish → 学生通过 courseCode 注册加入该 course）
//   3. e2estudent / e2e123456 可登录且对上述 assignment 可见
//
// 运行：NODE_PATH=<playwright node_modules> node server-version/e2e/cognitive-reaction-browser-e2e.cjs
// 可选 DB 校验（容器内）：RUN_DB_CHECK=1 时用 psql 断言 1 COMPLETED session + 20 条 trial 密文。
const { chromium } = require('playwright')
const { execSync } = require('child_process')

const BASE = 'http://localhost'
const SHOT_DIR = '/tmp/e2e-reaction-shots'
const USER = 'e2estudent'
const PASS = 'e2e123456'
const ASSIGNMENT_TITLE = 'E2E Reaction v1'
const TOTAL_TRIALS = 20
const PRACTICE_TRIALS = 3

const fs = require('fs')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const results = []
const record = (name, ok, detail = '') => results.push({ name, ok, detail })

async function studentLogin(page) {
  await page.goto(`${BASE}/student/login`)
  await page.fill('input[placeholder="请输入用户名"]', USER)
  await page.fill('input[placeholder="请输入密码"]', PASS)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL('**/student', { timeout: 15000 })
}

async function main() {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // 1) 学生登录
    await studentLogin(page)
    await page.screenshot({ path: `${SHOT_DIR}/01-login-home.png` })
    record('login', true)

    // 2) 导航 → CognitiveHome
    const nav = page.locator('nav >> text=认知测评')
    record('nav-cognitive-visible', (await nav.count()) > 0)
    await nav.first().click()
    await page.waitForURL('**/student/cognitive', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/02-cognitive-home.png` })
    record('cognitive-home', (await page.getByText(ASSIGNMENT_TITLE).count()) > 0)

    // 3) 进入 Assignment entry → 开始测评 → create session
    await page.getByText(ASSIGNMENT_TITLE).click()
    await page.waitForURL('**/student/cognitive/assignments/**', { timeout: 10000 })
    await page.getByRole('button', { name: /开始测评/ }).click()
    await page.waitForURL('**/student/cognitive/sessions/**', { timeout: 15000 })
    const sessionUrl = page.url()
    const sessionId = sessionUrl.split('/sessions/')[1]
    record('session-created', !!sessionId, sessionId)
    await page.screenshot({ path: `${SHOT_DIR}/03-runner-ready.png` })

    // 4) Runner READY → 开始测评（进入 instruction）
    await page.getByRole('button', { name: /开始测评/ }).click()
    await page.waitForSelector('text=反应速度', { timeout: 10000 })
    record('instruction-shown', true)
    await page.screenshot({ path: `${SHOT_DIR}/04-instruction.png` })

    // 5) instruction → practice ×3（等绿色再点；practice 不入库，页面立即给反馈）
    await page.getByRole('button', { name: /开始练习/ }).click()
    for (let i = 0; i < PRACTICE_TRIALS; i++) {
      await page.waitForSelector('text=点击！', { timeout: 10000 })
      await page.getByLabel(`practice trial ${i}`).click()
      // 练习反馈页按钮：非过早 → 下一个/开始正式测评
      await page.waitForSelector(`button:has-text("${i === PRACTICE_TRIALS - 1 ? '开始正式测评' : '下一个'}")`, { timeout: 10000 })
      await page.getByRole('button', { name: i === PRACTICE_TRIALS - 1 ? /开始正式测评/ : /下一个/ }).click()
    }
    record('practice-3-done', true)
    await page.screenshot({ path: `${SHOT_DIR}/05-practice-done.png` })

    // 6) formal ×20：等绿色（点击！）再点，避免 premature / miss
    for (let i = 0; i < TOTAL_TRIALS; i++) {
      const label = `试次 ${i + 1} / ${TOTAL_TRIALS}`
      await page.waitForSelector(`text=/${label.replace(/\//g, '\\/')}/`, { timeout: 15000 })
      await page.waitForSelector('text=点击！', { timeout: 10000 })
      await page.getByLabel(`trial ${i}`).click()
    }
    record('formal-20-submitted', true)

    // 7) 完成测评 → Result（reportDefinition 驱动：标题/指标/disclaimer）
    await page.waitForSelector('button:has-text("完成测评")', { timeout: 15000 })
    await page.getByRole('button', { name: /完成测评/ }).click()
    await page.waitForURL('**/result', { timeout: 15000 })
    await page.waitForSelector('text=反应速度', { timeout: 10000 })
    await page.waitForSelector('text=中位反应时', { timeout: 10000 })
    const disclaimerVisible = (await page.getByText('结果反映本次任务表现，不代表诊断或正式能力评估。').count()) > 0
    record('result-shown-with-report-metadata', disclaimerVisible)
    await page.screenshot({ path: `${SHOT_DIR}/06-result.png` })

    // 8) Result refresh：刷新后仍展示 stored result（不重新评分）
    await page.reload()
    await page.waitForSelector('text=反应速度', { timeout: 10000 })
    await page.waitForSelector('text=中位反应时', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/07-result-refresh.png` })
    record('result-refresh-reloads', true)

    // 9) 可选 DB 断言：1 COMPLETED session + 20 CognitiveTrial（encrypted payload）
    if (process.env.RUN_DB_CHECK === '1') {
      const countTrials = execSync(
        `docker compose exec -T postgres psql -U ptool -d ptool -tAc "SELECT count(*) FROM \\"CognitiveTrial\\" t JOIN \\"CognitiveSession\\" s ON s.id = t.sessionId WHERE s.id = '${sessionId}';"`,
        { cwd: '/Users/Qiang/Documents/trae_projects/eduK12-new-version/server-version' }
      ).toString().trim()
      record('db-20-trials', countTrials === String(TOTAL_TRIALS), `trials=${countTrials}`)

      const status = execSync(
        `docker compose exec -T postgres psql -U ptool -d ptool -tAc "SELECT status FROM \\"CognitiveSession\\" WHERE id = '${sessionId}';"`,
        { cwd: '/Users/Qiang/Documents/trae_projects/eduK12-new-version/server-version' }
      ).toString().trim()
      record('db-session-completed', status === 'COMPLETED', status)
    }

    await ctx.close()
  } finally {
    await browser.close()
  }

  let failed = 0
  for (const r of results) {
    if (!r.ok) failed++
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` :: ${r.detail}` : ''}`)
  }
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('E2E ERROR:', e.message)
  process.exit(1)
})
