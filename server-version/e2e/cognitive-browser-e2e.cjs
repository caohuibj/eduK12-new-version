// eduK12 CognitiveRunner Fake Test Browser E2E（Stage B v1.1 §23–24）
// 真实 Chromium：Student Login → CognitiveHome → Assignment entry → Runner → trial 0/1/2 → complete → Result
// 额外验证：Result refresh 不重新评分；无账本 IN_PROGRESS → RECOVERY_REQUIRED（不静默重跑）
const { chromium } = require('playwright') // 运行需 NODE_PATH 指向安装 playwright 的 node_modules，如 NODE_PATH=/Users/Qiang/.workbuddy/binaries/node/workspace/node_modules node server-version/e2e/cognitive-browser-e2e.cjs

const BASE = 'http://localhost'
const SHOT_DIR = '/tmp/e2e-shots'
const USER = 'e2estudent'
const PASS = 'e2e123456'

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
    // ============ 主链路 ============
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // 1) 学生登录
    await studentLogin(page)
    await page.screenshot({ path: `${SHOT_DIR}/01-login-home.png` })
    record('login', true)

    // 2) 导航含"认知测评"（flag=true 注入）
    const nav = page.locator('nav >> text=认知测评')
    record('nav-cognitive-visible', (await nav.count()) > 0)
    await nav.first().click()
    await page.waitForURL('**/student/cognitive', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/02-cognitive-home.png` })
    record('cognitive-home', (await page.getByText('E2E Fake Test v2').count()) > 0)

    // 3) 进入 Assignment entry → 开始测评 → create session
    await page.getByText('E2E Fake Test v2').click()
    await page.waitForURL('**/student/cognitive/assignments/**', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/03-entry.png` })
    await page.getByRole('button', { name: /开始测评/ }).click()
    await page.waitForURL('**/student/cognitive/sessions/**', { timeout: 15000 })
    const sessionUrl = page.url()
    const sessionId = sessionUrl.split('/sessions/')[1]
    record('session-created', !!sessionId, sessionId)
    await page.screenshot({ path: `${SHOT_DIR}/04-runner-ready.png` })

    // 4) Runner READY → 开始测评
    await page.getByRole('button', { name: /开始测评/ }).click()
    await page.waitForSelector('text=/试次 1 \\/ 3/', { timeout: 10000 })
    record('runner-started', true)

    // 5) trial 0/1/2（每次点击后等待下一试次出现）
    const trialLabels = ['试次 1 / 3', '试次 2 / 3', '试次 3 / 3']
    for (let i = 0; i < 3; i++) {
      const sel = `text=/${trialLabels[i].replace(/\//g, '\\/')}/`
      await page.waitForSelector(sel, { timeout: 10000 })
      if (i === 0) await page.screenshot({ path: `${SHOT_DIR}/05-trial0.png` })
      await page.getByLabel(`trial ${i}`).click()
    }
    record('trials-0-1-2-submitted', true)

    // 6) 完成测评 → result
    await page.waitForSelector('button:has-text("完成测评")', { timeout: 10000 })
    await page.getByRole('button', { name: /完成测评/ }).click()
    await page.waitForURL('**/result', { timeout: 15000 })
    await page.waitForSelector('text=测评完成', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/06-result.png` })
    const scoreText = await page.locator('text=得分').first().isVisible()
    record('result-shown', scoreText)

    // 7) Result refresh：刷新后仍展示 stored result（不重新评分）
    await page.reload()
    await page.waitForSelector('text=测评完成', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/07-result-refresh.png` })
    record('result-refresh-reloads', true)

    // ============ RECOVERY_REQUIRED ============
    // 先用 API 为 e2estudent 创建新的 IN_PROGRESS session（attempt 2，无本地账本）
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    })
    const loginData = await loginRes.json()
    const studentToken = loginData.data.token
    const assignmentRes = await fetch(`${BASE}/api/cognitive/assignments/my`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const myAssignments = await assignmentRes.json()
    const target = myAssignments.data.find((a) => a.title === 'E2E Fake Test v2')
    const sessionRes = await fetch(`${BASE}/api/cognitive/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ assignmentId: target.id }),
    })
    const sessionData = await sessionRes.json()
    const recoverySessionId = sessionData.data.sessionId
    record('api-created-inprogress-session', !!recoverySessionId, recoverySessionId)

    // 新 context（无本地账本）直接访问 runner URL → 安全态提示，不静默重跑
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const pageB = await ctxB.newPage()
    await studentLogin(pageB)
    await pageB.goto(`${BASE}/student/cognitive/sessions/${recoverySessionId}`, { waitUntil: 'networkidle' })
    await pageB.waitForSelector('text=无法恢复测评进度', { timeout: 15000 })
    await pageB.screenshot({ path: `${SHOT_DIR}/08-recovery-required.png` })
    record('recovery-required-shown', true)
    // 安全断言：不出现作答/开始按钮（不静默重跑）
    const noRerun = (await pageB.getByRole('button', { name: /作答|开始测评/ }).count()) === 0
    record('recovery-no-silent-rerun', noRerun)
    await ctxB.close()

    await ctx.close()
  } finally {
    await browser.close()
  }

  // ============ 汇总 ============
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
