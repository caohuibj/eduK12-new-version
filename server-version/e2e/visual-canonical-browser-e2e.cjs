/* Canonical visual QA: deterministic screenshots + structural layout assertions.
 * This is intentionally NOT a pixel-diff test. Screenshots are retained as CI
 * evidence; the hard gates are page readiness, no uncaught errors and no
 * page-level horizontal overflow at the canonical viewports.
 */
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

const userFor = (role) => role ? {
  id: `${role.toLowerCase()}-visual-user`,
  role,
  username: `${role.toLowerCase()}-visual`,
  nickname: role === 'STUDENT' ? '视觉验收同学' : role === 'PARENT' ? '视觉验收家长' : '视觉验收教师',
  mustChangePassword: false,
} : null

const sampleCourse = {
  id: 'visual-course',
  title: '示例成长课程',
  description: '用于视觉验收的确定性课程卡片。',
  courseCode: 'VISUAL',
  studentCount: 24,
  createdAt: '2026-09-01T00:00:00.000Z',
  status: 'PUBLISHED',
  isRecruiting: true,
  isLibrary: false,
  creatorId: 'teacher-visual-user',
  creator: { id: 'teacher-visual-user', username: 'teacher-visual', nickname: '视觉验收教师', role: 'TEACHER' },
  coverUrl: null,
}

const visualScaleReport = {
  id: 'visual-scale-assessment',
  status: 'COMPLETED',
  startedAt: '2026-09-28T08:00:00.000Z',
  completedAt: '2026-09-28T08:12:00.000Z',
  totalTime: 720000,
  scale: {
    id: 'visual-scale',
    code: 'VISUAL-MULTI',
    name: '学习自我调节量表',
    description: '用于报告视觉验收的确定性多维量表。',
  },
  report: {
    schemaVersion: 1,
    kind: 'full',
    instrument: { scaleId: 'visual-scale', code: 'VISUAL-MULTI', name: '学习自我调节量表', instrumentVersion: '1.0.0' },
    completedAt: '2026-09-28T08:12:00.000Z',
    totalTime: 720000,
    quality: { status: 'interpretable', flags: [] },
    scores: [
      { key: 'total', type: 'total', label: '总体自我调节', direction: 'higher_is_more', canonical: true, displayPrecision: 1, value: 72, range: { min: 0, max: 100 }, status: 'calculated', prorated: false },
      { key: 'planning', type: 'dimension', label: '学习计划', direction: 'higher_is_more', canonical: false, displayPrecision: 1, value: 18, range: { min: 0, max: 25 }, status: 'calculated', prorated: false },
      { key: 'persistence', type: 'dimension', label: '坚持性', direction: 'higher_is_more', canonical: false, displayPrecision: 1, value: 14, range: { min: 0, max: 20 }, status: 'calculated', prorated: false },
      { key: 'monitoring', type: 'dimension', label: '自我监控', direction: 'higher_is_more', canonical: false, displayPrecision: 1, value: 21, range: { min: 0, max: 30 }, status: 'calculated', prorated: false },
      { key: 'emotion', type: 'dimension', label: '情绪调节', direction: 'descriptive', canonical: false, displayPrecision: 1, value: 12, range: { min: 0, max: 20 }, status: 'calculated', prorated: false },
    ],
    references: [
      {
        scoreKey: 'planning',
        referenceVersion: 'visual-ref-v1',
        referenceKind: 'descriptive_sample',
        evidenceLevel: 'literature_beta',
        status: 'available',
        label: '文献描述性样本',
        value: 18,
        mean: 16.4,
        sd: 3.2,
        z: 0.5,
        t: null,
        percentile: null,
        criterionBand: null,
        meanDifference: 1.6,
        source: { citation: 'Visual QA illustrative source', publicationYear: 2026, sampleSize: 240 },
        population: { description: '用于视觉验收的示意样本' },
        instrumentVersion: '1.0.0',
        scoringVersion: '1.0.0',
        limitations: ['仅用于视觉验收。'],
        disclaimer: '示意 reference，不代表真实常模。',
      },
      {
        scoreKey: 'monitoring',
        referenceVersion: 'visual-band-v1',
        referenceKind: 'criterion_threshold',
        evidenceLevel: 'literature_beta',
        status: 'available',
        label: '来源定义区间',
        value: 21,
        mean: null,
        sd: null,
        z: null,
        t: null,
        percentile: null,
        criterionBand: { key: 'visual-band', label: '来源定义区间', minInclusive: 15, maxInclusive: 22.5 },
        meanDifference: null,
        source: { citation: 'Visual QA illustrative criterion' },
        population: null,
        instrumentVersion: '1.0.0',
        scoringVersion: '1.0.0',
        limitations: ['仅用于视觉验收。'],
        disclaimer: '示意区间，不代表临床 cutoff。',
      },
    ],
    interpretations: [
      { scoreKey: 'total', headline: '总体结果概览', label: '总体自我调节', interpretation: '本次结果包含一个总体结果和四个独立维度。', guidance: [{ category: 'reflection', text: '结合近期学习任务理解各维度。' }], limitations: [], referenceVersion: null },
      { scoreKey: 'planning', headline: '学习计划', label: '计划维度', interpretation: '能够形成较明确的学习计划。', guidance: [{ category: 'strategy', text: '多任务时继续关注优先级安排。' }], limitations: [], referenceVersion: 'visual-ref-v1' },
    ],
    method: { scaleId: 'visual-scale', instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', referenceVersions: ['visual-ref-v1', 'visual-band-v1'], assessmentContext: null },
    caveats: ['不同维度使用各自原始范围，不应仅按条形长度直接比较。'],
    disclaimer: '结果仅反映本次作答，不构成医学诊断或人口常模。',
  },
}

const envelope = (data, code = 0, message = 'ok') => ({ code, message, data })

async function installApiFixture(page, role) {
  const user = userFor(role)
  const requests = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    if (!pathname.startsWith('/api/')) return route.continue()
    requests.push({ method: request.method(), pathname })
    if (request.method() !== 'GET') {
      return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify(envelope(null, 405, 'visual QA is read-only')) })
    }

    let status = 200
    let data = { list: [], total: 0, totalPages: 1, hasMore: false }

    if (pathname === '/api/capabilities') data = { cognitive: true }
    else if (pathname === '/api/auth/me' || pathname === '/api/users/me') {
      if (user) data = user
      else { status = 401; data = null }
    } else if (pathname === '/api/auth/csrf') data = { csrfToken: 'visual-qa-csrf' }
    else if (pathname === '/api/courses/my') data = { list: [sampleCourse] }
    else if (pathname === '/api/courses') data = { list: [sampleCourse], total: 1 }
    else if (pathname === '/api/courses/shared-to-me') data = { list: [] }
    else if (pathname === '/api/scales/available') data = { list: [] }
    else if (pathname === '/api/scales/assessments/visual-scale-assessment') data = visualScaleReport
    else if (pathname === '/api/scale-library') data = { schemaVersion: 1, generatedAt: '2026-09-28T00:00:00.000Z', entries: [] }
    else if (pathname.startsWith('/api/cognitive/history')) data = { list: [], total: 0, totalPages: 1, hasMore: false }
    else if (pathname.startsWith('/api/organizations')) data = {
      allowedActions: role === 'ADMIN' ? ['CREATE_ORGANIZATION'] : [],
      platformRole: role === 'ADMIN' ? 'SYSTEM_ADMIN' : 'STANDARD',
      list: [],
      total: 0,
      page: 1,
      pageSize: 24,
    }
    else if (pathname.includes('/public/cognitive/sessions/')) { status = 404; data = null }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(envelope(data, status === 200 ? 0 : status, status === 200 ? 'ok' : '测评不可访问')),
    })
  })
  return requests
}

const cases = [
  { id: 'portal', route: '/', role: null, ready: (page) => page.getByRole('heading', { name: '欢迎使用 Huisurvey', exact: true }).waitFor() },
  { id: 'student-login', route: '/student/login', role: null, ready: (page) => page.getByRole('heading', { name: '学生登录', exact: true }).waitFor() },
  { id: 'student-home', route: '/student', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '我的课程', exact: true }).waitFor() },
  { id: 'student-scales', route: '/student/scales', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '心理测评', exact: true }).waitFor() },
  { id: 'scale-report', route: '/student/scales/result/visual-scale-assessment', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '学习自我调节量表', exact: true }).waitFor() },
  { id: 'cognitive-history', route: '/student/cognitive/history', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '认知测评历史', exact: true }).waitFor() },
  { id: 'classroom-enter', route: '/student/classroom/enter', role: null, ready: (page) => page.getByRole('heading', { name: '加入课堂', exact: true }).waitFor() },
  { id: 'parent-home', route: '/parent', role: 'PARENT', ready: (page) => page.getByRole('heading', { name: '家长首页', exact: true }).waitFor() },
  { id: 'staff-courses', route: '/courses', role: 'TEACHER', ready: (page) => page.getByRole('heading', { name: '课程管理', exact: true }).waitFor() },
  { id: 'staff-profile', route: '/profile', role: 'TEACHER', ready: (page) => page.getByRole('heading').filter({ hasText: '个人' }).first().waitFor() },
  { id: 'organization-index', route: '/organizations', role: 'ADMIN', ready: (page) => page.getByRole('heading', { name: '组织空间', exact: true }).waitFor() },
  { id: 'scale-library', route: '/scale-library', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '量表库', exact: true }).waitFor() },
  { id: 'public-recovery', route: '/public/cognitive/sessions/visual-session', role: null, ready: (page) => page.getByText('需要恢复凭证', { exact: true }).waitFor() },
]

async function metricsFor(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const interactive = Array.from(document.querySelectorAll('button, a[href], input, select, textarea, summary')).filter(visible)
    const smallTargets = interactive
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          tag: node.tagName.toLowerCase(),
          text: (node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 80),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }
      })
      .filter((box) => box.width < 44 || box.height < 44)
      .slice(0, 30)
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      visibleInteractiveCount: interactive.length,
      smallTargetCount: smallTargets.length,
      smallTargets,
    }
  })
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: process.env.VISUAL_QA_BROWSER_CHANNEL || undefined })
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), cases: [] }

  try {
    for (const spec of cases) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
        const page = await context.newPage()
        page.setDefaultTimeout(20000)
        page.setDefaultNavigationTimeout(30000)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const pageErrors = []
        page.on('pageerror', (error) => pageErrors.push(error.message))
        const apiRequests = await installApiFixture(page, spec.role)

        try {
          const response = await page.goto(baseUrl + spec.route, { waitUntil: 'domcontentloaded' })
          assert.equal(response?.status(), 200, `${spec.id}/${viewport.name}: document failed`)
          await spec.ready(page)
          await page.locator('#hui-main').waitFor({ state: 'visible' })
          await page.evaluate(() => document.fonts?.ready)
          const metrics = await metricsFor(page)
          assert.ok(metrics.document.scrollWidth <= viewport.width + 1,
            `${spec.id}/${viewport.name}: page-level horizontal overflow ${metrics.document.scrollWidth} > ${viewport.width}`)
          assert.deepEqual(pageErrors, [], `${spec.id}/${viewport.name}: uncaught browser error`)
          assert.equal(apiRequests.some((request) => request.method !== 'GET'), false,
            `${spec.id}/${viewport.name}: canonical capture attempted a write API`)

          const directory = path.join(output, spec.id)
          fs.mkdirSync(directory, { recursive: true })
          await page.screenshot({ path: path.join(directory, `${viewport.name}.png`), fullPage: true })
          if (spec.id === 'scale-report' && viewport.name === 'desktop-1440') {
            await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' })
            await page.setViewportSize({ width: 794, height: 1123 })
            assert.equal(await page.locator('[data-report-screen-only]:visible').count(), 0, 'scale-report/print: screen-only controls must be hidden')
            assert.equal(await page.locator('.hui-app-header:visible').count(), 0, 'scale-report/print: app header must be hidden')
            await page.screenshot({ path: path.join(directory, 'a4-print.png'), fullPage: true })
          }
          report.cases.push({
            id: spec.id,
            route: spec.route,
            role: spec.role || 'GUEST',
            viewport,
            metrics,
            pageErrors,
            passed: true,
          })
        } catch (error) {
          const directory = path.join(output, spec.id)
          fs.mkdirSync(directory, { recursive: true })
          await page.screenshot({ path: path.join(directory, `${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined)
          report.cases.push({ id: spec.id, route: spec.route, role: spec.role || 'GUEST', viewport, pageErrors, passed: false, error: error.message })
          throw error
        } finally {
          await context.close()
        }
      }
    }
    fs.writeFileSync(path.join(output, 'visual-qa.json'), JSON.stringify(report, null, 2))
    console.log(`Canonical visual QA passed: ${report.cases.length} captures across ${cases.length} screens and ${viewports.length} viewports.`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
