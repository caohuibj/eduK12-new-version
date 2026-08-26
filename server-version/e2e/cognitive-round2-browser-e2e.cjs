// Round 2 browser Gate.
//
// This harness is intentionally fixture-backed and does not seed, migrate, or
// query a database. It may mutate only the explicitly isolated Gate service
// through the normal HTTP contract (the package grant and, for a draft
// assessment fixture, package instantiation/publish in scenario 2). The
// package definition used by the authorization scenario must already be
// PUBLISHED; the assessment fixture may remain DRAFT until the teacher
// instantiates and publishes that package-backed assessment. The fixture
// manifest contains IDs and expected labels, never credentials.
//
// Required before running:
//   COGNITIVE_R2_E2E_ISOLATED_DB=1
//   COGNITIVE_R2_E2E_FIXTURE_FILE=/path/to/pr14-e2e-fixtures.json
//   COGNITIVE_R2_E2E_TEACHER_USERNAME / COGNITIVE_R2_E2E_TEACHER_PASSWORD
//   COGNITIVE_R2_E2E_STUDENT_USERNAME / COGNITIVE_R2_E2E_STUDENT_PASSWORD
//   COGNITIVE_R2_E2E_ADMIN_USERNAME / COGNITIVE_R2_E2E_ADMIN_PASSWORD
//   COGNITIVE_R2_E2E_UNAUTHORIZED_TEACHER_USERNAME /
//     COGNITIVE_R2_E2E_UNAUTHORIZED_TEACHER_PASSWORD
//
// Run with the Playwright Chromium bundled in backend/node_modules:
//   node server-version/e2e/cognitive-round2-browser-e2e.cjs

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const { chromium } = require('../backend/node_modules/playwright-core')

const BASE_URL = (process.env.COGNITIVE_E2E_BASE_URL || 'http://127.0.0.1').replace(/\/$/, '')
const FIXTURE_FILE = process.env.COGNITIVE_R2_E2E_FIXTURE_FILE
const SHOT_DIR = process.env.COGNITIVE_R2_E2E_SCREENSHOT_DIR || '/tmp/eduk12-pr14-browser-e2e'
const configuredBrowserExecutable = process.env.COGNITIVE_E2E_BROWSER_EXECUTABLE
const browserCandidates = configuredBrowserExecutable
  ? [configuredBrowserExecutable]
  : [
      chromium.executablePath(),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
const BROWSER_EXECUTABLE = browserCandidates.find((candidate) => fs.existsSync(candidate))

const credentials = {
  teacher: {
    username: process.env.COGNITIVE_R2_E2E_TEACHER_USERNAME,
    password: process.env.COGNITIVE_R2_E2E_TEACHER_PASSWORD,
  },
  student: {
    username: process.env.COGNITIVE_R2_E2E_STUDENT_USERNAME,
    password: process.env.COGNITIVE_R2_E2E_STUDENT_PASSWORD,
  },
  admin: {
    username: process.env.COGNITIVE_R2_E2E_ADMIN_USERNAME,
    password: process.env.COGNITIVE_R2_E2E_ADMIN_PASSWORD,
  },
  unauthorizedTeacher: {
    username: process.env.COGNITIVE_R2_E2E_UNAUTHORIZED_TEACHER_USERNAME,
    password: process.env.COGNITIVE_R2_E2E_UNAUTHORIZED_TEACHER_PASSWORD,
  },
}

const required = (value, label) => {
  assert.ok(typeof value === 'string' && value.length > 0, `Missing ${label}`)
  return value
}

const loadFixtures = () => {
  required(FIXTURE_FILE, 'COGNITIVE_R2_E2E_FIXTURE_FILE')
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
  for (const name of ['collection', 'package', 'qualityFailure', 'k12Core', 'multisource', 'reanalysis']) {
    assert.ok(fixture[name] && typeof fixture[name] === 'object', `Fixture is missing ${name}`)
    required(fixture[name].assessmentId, `${name}.assessmentId`)
    required(fixture[name].attemptId, `${name}.attemptId`)
  }
  required(fixture.package.key, 'package.key')
  required(fixture.package.version, 'package.version')
  required(fixture.package.teacherId, 'package.teacherId')
  required(fixture.qualityFailure.validUnitLabel, 'qualityFailure.validUnitLabel')
  required(fixture.multisource.packageKey, 'multisource.packageKey')
  required(fixture.reanalysis.packageKey, 'reanalysis.packageKey')
  assert.ok(Array.isArray(fixture.collection.unitLabels) && fixture.collection.unitLabels.length > 0, 'collection.unitLabels must not be empty')
  assert.ok(Array.isArray(fixture.package.slotLabels) && fixture.package.slotLabels.length > 0, 'package.slotLabels must not be empty')
  assert.ok(Array.isArray(fixture.multisource.expectedFindingTypes) && fixture.multisource.expectedFindingTypes.length > 0, 'multisource.expectedFindingTypes must not be empty')
  required(fixture.reanalysis.completionSnapshotId, 'reanalysis.completionSnapshotId')
  required(fixture.k12Core.historyPath, 'k12Core.historyPath')
  required(fixture.k12Core.historyLabel, 'k12Core.historyLabel')
  return fixture
}

const assertCredentials = () => {
  for (const [role, value] of Object.entries(credentials)) {
    required(value.username, `COGNITIVE_R2_E2E_${role.toUpperCase()}_USERNAME`)
    required(value.password, `COGNITIVE_R2_E2E_${role.toUpperCase()}_PASSWORD`)
  }
}

const jsonFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, init: requestInit }) => {
  const token = localStorage.getItem('token')
  const headers = {
    ...(requestInit.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const response = await fetch(`/api${pathName}`, { ...requestInit, headers })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}, { endpoint, init })

const binaryFetch = async (page, endpoint) => page.evaluate(async (pathName) => {
  const token = localStorage.getItem('token')
  const response = await fetch(`/api${pathName}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const bytes = await response.arrayBuffer()
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    size: bytes.byteLength,
  }
}, endpoint)

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const login = async (page, route, account) => {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入用户名').fill(account.username)
  await page.getByPlaceholder('请输入密码').fill(account.password)
  await Promise.all([
    page.waitForFunction(() => Boolean(localStorage.getItem('token')), null, { timeout: 30000 }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
  const me = assertSuccess(await jsonFetch(page, '/auth/me'), '登录后身份')
  return me
}

const logout = async (page) => {
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  })
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
}

const bodyText = async (page) => page.locator('body').innerText()

const openReport = async (page, assessmentId, attemptId, audience = 'student') => {
  const route = audience === 'student'
    ? `/student/composite/attempts/${attemptId}/report`
    : `/composite-assessments/${assessmentId}/attempts/${attemptId}/report`
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.includes('加载报告中...'), null, { timeout: 30000 })
  await page.screenshot({ path: path.join(SHOT_DIR, `${audience}-${attemptId}-report.png`), fullPage: true })
}

const hasKey = (value, forbidden) => {
  if (Array.isArray(value)) return value.some((entry) => hasKey(entry, forbidden))
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, entry]) => forbidden.includes(key) || hasKey(entry, forbidden))
}

const assertCollectionContract = (report, label) => {
  assert.equal(report.packageReport, undefined, `${label} unexpectedly contains packageReport`)
  assert.equal(report.unitReports?.length > 0, true, `${label} has no unit reports`)
  assert.equal(hasKey(report, [
    'packageReport',
    'analysisProtocol',
    'cognitiveDomains',
    'domains',
    'evidence',
    'recommendation',
    'recommendations',
    'crossSourceFindings',
    'overallScore',
    'averageScore',
    'percentile',
    'IQ',
    'diagnostic',
    'diagnosis',
  ]), false, `${label} crossed the collection-only field boundary`)
}

const scenarioCollectionOnly = async (page, fixtures) => {
  const teacher = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.collection.assessmentId}`), 'collection detail')
  assert.equal(teacher.reportPackage ?? null, null, 'collection-only assessment has a package')
  assert.equal(teacher.analysisProtocol ?? null, null, 'collection-only assessment has an analysis protocol')
  await page.goto(`${BASE_URL}/composite-assessments/${fixtures.collection.assessmentId}`, { waitUntil: 'domcontentloaded' })
  const teacherText = await bodyText(page)
  assert.match(teacherText, /仅收集|自由组合/)
  assert.doesNotMatch(teacherText, /已选报告包|固定槽位：/)

  await logout(page)
  await login(page, '/student/login', credentials.student)
  const report = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.collection.attemptId}/report`), 'collection student report')
  assertCollectionContract(report, 'collection student report')
  for (const label of fixtures.collection.unitLabels) assert.ok(JSON.stringify(report).includes(label), `Missing collection unit ${label}`)
  await openReport(page, fixtures.collection.assessmentId, fixtures.collection.attemptId)
  const studentText = await bodyText(page)
  assert.doesNotMatch(studentText, /Domain 与 facet|证据引用|跨来源描述性发现|报告包范围|overallScore|averageScore|percentile|IQ|诊断/)
}

const scenarioPackageAuthorizationAndReport = async (page, fixtures) => {
  await logout(page)
  await login(page, '/teacher/account-login', credentials.unauthorizedTeacher)
  const before = assertSuccess(await jsonFetch(page, '/composite-assessments/report-packages'), 'unauthorized package catalog')
  assert.equal(before.list.some((item) => item.key === fixtures.package.key && item.version === fixtures.package.version), false, 'unauthorized teacher saw the package')

  await logout(page)
  await login(page, '/admin/login', credentials.admin)
  const adminCatalog = assertSuccess(await jsonFetch(page, '/composite-assessments/report-packages'), 'admin package catalog')
  const packageItem = adminCatalog.list.find((item) => item.key === fixtures.package.key && item.version === fixtures.package.version)
  assert.ok(packageItem, 'admin package catalog is missing the fixture package')
  assert.equal(packageItem.status, 'PUBLISHED', 'report package definition is not PUBLISHED in the isolated Gate environment')
  const grant = assertSuccess(await jsonFetch(page, '/admin/material-grants/set', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceType: 'REPORT_PACKAGE',
      resourceId: `${fixtures.package.key}@${fixtures.package.version}`,
      teacherIds: [fixtures.package.teacherId],
    }),
  }), 'package grant')
  assert.ok(Array.isArray(grant.list), 'package grant response did not return a list')

  await logout(page)
  await login(page, '/teacher/account-login', credentials.teacher)
  const teacherIdentity = assertSuccess(await jsonFetch(page, '/auth/me'), 'authorized teacher identity')
  assert.equal(
    teacherIdentity.user?.id ?? teacherIdentity.id,
    fixtures.package.teacherId,
    'the package grant must target the teacher used by the browser scenario',
  )
  const teacherCatalog = assertSuccess(await jsonFetch(page, '/composite-assessments/report-packages'), 'authorized package catalog')
  const granted = teacherCatalog.list.find((item) => item.key === fixtures.package.key && item.version === fixtures.package.version)
  assert.ok(granted?.granted, 'authorized teacher did not receive the package grant')
  let detail = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.package.assessmentId}`), 'package assessment detail')
  if (!detail.reportPackage) {
    assert.equal(detail.status, 'DRAFT', 'an uninstantiated package fixture must be a draft')
    detail = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.package.assessmentId}/report-package`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportPackage: {
          key: fixtures.package.key,
          version: fixtures.package.version,
          profile: fixtures.package.profile || 'standard',
        },
      }),
    }), 'package instantiation')
  }
  assert.deepEqual(
    { key: detail.reportPackage?.key, version: detail.reportPackage?.version },
    { key: fixtures.package.key, version: fixtures.package.version },
  )
  if (detail.status === 'DRAFT') {
    detail = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.package.assessmentId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), 'package publish')
    assert.equal(detail.status, 'PUBLISHED', 'package fixture did not publish after instantiation')
  }
  assert.equal(detail.status, 'PUBLISHED', 'package assessment is not published')
  await page.goto(`${BASE_URL}/composite-assessments/${fixtures.package.assessmentId}`, { waitUntil: 'domcontentloaded' })
  const detailText = await bodyText(page)
  for (const label of fixtures.package.slotLabels) assert.ok(detailText.includes(label), `Missing fixed slot ${label}`)
  assert.match(detailText, /已选报告包|已冻结|报告包/)

  const report = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.package.assessmentId}/attempts/${fixtures.package.attemptId}/report`), 'package teacher report')
  assert.ok(report.packageReport, 'package report missing after completion')
  assert.equal(report.packageReport.packageKey, fixtures.package.key)
  assert.equal(report.packageReport.packageVersion, fixtures.package.version)
  assert.equal(report.packageReport.snapshotId != null, true)
  assert.equal(report.packageReport.evidence, undefined, 'teacher package report leaked researcher evidence')
  await openReport(page, fixtures.package.assessmentId, fixtures.package.attemptId, 'teacher')
}

const scenarioQualityFailure = async (page, fixtures) => {
  await logout(page)
  await login(page, '/student/login', credentials.student)
  const report = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.qualityFailure.attemptId}/report`), 'quality failure report')
  const insufficient = (report.unitReports || []).some((unit) => unit.type === 'COGNITIVE' && unit.singleTaskReport?.qualityState === 'insufficient')
  assert.equal(insufficient, true, 'quality failure did not produce an insufficient unit report')
  const validLabel = fixtures.qualityFailure.validUnitLabel
  assert.ok(validLabel && JSON.stringify(report).includes(validLabel), 'quality failure report dropped the valid unit report')
  if (report.packageReport) {
    assert.ok(
      report.packageReport.qualitySummary?.excludedModules?.length > 0
        || report.packageReport.qualitySummary?.warnings?.length > 0,
      'package quality failure has no exclusion or warning marker',
    )
  } else {
    assertCollectionContract(report, 'quality failure collection report')
  }
  await openReport(page, fixtures.qualityFailure.assessmentId, fixtures.qualityFailure.attemptId)
  assert.match(await bodyText(page), /数据质量|不足以稳定解释/)
}

const scenarioK12CoreHistoryReportExport = async (page, fixtures) => {
  await openReport(page, fixtures.k12Core.assessmentId, fixtures.k12Core.attemptId)
  const studentReport = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.k12Core.attemptId}/report`), 'K12 participant report')
  assert.equal(studentReport.packageReport?.packageKey, 'k12_core_profile_v1')
  assert.ok(studentReport.packageReport?.cognitiveDomains?.length > 0, 'K12 report has no domain facet coverage')
  const available = assertSuccess(await jsonFetch(page, '/composite-assessments/available'), 'student history')
  assert.ok(
    available.list.some((entry) => entry.id === fixtures.k12Core.assessmentId
      && entry.attempt?.id === fixtures.k12Core.attemptId
      && entry.attempt?.status === 'COMPLETED'),
    'K12 completed assessment is missing from the student history API',
  )
  await page.goto(`${BASE_URL}${fixtures.k12Core.historyPath}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.includes('加载中...'), null, { timeout: 30000 })
  assert.ok((await bodyText(page)).includes(fixtures.k12Core.historyLabel), 'K12 completed assessment is missing from history')

  await logout(page)
  await login(page, '/teacher/account-login', credentials.teacher)
  const exportResult = await binaryFetch(page, `/composite-assessments/${fixtures.k12Core.assessmentId}/attempts/${fixtures.k12Core.attemptId}/analysis-export?format=zip`)
  assert.equal(exportResult.status, 200, `K12 research export HTTP ${exportResult.status}`)
  assert.ok(exportResult.size > 0, 'K12 research export is empty')
  assert.match(exportResult.contentType, /zip|octet-stream/i)
}

const scenarioMultisource = async (page, fixtures) => {
  await logout(page)
  await login(page, '/admin/login', credentials.admin)
  const report = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.multisource.assessmentId}/attempts/${fixtures.multisource.attemptId}/report`), 'multisource researcher report')
  const findings = report.packageReport?.crossSourceFindings || []
  for (const expectedType of fixtures.multisource.expectedFindingTypes) {
    assert.ok(findings.some((finding) => finding.type === expectedType), `Missing multisource finding ${expectedType}`)
  }
  assert.equal(report.packageReport?.packageKey, fixtures.multisource.packageKey, 'multisource package identity should be preserved')
  await openReport(page, fixtures.multisource.assessmentId, fixtures.multisource.attemptId, 'teacher')
  assert.match(await bodyText(page), /跨来源描述性发现|来源摘要/)
}

const scenarioReanalysisAndStableCompletion = async (page, fixtures) => {
  await logout(page)
  await login(page, '/admin/login', credentials.admin)
  const defaultBefore = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.reanalysis.assessmentId}/attempts/${fixtures.reanalysis.attemptId}/report`), 'default report before reanalysis')
  assert.equal(defaultBefore.packageReport?.snapshotId, fixtures.reanalysis.completionSnapshotId, 'default report did not use completion snapshot before reanalysis')
  const before = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.reanalysis.attemptId}/snapshots`), 'snapshot history before reanalysis')
  assert.ok(before.list.some((snapshot) => snapshot.id === fixtures.reanalysis.completionSnapshotId), 'earliest completion snapshot is missing')
  const reanalyze = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.reanalysis.attemptId}/reanalyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }), 'admin reanalysis')
  assert.notEqual(reanalyze.id, fixtures.reanalysis.completionSnapshotId, 'reanalysis overwrote the completion snapshot')
  const after = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.reanalysis.attemptId}/snapshots`), 'snapshot history after reanalysis')
  assert.ok(after.list.some((snapshot) => snapshot.id === reanalyze.id), 'new reanalysis snapshot is missing')
  assert.ok(after.list.some((snapshot) => snapshot.id === fixtures.reanalysis.completionSnapshotId), 'history lost the completion snapshot')
  const explicit = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.reanalysis.assessmentId}/attempts/${fixtures.reanalysis.attemptId}/report?snapshotId=${encodeURIComponent(reanalyze.id)}`), 'explicit reanalysis snapshot report')
  assert.equal(explicit.packageReport?.snapshotId, reanalyze.id, 'explicit snapshot selection did not return the reanalysis')
  const defaultAfter = assertSuccess(await jsonFetch(page, `/composite-assessments/${fixtures.reanalysis.assessmentId}/attempts/${fixtures.reanalysis.attemptId}/report`), 'default report after reanalysis')
  assert.equal(defaultAfter.packageReport?.snapshotId, fixtures.reanalysis.completionSnapshotId, 'default report switched away from the earliest completion snapshot')

  await logout(page)
  await login(page, '/student/login', credentials.student)
  const participant = assertSuccess(await jsonFetch(page, `/composite-assessments/attempts/${fixtures.reanalysis.attemptId}/report`), 'participant default snapshot report')
  assert.equal(participant.packageReport?.snapshotId, undefined, 'participant report exposed a staff snapshot selector')
  assert.equal(participant.packageReport?.packageKey, fixtures.reanalysis.packageKey, 'participant report package identity changed')
  await openReport(page, fixtures.reanalysis.assessmentId, fixtures.reanalysis.attemptId)
  assert.doesNotMatch(await bodyText(page), /重新分析|报告版本/)
}

const main = async () => {
  assert.equal(process.env.COGNITIVE_R2_E2E_ISOLATED_DB, '1', 'Set COGNITIVE_R2_E2E_ISOLATED_DB=1 for a dedicated Gate service')
  const fixtures = loadFixtures()
  assertCredentials()
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  assert.ok(BROWSER_EXECUTABLE, `Browser executable not found; checked: ${browserCandidates.join(', ')}`)

  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await login(page, '/teacher/account-login', credentials.teacher)
    await scenarioCollectionOnly(page, fixtures)
    await scenarioPackageAuthorizationAndReport(page, fixtures)
    await scenarioQualityFailure(page, fixtures)
    await scenarioK12CoreHistoryReportExport(page, fixtures)
    await scenarioMultisource(page, fixtures)
    await scenarioReanalysisAndStableCompletion(page, fixtures)
    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`)
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      browser: BROWSER_EXECUTABLE,
      scenarios: ['collection-only', 'package-auth-and-report', 'quality-failure', 'k12-core-history-report-export', 'multisource-convergence-divergence', 'snapshot-reanalysis-stability'],
      screenshots: SHOT_DIR,
    }, null, 2))
    console.log('Round 2 browser E2E: PASS')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Round 2 browser E2E: BLOCKED/FAIL')
  console.error(error.stack || error.message)
  process.exit(1)
})
