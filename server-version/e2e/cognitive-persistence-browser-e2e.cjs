// Milestone E Final Gate：容器重启后检查已完成的三类测评仍可从历史进入结果页。
const { chromium } = require('playwright')

const BASE = 'http://localhost'
const USER = process.env.COGNITIVE_E2E_USER || 'e2estudent'
const PASS = process.env.COGNITIVE_E2E_PASS || 'e2e123456'
const TITLES = [
  process.env.COGNITIVE_E2E_REACTION_ASSIGNMENT || 'E2E Reaction v2',
  process.env.COGNITIVE_E2E_MEMORY_ASSIGNMENT || 'E2E Memory Stable',
  process.env.COGNITIVE_E2E_STROOP_ASSIGNMENT || 'E2E Stroop v2',
]

async function login(page) {
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

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await login(page)
    const checks = []
    for (const title of TITLES) {
      await page.goto(`${BASE}/student/cognitive/history`)
      const card = page.getByRole('button', { name: new RegExp(title) }).first()
      await card.waitFor({ state: 'visible', timeout: 10000 })
      await card.click()
      await page.waitForURL('**/student/cognitive/sessions/**/result', { timeout: 10000 })
      const sessionId = page.url().split('/sessions/')[1].split('/')[0]
      const result = await page.evaluate(async (id) => {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/cognitive/sessions/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        return response.json()
      }, sessionId)
      checks.push({
        title,
        status: result?.data?.status,
        hasMetrics: !!result?.data?.result?.metrics,
        referenceVersion: result?.data?.result?.reference?.version ?? null,
      })
    }

    const failed = checks.filter((item) =>
      item.status !== 'COMPLETED' || !item.hasMetrics || item.referenceVersion !== 'sim-k12-v0.1'
    )
    checks.forEach((item) => console.log(`${failed.includes(item) ? '❌' : '✅'} ${item.title} :: status=${item.status} reference=${item.referenceVersion}`))
    console.log(failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`)
    process.exit(failed.length === 0 ? 0 : 1)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('E2E ERROR:', error.message)
  process.exit(1)
})
