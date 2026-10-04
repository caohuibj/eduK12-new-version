const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')

const baseUrl = (process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const output = process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-visual-qa'
const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
]

const teacher = {
  id: 'teacher-classroom-visual',
  role: 'TEACHER',
  username: 'teacher-classroom-visual',
  nickname: '课堂视觉验收教师',
  mustChangePassword: false,
}

const classroom = {
  id: 'visual-classroom',
  code: 'CL2026',
  name: '示例课堂互动',
  status: 'PREPARING',
  course: {
    id: 'visual-course',
    title: '示例成长课程',
  },
  questions: [
    {
      id: 'visual-question-1',
      questionIndex: 1,
      questionContent: {
        type: 'single_choice',
        question: '本节课最重要的概念是什么？',
        options: [
          { value: 'A', label: '概念 A' },
          { value: 'B', label: '概念 B' },
        ],
      },
      timeLimit: 60,
      startedAt: null,
      endedAt: null,
    },
    {
      id: 'visual-question-2',
      questionIndex: 2,
      questionContent: {
        type: 'multiple_choice',
        question: '哪些证据支持你的判断？',
        options: [
          { value: 'A', label: '证据 A' },
          { value: 'B', label: '证据 B' },
        ],
      },
      timeLimit: 90,
      startedAt: null,
      endedAt: null,
    },
  ],
}

const envelope = (data, code = 0, message = 'ok') => ({ code, message, data })

async function installApiFixture(page) {
  const requests = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (!pathname.startsWith('/api/')) return route.continue()

    requests.push({ method: request.method(), pathname })

    if (request.method() !== 'GET') {
      return route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify(envelope(null, 405, 'visual QA is read-only')),
      })
    }

    let status = 200
    let data = { list: [], total: 0, totalPages: 1, hasMore: false }

    if (pathname === '/api/capabilities') data = { cognitive: true, parentPortal: false }
    else if (pathname === '/api/auth/me' || pathname === '/api/users/me') data = teacher
    else if (pathname === '/api/auth/csrf') data = { csrfToken: 'classroom-visual-csrf' }
    else if (pathname === '/api/classrooms/visual-classroom') data = classroom
    else if (pathname.startsWith('/api/organizations')) {
      data = { list: [], total: 0, page: 1, pageSize: 24, allowedActions: [], platformRole: 'STANDARD' }
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(envelope(data, status === 200 ? 0 : status)),
    })
  })

  return requests
}

async function metricsFor(page) {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
  }))
}

async function main() {
  const directory = path.join(output, 'classroom-teacher-control')
  fs.mkdirSync(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: process.env.VISUAL_QA_BROWSER_CHANNEL || undefined })
  const report = []

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      page.setDefaultNavigationTimeout(30000)
      await page.emulateMedia({ reducedMotion: 'reduce' })

      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      const requests = await installApiFixture(page)

      try {
        const response = await page.goto(baseUrl + '/teacher/classrooms/visual-classroom/control', { waitUntil: 'domcontentloaded' })
        assert.equal(response?.status(), 200, `${viewport.name}: classroom control document failed`)

        await page.getByRole('heading', { name: '示例课堂互动', exact: true }).waitFor()
        await page.getByRole('heading', { name: '答题控制', exact: true }).waitFor()
        await page.getByText('等待选择题目', { exact: true }).waitFor()
        await page.getByText('本节课最重要的概念是什么？', { exact: false }).waitFor()

        const metrics = await metricsFor(page)
        assert.ok(
          metrics.document.scrollWidth <= viewport.width + 1,
          `${viewport.name}: page-level horizontal overflow`,
        )
        assert.deepEqual(pageErrors, [], `${viewport.name}: uncaught browser error`)
        assert.equal(
          requests.some((request) => request.method !== 'GET'),
          false,
          `${viewport.name}: visual capture attempted a write API`,
        )

        for (const name of ['答题控制', '课堂列表', '关闭课堂']) {
          const control = page.getByRole(name === '课堂列表' ? 'link' : 'button', { name, exact: true }).first()
          const box = await control.boundingBox()
          assert.ok(box && box.height >= 44, `${viewport.name}: ${name} touch target is below 44px`)
        }

        await page.screenshot({
          path: path.join(directory, `${viewport.name}.png`),
          fullPage: true,
        })

        report.push({ viewport, metrics, pageErrors, passed: true })
      } finally {
        await context.close()
      }
    }

    fs.writeFileSync(
      path.join(directory, 'qa.json'),
      JSON.stringify({ schemaVersion: 1, cases: report }, null, 2),
    )
    console.log('Classroom teacher-control visual QA passed: 3 captures.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
