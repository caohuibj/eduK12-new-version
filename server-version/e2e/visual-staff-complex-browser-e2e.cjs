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
  id: 'teacher-visual-user',
  role: 'TEACHER',
  username: 'teacher-visual',
  nickname: '视觉验收教师',
  mustChangePassword: false,
}

const course = {
  id: 'visual-course',
  title: '示例成长课程',
  description: '用于复杂 Staff 页面视觉验收的确定性课程。',
  courseCode: 'VISUAL',
  studentCount: 24,
  createdAt: '2026-09-01T00:00:00.000Z',
  status: 'PUBLISHED',
  isRecruiting: true,
  isLibrary: false,
  creatorId: teacher.id,
  creator: { id: teacher.id, username: teacher.username, nickname: teacher.nickname, role: teacher.role },
  coverUrl: null,
}

const assignment = {
  id: 'visual-staff-assignment',
  courseId: course.id,
  title: '单元学习反思',
  description: '用于 Staff 复杂控制器视觉验收的示例作业。',
  content: '<p>请完成单元学习反思。</p>',
  deadline: '2026-12-20T12:00:00.000Z',
  status: 'PUBLISHED',
  tags: ['反思', '单元学习'],
  questions: [
    { type: 'single_choice', question: '本单元掌握程度如何？', options: [{ key: 'a', text: '较好' }, { key: 'b', text: '需要复习' }] },
    { type: 'text', question: '下一步准备如何调整？' },
  ],
  videos: [],
  images: [],
  documents: [],
  course,
  _count: { submissions: 18 },
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

    if (pathname === '/api/capabilities') data = { cognitive: true }
    else if (pathname === '/api/auth/me' || pathname === '/api/users/me') data = teacher
    else if (pathname === '/api/auth/csrf') data = { csrfToken: 'staff-visual-csrf' }
    else if (pathname === '/api/courses') data = { list: [course], total: 1 }
    else if (pathname === '/api/courses/shared-to-me') data = { list: [] }
    else if (pathname === '/api/assignments') data = { list: [assignment], total: 1 }
    else if (pathname === '/api/assignments/tags') data = { tags: ['反思', '单元学习'] }
    else if (pathname === '/api/organizations') data = { list: [], total: 0, page: 1, pageSize: 24, allowedActions: [], platformRole: 'STANDARD' }

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
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    viewport: { width: innerWidth, height: innerHeight },
  }))
}

async function main() {
  const directory = path.join(output, 'staff-assignment-management')
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
        const response = await page.goto(baseUrl + '/assignments', { waitUntil: 'domcontentloaded' })
        assert.equal(response?.status(), 200, `${viewport.name}: assignment management document failed`)
        await page.getByRole('heading', { name: '作业管理', exact: true }).waitFor()
        await page.getByRole('button', { name: '布置作业', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByRole('heading', { name: '布置作业', exact: true }).waitFor()

        const metrics = await metricsFor(page)
        assert.ok(metrics.scrollWidth <= viewport.width + 1, `${viewport.name}: page-level horizontal overflow`)
        assert.deepEqual(pageErrors, [], `${viewport.name}: uncaught browser error`)
        assert.equal(requests.some((request) => request.method !== 'GET'), false, `${viewport.name}: visual capture attempted a write API`)

        for (const name of ['取消', '创建作业']) {
          const box = await dialog.getByRole('button', { name, exact: true }).boundingBox()
          assert.ok(box && box.height >= 44, `${viewport.name}: ${name} touch target is below 44px`)
          assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${viewport.name}: ${name} action is outside the visible dialog viewport`)
        }

        await page.screenshot({ path: path.join(directory, `${viewport.name}.png`), fullPage: true })
        report.push({ viewport, metrics, pageErrors, passed: true })
      } finally {
        await context.close()
      }
    }

    fs.writeFileSync(path.join(directory, 'qa.json'), JSON.stringify({ schemaVersion: 1, cases: report }, null, 2))
    console.log('Staff complex visual QA passed: 3 assignment-management captures.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
