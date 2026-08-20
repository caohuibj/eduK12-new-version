// eduK12 CognitiveRunner Memory + Stroop Browser E2E（Milestone E Session 3/4）
// 真实 Chromium：学生登录 → Memory（practice + adaptive formal）→ Stroop（practice gate + formal）
//   → 两个结果页 → 历史列表；可选检查 trial 密文和 COMPLETED 状态。
//
// 运行前需要有两个已发布作业，默认标题：
//   E2E Memory Stable / E2E Stroop v2
// 可用 COGNITIVE_E2E_MEMORY_ASSIGNMENT、COGNITIVE_E2E_STROOP_ASSIGNMENT 覆盖标题。
//
// 运行：NODE_PATH=<playwright node_modules> node e2e/cognitive-memory-stroop-browser-e2e.cjs
// 可选：RUN_DB_CHECK=1 检查两个 session 的试次数量、密文和完成状态。
const { chromium } = require('playwright')
const { execSync } = require('child_process')

const BASE = 'http://localhost'
const USER = process.env.COGNITIVE_E2E_USER || 'e2estudent'
const PASS = process.env.COGNITIVE_E2E_PASS || 'e2e123456'
const MEMORY_ASSIGNMENT = process.env.COGNITIVE_E2E_MEMORY_ASSIGNMENT || 'E2E Memory Stable'
const STROOP_ASSIGNMENT = process.env.COGNITIVE_E2E_STROOP_ASSIGNMENT || 'E2E Stroop v2'
const SHOT_DIR = '/tmp/e2e-memory-stroop-shots'

require('fs').mkdirSync(SHOT_DIR, { recursive: true })

const results = []
const record = (name, ok, detail = '') => results.push({ name, ok, detail })

async function studentLogin(page) {
  const token = process.env.COGNITIVE_E2E_TOKEN
  if (token) {
    await page.goto(`${BASE}/`)
    await page.evaluate((value) => localStorage.setItem('token', value), token)
    await page.reload()
  } else {
    await page.goto(`${BASE}/student/login`)
    await page.fill('input[placeholder="请输入用户名"]', USER)
    await page.fill('input[placeholder="请输入密码"]', PASS)
    await page.getByRole('button', { name: '登录' }).click()
  }
  await page.waitForURL('**/student', { timeout: 15000 })
}

async function openAssignment(page, title) {
  await page.goto(`${BASE}/student/cognitive`)
  await page.waitForSelector(`text=${title}`, { timeout: 10000 })
  await page.getByText(title, { exact: true }).click()
  await page.waitForURL('**/student/cognitive/assignments/**', { timeout: 10000 })
  await page.getByRole('button', { name: /开始测评/ }).click()
  await page.waitForURL('**/student/cognitive/sessions/**', { timeout: 15000 })
  const sessionId = page.url().split('/sessions/')[1]
  await page.getByRole('button', { name: /开始测评/ }).click()
  return sessionId
}

async function captureMemorySequence(page, length) {
  return page.evaluate((expectedLength) => new Promise((resolve, reject) => {
    const digits = []
    let previous = ''
    let interval
    let timeout
    const sample = () => {
      const value = document.querySelector('.text-6xl')?.textContent?.trim() || ''
      if (/^\d$/.test(value)) {
        if (value !== previous) {
          digits.push(Number(value))
          previous = value
        }
      } else {
        previous = ''
      }
      if (digits.length === expectedLength) {
        cleanup()
        resolve(digits)
      }
    }
    const observer = new MutationObserver(sample)
    const cleanup = () => {
      observer.disconnect()
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    interval = window.setInterval(sample, 1)
    timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Memory sequence capture failed: expected ${expectedLength}, got ${digits.length}`))
    }, 15000)
    sample()
  }), length)
}

async function clickDigits(page, digits) {
  for (const [index, digit] of digits.entries()) {
    await page.getByRole('button', { name: String(digit), exact: true }).click()
    await page.waitForFunction((expectedCount) => {
      const line = [...document.querySelectorAll('div')]
        .find((node) => node.textContent?.startsWith('按顺序输入：'))
      const entered = line?.textContent?.split('：')[1]?.trim()
      return entered && entered !== '—' && entered.split(/\s+/).length >= expectedCount
    }, index + 1)
  }
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((button) => button.textContent?.trim() === '提交' && !button.disabled))
  await page.getByRole('button', { name: '提交', exact: true }).click()
}

async function runMemory(page) {
  const sessionId = await openAssignment(page, MEMORY_ASSIGNMENT)
  await page.waitForSelector('text=数字序列短时记忆', { timeout: 10000 })
  await page.getByRole('button', { name: '开始练习' }).click()

  for (const practice of [[3, 7, 1], [9, 4, 2]]) {
    await page.getByRole('button', { name: String(practice[0]), exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    for (const digit of practice) await page.getByRole('button', { name: String(digit), exact: true }).click()
    await page.getByRole('button', { name: '提交练习' }).click()
    await page.getByRole('button', { name: /下一个|开始正式测评/ }).click()
  }

  // 验收夹具使用 maxLength=3：长度 2 和长度 3 各完成两题，保证服务端能验证自适应终止路径。
  for (let trial = 0; trial < 4; trial++) {
    const trialWithinLevel = (trial % 2) + 1
    await page.getByText(new RegExp(`第 ${trialWithinLevel} 题 / 2`)).first().waitFor({ state: 'visible', timeout: 10000 })
    const lengthText = await page.getByText(/当前长度/).first().textContent()
    const match = lengthText && lengthText.match(/当前长度 (\d+)/)
    if (!match) throw new Error(`Memory length label missing: ${lengthText}`)
    const sequence = await captureMemorySequence(page, Number(match[1]))
    await clickDigits(page, sequence)
  }

  await page.waitForURL('**/result', { timeout: 15000 })
  await page.waitForSelector('text=数字序列短时记忆', { timeout: 10000 })
  await page.screenshot({ path: `${SHOT_DIR}/memory-result.png` })
  return sessionId
}

const STROOP_BUTTON = {
  red: '1 · 红',
  green: '2 · 绿',
  blue: '3 · 蓝',
  yellow: '4 · 黄',
}
const STROOP_RGB = {
  'rgb(239, 68, 68)': 'red',
  'rgb(34, 197, 94)': 'green',
  'rgb(59, 130, 246)': 'blue',
  'rgb(234, 179, 8)': 'yellow',
}

async function readStroopInkColor(page) {
  const stimulus = page.locator('.text-6xl').first()
  await stimulus.waitFor({ state: 'visible', timeout: 10000 })
  const rgb = await stimulus.evaluate((node) => getComputedStyle(node).color)
  const color = STROOP_RGB[rgb]
  if (!color) throw new Error(`Unknown Stroop stimulus color: ${rgb}`)
  // 保留至少 200ms 的有效 RT，避免浏览器自动点击落在 validRtFloor 之前。
  await page.waitForTimeout(250)
  return color
}

async function runStroop(page) {
  const sessionId = await openAssignment(page, STROOP_ASSIGNMENT)
  await page.waitForSelector('text=色词 Stroop', { timeout: 10000 })
  await page.getByRole('button', { name: '开始练习' }).click()

  await readStroopInkColor(page)
  await page.getByRole('button', { name: STROOP_BUTTON.red, exact: true }).click()
  await page.getByRole('button', { name: /下一个/ }).click()

  await readStroopInkColor(page)
  await page.getByRole('button', { name: STROOP_BUTTON.green, exact: true }).click()
  await page.getByRole('button', { name: /开始正式测评/ }).click()

  for (let trial = 0; trial < 4; trial++) {
    await page.waitForSelector(`text=正式试次 ${trial + 1} / 4`, { timeout: 10000 })
    const color = await readStroopInkColor(page)
    await page.getByRole('button', { name: STROOP_BUTTON[color], exact: true }).click()
  }

  await page.waitForURL('**/result', { timeout: 15000 })
  await page.waitForSelector('text=干扰控制任务表现', { timeout: 10000 })
  await page.screenshot({ path: `${SHOT_DIR}/stroop-result.png` })
  return sessionId
}

function dbCount(sessionId, query) {
  return execSync(`docker compose exec -T postgres psql -U ptool -d ptool -tAc "${query.replace(/SESSION_ID/g, sessionId)}"`, {
    cwd: '/Users/Qiang/Documents/trae_projects/eduK12-new-version/server-version',
  }).toString().trim()
}

async function main() {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await studentLogin(page)
    record('login', true)

    const memorySessionId = await runMemory(page)
    record('memory-completed', true, memorySessionId)

    const stroopSessionId = await runStroop(page)
    record('stroop-completed', true, stroopSessionId)

    await page.goto(`${BASE}/student/cognitive/history`)
    await page.waitForSelector(`text=${MEMORY_ASSIGNMENT}`, { timeout: 10000 })
    await page.waitForSelector(`text=${STROOP_ASSIGNMENT}`, { timeout: 10000 })
    record('history-shows-completed-summaries', true)

    if (process.env.RUN_DB_CHECK === '1') {
      for (const [name, sessionId, expectedTrials] of [
        ['memory', memorySessionId, 4],
        ['stroop', stroopSessionId, 4],
      ]) {
        const count = dbCount(sessionId, 'SELECT count(*) FROM cognitive_trials WHERE session_id = \'SESSION_ID\';')
        record(`db-${name}-trial-count`, count === String(expectedTrials), `trials=${count}`)
        const encrypted = dbCount(sessionId, "SELECT count(*) FROM cognitive_trials WHERE session_id = 'SESSION_ID' AND payload_encrypted ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$';")
        record(`db-${name}-trials-encrypted`, encrypted === String(expectedTrials), `encrypted=${encrypted}`)
        const status = dbCount(sessionId, "SELECT status FROM cognitive_sessions WHERE id = 'SESSION_ID';")
        record(`db-${name}-session-completed`, status === 'COMPLETED', status)
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  let failed = 0
  for (const item of results) {
    if (!item.ok) failed++
    console.log(`${item.ok ? '✅' : '❌'} ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`)
  }
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('E2E ERROR:', error.message)
  process.exit(1)
})
