const assert = require('node:assert/strict')
const { chromium } = require('../backend/node_modules/playwright-core')

const baseUrl = process.env.RELATIONAL_E2E_BASE_URL || 'http://127.0.0.1:5173'
const envelope = (data) => ({ code: 0, message: 'success', data })
const json = (route, data, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(data),
})

const product = {
  resourceKind: 'BUNDLE',
  resourceKey: 'relational-browser-fixture',
  resourceVersion: '1.0.0',
  title: '课堂关系体验',
  description: null,
  scienceMaturity: 'PILOT',
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  minimumRespondents: 3,
  journeys: ['STUDENT_EXPERIENCE', 'TEACHER_COHORT_REPORT'],
}

const taskBase = {
  assignmentId: 'assignment-browser-1',
  episodeId: 'episode-browser-1',
  subjectUserId: 'teacher-browser',
  subjectRole: 'TEACHER',
  respondentRole: 'STUDENT',
  perspective: 'RELATIONAL_EXPERIENCE',
  relationshipKind: 'COURSE_TEACHER_STUDENT',
  resourceKind: 'BUNDLE',
  resourceKey: product.resourceKey,
  resourceVersion: product.resourceVersion,
  analysisMode: 'COHORT_AGGREGATE',
  minimumRespondents: 3,
  createdAt: '2026-09-18T00:00:00.000Z',
  startedAt: '2026-09-18T00:01:00.000Z',
  completedAt: '2026-09-18T00:05:00.000Z',
  consentRequired: false,
  launchable: false,
  product,
}

const installMocks = async (page, role) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const user = {
      id: `${role.toLowerCase()}-browser`,
      username: `${role.toLowerCase()}-browser`,
      role,
      mustChangePassword: false,
    }
    if (path === '/api/auth/me') return json(route, envelope(user))
    if (path === '/api/capabilities') return json(route, envelope({ cognitive: true, parentPortal: false }))
    // RA-02 is a route-mocked frontend acceptance and does not establish a real
    // cookie session. AppShell now performs Organization discovery for signed-in
    // identities, so keep that shell request inside the same mocked authority
    // boundary. Letting it fall through to the live backend would correctly
    // return 401 and make the transport invalidate this synthetic login.
    if (path === '/api/organizations') {
      return json(route, envelope({
        platformRole: 'STANDARD',
        list: [],
        total: 0,
        page: 1,
        pageSize: 100,
      }))
    }

    if (path === '/api/relational-assessments/catalog') {
      if (role === 'TEACHER') return json(route, envelope({ list: [{ ...product, journeys: ['TEACHER_COHORT_REPORT'] }] }))
      if (role === 'STUDENT') return json(route, envelope({ list: [product] }))
      return json(route, envelope({ list: [] }))
    }
    if (path === '/api/relational-assessments/tasks') {
      if (role === 'STUDENT') return json(route, envelope({ list: [{ ...taskBase, status: 'COMPLETED' }] }))
      if (role === 'PARENT') {
        return json(route, envelope({ list: [{
          ...taskBase,
          assignmentId: 'assignment-parent-browser',
          subjectUserId: 'student-browser',
          subjectRole: 'STUDENT',
          respondentRole: 'PARENT',
          perspective: 'OBSERVER_REPORT',
          relationshipKind: 'PARENT_CHILD',
          analysisMode: 'INDIVIDUAL_ONLY',
          minimumRespondents: null,
          status: 'OPEN',
          startedAt: null,
          completedAt: null,
          consentRequired: true,
          product: null,
        }] }))
      }
      return json(route, envelope({ list: [] }))
    }
    if (path === '/api/relational-assessments/context/parent-children') return json(route, envelope({ list: [] }))
    if (path === '/api/relational-assessments/context/student-courses') {
      return json(route, envelope({ list: [{
        courseId: 'course-browser',
        title: '浏览器验收课程',
        teacher: { userId: 'teacher-browser', displayName: '教师' },
      }] }))
    }
    if (path === '/api/courses') {
      return json(route, envelope({ list: [{ id: 'course-browser', title: '浏览器验收课程' }] }))
    }
    if (path === '/api/relational-assessments/context/courses/course-browser/roster') {
      return json(route, envelope({ courseId: 'course-browser', title: '浏览器验收课程', roster: [] }))
    }
    if (path === '/api/relational-assessments/reports/cohort') {
      return json(route, envelope({
        courseId: 'course-browser',
        resourceKind: product.resourceKind,
        resourceKey: product.resourceKey,
        resourceVersion: product.resourceVersion,
        title: product.title,
        minimumRespondents: 3,
        respondentCount: null,
        state: 'INSUFFICIENT',
        snapshot: null,
      }))
    }
    return route.continue()
  })
}

const relationalAcceptance = async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PR5_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PR5_CHROMIUM_EXECUTABLE } : {}) })
  try {
    for (const role of ['PARENT', 'STUDENT', 'TEACHER', 'ADMIN']) {
      const context = await browser.newContext()
      const page = await context.newPage()
      await installMocks(page, role)
      await page.goto(`${baseUrl}/relational/tasks`, { waitUntil: 'domcontentloaded' })

      if (role === 'PARENT') {
        await page.getByRole('heading', { name: '观察测评', exact: true }).waitFor()
        // The heading renders before asynchronous task loading completes.
        const consentButton = page.getByRole('button', { name: '同意并继续', exact: true })
        await consentButton.waitFor({ state: 'visible' })
        assert.equal(await consentButton.count(), 1)
      } else if (role === 'STUDENT') {
        await page.getByRole('heading', { name: '课堂与关系体验', exact: true }).waitFor()
        await page.getByText('此类体验测评不提供个人结果页').waitFor()
        assert.equal(await page.getByRole('button', { name: '查看结果' }).count(), 0, 'student cohort task must not expose an individual report button')
      } else if (role === 'TEACHER') {
        await page.getByRole('heading', { name: '关系测评', exact: true }).waitFor()
        await page.getByText('阈值前不显示精确参与人数').waitFor()
        assert.equal(await page.getByTestId('relational-cohort-reports').getByText(/N=1|1 人有效/u).count(), 0, 'sub-threshold cohort must not disclose exact N')
      } else {
        await page.getByText('当前账户无法访问此页面', { exact: true }).waitFor()
        assert.equal(await page.getByTestId('relational-task-list').count(), 0, 'admin must not enter respondent relational product surface')
      }
      await context.close()
    }
    console.log('RA-02 four-role relational browser acceptance passed')
  } finally {
    await browser.close()
  }
}

relationalAcceptance().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
