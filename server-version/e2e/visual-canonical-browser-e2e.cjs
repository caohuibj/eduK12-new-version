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

const visualOrganizationContext = {
  allowedActions: ['GOVERN', 'RUNS', 'REPORTING', 'DELIVERY'],
  organization: { id: 'visual-org', name: '示例学校', status: 'ACTIVE' },
  access: {
    organizationId: 'visual-org',
    organizationStatus: 'ACTIVE',
    userId: 'admin-visual-user',
    platformRole: 'SYSTEM_ADMIN',
    membershipId: 'visual-membership',
    orgRole: 'ORG_ADMIN',
    personas: ['TEACHER'],
    capabilities: ['PSYCHOLOGY_STAFF', 'REPORT_EXPORT'],
    explicitDenies: [],
    basis: ['ORG_ADMIN'],
    canGovern: true,
  },
}

const visualLongitudinalArtifact = {
  artifactId: 'visual-longitudinal-artifact',
  generatedAt: '2026-09-29T00:30:00.000Z',
  projection: {
    schemaVersion: 1,
    kind: 'MATCHED_LONGITUDINAL',
    mode: 'FULL_CASE',
    state: 'present',
    waveIds: ['visual-wave-1', 'visual-wave-2', 'visual-wave-3'],
    matchedEligibleN: 18,
    evidence: { level: 'PILOT', limitations: ['DESCRIPTIVE_ONLY'] },
    metrics: {
      engagement: {
        state: 'present',
        countKind: 'COMPLETE_CASE',
        validCaseN: 18,
        waveMeans: [
          { waveId: 'visual-wave-1', waveKey: '2026-03-01T00:00:00Z / T1', mean: 62.4 },
          { waveId: 'visual-wave-2', waveKey: '2026-05-01T00:00:00Z / T2', mean: 66.8 },
          { waveId: 'visual-wave-3', waveKey: '2026-07-01T00:00:00Z / T3', mean: 68.1 },
        ],
        comparisons: [
          {
            fromWaveId: 'visual-wave-1',
            toWaveId: 'visual-wave-2',
            comparability: { schemaVersion: 1, metricId: 'engagement', level: 'EXACT', allowedOperations: ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA'], evidenceRef: null, evidenceHash: null, limitations: [] },
            delta: 4.4,
          },
          {
            fromWaveId: 'visual-wave-2',
            toWaveId: 'visual-wave-3',
            comparability: { schemaVersion: 1, metricId: 'engagement', level: 'COMPATIBLE', allowedOperations: ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA'], evidenceRef: null, evidenceHash: null, limitations: [] },
            delta: 1.3,
          },
        ],
      },
      stress: {
        state: 'present',
        countKind: 'COMPLETE_CASE',
        validCaseN: 18,
        waveMeans: [
          { waveId: 'visual-wave-1', waveKey: '2026-03-01T00:00:00Z / T1', mean: 41.2 },
          { waveId: 'visual-wave-2', waveKey: '2026-05-01T00:00:00Z / T2', mean: 39.6 },
          { waveId: 'visual-wave-3', waveKey: '2026-07-01T00:00:00Z / T3', mean: 38.9 },
        ],
        comparisons: [
          {
            fromWaveId: 'visual-wave-1',
            toWaveId: 'visual-wave-2',
            comparability: { schemaVersion: 1, metricId: 'stress', level: 'NOT_COMPARABLE', allowedOperations: ['SIDE_BY_SIDE'], evidenceRef: null, evidenceHash: null, limitations: ['COMPARABILITY_EVIDENCE_REQUIRED'] },
          },
          {
            fromWaveId: 'visual-wave-2',
            toWaveId: 'visual-wave-3',
            comparability: { schemaVersion: 1, metricId: 'stress', level: 'LIMITED', allowedOperations: ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND'], evidenceRef: null, evidenceHash: null, limitations: ['LIMITED_COMPARABILITY'] },
          },
        ],
      },
      support: {
        state: 'suppressed',
      },
    },
  },
}

const visualPublicQuestionnaire = {
  id: 'visual-questionnaire',
  name: '学习体验匿名问卷',
  description: '了解近期学习体验与支持需求，用于公共参与界面的视觉验收。',
  instruction: '请根据最近两周的实际情况作答。没有标准答案，选择最符合您的情况即可。',
  estimatedTime: 8,
}

const visualPublicQuestionnaireAssessment = {
  questionnaireAssessment: {
    id: 'visual-q-session',
    status: 'IN_PROGRESS',
    progress: 0,
    currentIndex: 0,
    attemptEpoch: 1,
  },
  currentFormItem: {
    id: 'visual-form-item',
    type: 'text_input',
    label: '最近的学习中，哪件事最需要更多支持？',
    placeholder: '可以简要描述您的情况',
    required: false,
    position: 0,
    options: null,
    contextKey: null,
  },
  currentScale: null,
  contentItems: [
    { type: 'form', position: 0, id: 'visual-form-item', label: '学习支持', completed: false },
    { type: 'form', position: 1, id: 'visual-form-item-2', label: '后续体验', completed: false },
  ],
  totalItems: 2,
  sessionId: 'visual-q-session',
  currentFormAnswerRevision: 0,
}

const visualPublicQuestionnaireReport = {
  questionnaireId: 'visual-questionnaire',
  questionnaireName: '学习体验匿名问卷',
  completedAt: '2026-09-29T02:00:00.000Z',
  totalTime: 385000,
  totalDimensions: 2,
  backgroundValues: [
    { itemId: 'grade', type: 'FORM', kind: 'background', label: '年级', value: '八年级' },
    { itemId: 'context', type: 'FORM', kind: 'background', label: '参与场景', value: '课堂学习' },
  ],
  unitReports: [
    {
      itemId: 'visual-scale',
      type: 'SCALE',
      kind: 'scale',
      scaleId: 'visual-scale',
      scaleCode: 'VISUAL-PUBLIC',
      scaleName: '学习投入',
      reportKind: 'completion',
      dimensionScores: [],
      feedback: { overall: '', dimensions: [] },
      caveats: [],
      disclaimer: '结果仅用于本次匿名参与反馈。',
      completedAt: '2026-09-29T02:00:00.000Z',
      totalTime: 210000,
      method: { scaleId: 'visual-scale', scaleCode: 'VISUAL-PUBLIC', reportDefinitionVersion: 'visual-v1' },
    },
  ],
}

const visualPublicCheckin = {
  id: 'visual-checkin',
  title: '本周学习打卡',
  description: '记录一次本周最重要的学习进展。',
  content: '<p>可以填写文字，也可以补充图片。请不要填写可识别他人的敏感信息。</p>',
  images: [],
  videos: [],
  documents: [],
  endTime: '2026-12-31T12:00:00.000Z',
  createdAt: '2026-09-29T00:00:00.000Z',
  allowViewOthers: false,
}


const visualStudentAssignment = {
  id: 'visual-assignment',
  title: '本周学习反思作业',
  description: '回顾本周学习过程，并完成下面的简短问题。',
  content: '<p>请结合真实学习经历作答。内容会保存到您的课程作业记录中。</p>',
  deadline: '2026-12-31T12:00:00.000Z',
  videos: [],
  images: [],
  documents: [],
  questions: [
    { type: 'single_choice', question: '本周学习计划完成情况如何？', options: [{ key: 'a', text: '基本完成' }, { key: 'b', text: '完成一部分' }, { key: 'c', text: '需要重新安排' }] },
    { type: 'multiple_choice', question: '哪些因素帮助了你？', options: [{ key: 'a', text: '时间安排' }, { key: 'b', text: '同伴支持' }, { key: 'c', text: '教师反馈' }] },
    { type: 'text', question: '下周你最想调整的一件事是什么？' },
  ],
}

const visualStudentCheckin = {
  id: 'visual-student-checkin',
  title: '今日学习打卡',
  description: '记录今天完成的学习任务和一个值得保留的经验。',
  content: '<p>可填写文字，并按需补充图片。请不要上传包含他人敏感信息的内容。</p>',
  images: [],
  videos: [],
  documents: [],
  endTime: '2026-12-31T12:00:00.000Z',
  createdAt: '2026-09-29T00:00:00.000Z',
  allowViewOthers: false,
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
    else if (pathname === '/api/public/questionnaires/visual-questionnaire') data = { questionnaire: visualPublicQuestionnaire }
    else if (pathname === '/api/public/assessments/visual-q-session') data = visualPublicQuestionnaireAssessment
    else if (pathname === '/api/public/assessments/visual-q-session/report') data = visualPublicQuestionnaireReport
    else if (pathname === '/api/checkins/public/visual-checkin') data = {
      checkin: visualPublicCheckin,
      sessionId: 'visual-checkin-session',
      sessionCapability: 'visual-checkin-capability',
      sessionExpiresAt: '2026-12-31T12:00:00.000Z',
    }
    else if (pathname === '/api/assignments/visual-assignment') data = visualStudentAssignment
    else if (pathname === '/api/assignments/visual-assignment/my-submission') data = null
    else if (pathname === '/api/checkins/visual-student-checkin') data = visualStudentCheckin
    else if (pathname === '/api/checkins/visual-student-checkin/my-submission') data = null
    else if (pathname === '/api/organizations/visual-org/context') data = visualOrganizationContext
    else if (pathname === '/api/organizations/visual-org/reporting/specs') data = { list: [], total: 0, page: 1, pageSize: 100 }
    else if (pathname === '/api/organizations/visual-org/reporting/sources') data = { list: [], truncated: false, nextPage: null }
    else if (pathname === '/api/organizations/visual-org/reporting/cohort-options') data = { classes: [], dimensions: [], labels: [] }
    else if (pathname === '/api/organizations/visual-org/reporting/protected-sources') data = { list: [], truncated: false }
    else if (pathname === '/api/organizations/visual-org/reporting/artifacts/visual-longitudinal-artifact') data = visualLongitudinalArtifact
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
  {
    id: 'ui-lab',
    route: '/__ui-lab',
    role: null,
    ready: async (page) => {
      await page.getByRole('heading', { name: 'Huisurvey UI Lab', exact: true }).waitFor()
      await page.getByRole('heading', { name: '设计基础', exact: true }).waitFor()
      await page.getByRole('heading', { name: '纵向可视化状态', exact: true }).waitFor()
      await page.locator('.report-trend-chart svg').first().waitFor()
    },
  },
  {
    id: 'public-questionnaire-entry',
    route: '/public/questionnaire/visual-questionnaire',
    role: null,
    ready: (page) => page.getByRole('heading', { name: '学习体验匿名问卷', exact: true }).waitFor(),
  },
  {
    id: 'public-questionnaire-runner',
    route: '/public/questionnaire/visual-questionnaire/assessment?sessionId=visual-q-session',
    role: null,
    prepare: (page) => page.addInitScript(() => {
      sessionStorage.setItem('questionnaire_resume_visual-questionnaire', JSON.stringify({
        sessionId: 'visual-q-session',
        resumeToken: 'visual-resume-capability',
      }))
    }),
    ready: async (page) => {
      await page.getByRole('heading', { name: '匿名问卷', exact: true }).waitFor()
      await page.getByRole('heading', { name: '最近的学习中，哪件事最需要更多支持？', exact: true }).waitFor()
    },
  },
  {
    id: 'public-questionnaire-result',
    route: '/public/questionnaire/visual-questionnaire/result?sessionId=visual-q-session',
    role: null,
    prepare: (page) => page.addInitScript(() => {
      sessionStorage.setItem('questionnaire_resume_visual-questionnaire', JSON.stringify({
        sessionId: 'visual-q-session',
        resumeToken: 'visual-resume-capability',
      }))
    }),
    ready: async (page) => {
      await page.getByRole('heading', { name: '学习体验匿名问卷', exact: true }).waitFor()
      await page.getByText('各量表结果独立展示，不生成跨量表总体分。', { exact: true }).waitFor()
    },
  },
  {
    id: 'public-checkin',
    route: '/public/checkin/visual-checkin',
    role: null,
    ready: async (page) => {
      await page.getByRole('heading', { name: '本周学习打卡', exact: true }).waitFor()
      await page.getByRole('heading', { name: '提交打卡', exact: true }).waitFor()
    },
  },
  { id: 'portal', route: '/', role: null, ready: (page) => page.getByRole('heading', { name: '欢迎使用 Huisurvey', exact: true }).waitFor() },
  { id: 'student-login', route: '/student/login', role: null, ready: (page) => page.getByRole('heading', { name: '学生登录', exact: true }).waitFor() },
  { id: 'student-home', route: '/student', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '我的课程', exact: true }).waitFor() },
  {
    id: 'student-assignment-submit',
    route: '/student/assignments/visual-assignment',
    role: 'STUDENT',
    ready: async (page) => {
      await page.getByRole('heading', { name: '本周学习反思作业', exact: true }).waitFor()
      await page.getByRole('heading', { name: '提交作业', exact: true }).waitFor()
    },
  },
  {
    id: 'student-checkin-submit',
    route: '/student/checkins/visual-student-checkin',
    role: 'STUDENT',
    ready: async (page) => {
      await page.getByRole('heading', { name: '今日学习打卡', exact: true }).waitFor()
      await page.getByRole('heading', { name: '去打卡', exact: true }).waitFor()
    },
  },
  { id: 'student-scales', route: '/student/scales', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '心理测评', exact: true }).waitFor() },
  { id: 'scale-report', route: '/student/scales/result/visual-scale-assessment', role: 'STUDENT', ready: async (page) => {
    await page.getByRole('heading', { name: '学习自我调节量表', exact: true }).waitFor()
    await page.getByTestId('scale-core-feedback').waitFor()
    assert.equal(await page.getByTestId('scale-score-layer').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="scale-core-feedback"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'scores precede interpretation')
    assert.equal(await page.getByTestId('scale-caveats').evaluate(el => el.closest('details') === null), true, 'limitations remain expanded')
    assert.equal(await page.locator('.report-primary-score .report-range').count(), 1, 'total and range share one reading unit')
  } },
  { id: 'cognitive-history', route: '/student/cognitive/history', role: 'STUDENT', ready: (page) => page.getByRole('heading', { name: '认知测评历史', exact: true }).waitFor() },
  { id: 'classroom-enter', route: '/student/classroom/enter', role: null, ready: (page) => page.getByRole('heading', { name: '加入课堂', exact: true }).waitFor() },
  { id: 'parent-home', route: '/parent', role: 'PARENT', ready: (page) => page.getByRole('heading', { name: '家长首页', exact: true }).waitFor() },
  { id: 'staff-courses', route: '/courses', role: 'TEACHER', ready: (page) => page.getByRole('heading', { name: '课程管理', exact: true }).waitFor() },
  { id: 'staff-profile', route: '/profile', role: 'TEACHER', ready: (page) => page.getByRole('heading').filter({ hasText: '个人' }).first().waitFor() },
  {
    id: 'organization-longitudinal',
    route: '/organizations/visual-org/reporting',
    role: 'ADMIN',
    ready: async (page) => {
      await page.getByRole('heading', { name: '群体与纵向报告', exact: true }).waitFor()
      const advanced = page.getByText('高级设置：受保护反馈与历史报告读取', { exact: true })
      await advanced.click()
      await page.getByPlaceholder('artifact UUID').fill('visual-longitudinal-artifact')
      await page.getByRole('button', { name: '读取历史报告', exact: true }).click()
      await page.getByRole('heading', { name: '纵向趋势', exact: true }).waitFor()
      await page.getByText('允许描述趋势', { exact: true }).waitFor()
      await page.getByText('存在不可直接比较区段', { exact: true }).waitFor()
      await page.getByText(/图表不包含被抑制的统计值/).waitFor()
      await page.locator('.report-trend-chart svg').first().waitFor()
      await advanced.click()
    },
  },
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
        if (spec.prepare) await spec.prepare(page)

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
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
          await page.screenshot({ path: path.join(directory, `${viewport.name}.png`), fullPage: true })
          if (spec.id === 'scale-report' && viewport.name === 'desktop-1440') {
            await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' })
            await page.setViewportSize({ width: 794, height: 1123 })
            assert.equal(await page.locator('[data-report-screen-only]:visible').count(), 0, 'scale-report/print: screen-only controls must be hidden')
            assert.equal(await page.locator('.hui-app-header:visible').count(), 0, 'scale-report/print: app header must be hidden')
            await page.screenshot({ path: path.join(directory, 'a4-print.png'), fullPage: true })
          }
          if (spec.id === 'organization-longitudinal' && viewport.name === 'desktop-1440') {
            await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' })
            await page.setViewportSize({ width: 794, height: 1123 })
            await page.waitForTimeout(100)
            await page.locator('section[aria-labelledby="report-artifact-heading"]').screenshot({ path: path.join(directory, 'a4-report-artifact.png') })
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

module.exports = { installApiFixture, sampleCourse }

if (require.main === module) main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
