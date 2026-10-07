// @ts-nocheck
/** Real HTTP + browser + PostgreSQL: no request mocks or pre-completed results. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { prisma } from '../backend/src/config/database'
import { parseStoredCanonicalUnitResult } from '../backend/src/modules/assessment-runtime/persistence'
const { chromium } = require('../backend/node_modules/playwright-core')
const { assertApiSuccess } = require('./helpers/api-response.cjs')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')
const fixture = JSON.parse(readFileSync(process.env.PR5_SCENARIOS_FIXTURE || '/tmp/eduk12-pr5-scenarios.json', 'utf8'))
const base = process.env.PR5_SCENARIOS_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.PR5_SCENARIOS_OUTPUT || '/tmp/eduk12-pr5-scenarios-evidence'
const evidence = { candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], artifacts: [], attempts: [] }
const record = (name, details = {}) => { evidence.checks.push({ name, ...details }); console.log(`PASS ${name}`) }
const sessions = new Map()
let browser
const api = async (page, path, body?) => sessionJsonFetch(page, path, body === undefined ? {} : {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body),
})
const ok = async (page, path, body?) => {
  const response = await api(page, path, body)
  return assertApiSuccess(response.status, response.body, path)
}
const denied = async (page, path, body?) => {
  const result = await api(page, path, body)
  assert.ok([403, 404, 409].includes(result.status), `Expected denied ${path}: ${JSON.stringify(result)}`)
  return result
}
async function pageFor(name, mobile = false) {
  if (sessions.has(name)) return sessions.get(name)
  const user = fixture.users[name]
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } })
  const page = await context.newPage()
  if (user.role === 'PARENT') {
    await page.goto(`${base}/parent/login`)
    assert.equal((await ok(page, '/capabilities')).parentPortal, true, 'Isolated parent scenario requires PARENT_PORTAL_ENABLED=true')
    await page.getByLabel('用户名', { exact: true }).fill(user.username)
    await page.getByLabel('密码', { exact: true }).fill(user.password)
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: '登录', exact: true }).click()
    assert.equal((await response).status(), 200)
  } else {
    await loginWithSession(page, { baseUrl: base, route: user.role === 'ADMIN' ? '/admin/login' : user.role === 'TEACHER' ? '/teacher/account-login' : '/student/login', ...user,
      submitName: user.role === 'ADMIN' ? '管理员登录' : '登录', usernamePlaceholder: user.role === 'ADMIN' ? '请输入管理员账号' : '请输入用户名' })
  }
  sessions.set(name, page)
  return page
}
const entryFor = key => fixture.entries.find(entry => entry.title === `PR5 ${key}`)
const member = async (page, org, name, personas) => {
  const row = await ok(page, `/organizations/${org}/memberships`, { userId: fixture.users[name].id })
  for (const persona of personas) await ok(page, `/organizations/${org}/memberships/${row.id}/personas`, { persona })
  return row.id
}
let checkedProjectionRecovery = false
let usedBuilder = false
async function run(page, org, key, subject = { kind: 'ALL_CURRENT' }, respondent = { kind: 'ALL_CURRENT' }, suffix = '') {
  const entry = entryFor(key), policy = entry.applicability
  const r = await ok(page, `/organizations/${org}/runs`, { name: `${key}${suffix}-${randomUUID().slice(0, 6)}` })
  let t, preview
  if (!usedBuilder && key === 'teacher-self') {
    await page.goto(`${base}/organizations/${org}/runs/${r.id}`)
    await page.getByLabel('已发布资源', { exact: true }).selectOption({ label: `${entry.title} · BUNDLE/${policy.resourceKey}@${policy.resourceVersion}` })
    const addButton = page.getByRole('button', { name: '添加测评项目', exact: true })
    await addButton.click()
    await page.getByRole('heading', { name: `测评项目 1: BUNDLE/${policy.resourceKey}@${policy.resourceVersion}`, exact: true }).waitFor()
    const afterAdd = await ok(page, `/organizations/${org}/runs/${r.id}`)
    t = afterAdd.tracks.find(track => track.resourceKey === policy.resourceKey && track.resourceVersion === policy.resourceVersion)
    assert.ok(t, 'builder add-track action must persist the selected resource in the server read model')

    preview = await ok(page, `/organizations/${org}/runs/${r.id}/preview`, { expectedVersion: afterAdd.run.version })
    await page.getByRole('button', { name: '发布测评批次', exact: true }).click()
    const confirmDialog = page.getByRole('dialog', { name: '确认发布测评' })
    await confirmDialog.waitFor()
    await confirmDialog.getByRole('button', { name: '确认发布', exact: true }).click()
    await page.getByText('Run 已发布；人口、资源与策略身份已冻结。', { exact: true }).waitFor()
    const afterPublish = await ok(page, `/organizations/${org}/runs/${r.id}`)
    assert.equal(afterPublish.run.status, 'PUBLISHED', 'builder publish action must persist published state')
    usedBuilder = true
  } else {
  t = await ok(page, `/organizations/${org}/runs/${r.id}/tracks`, {
    resource: { family: policy.resourceKind, key: policy.resourceKey, version: policy.resourceVersion }, subjectSelector: subject, respondentSelector: respondent,
    requestedPolicy: { ...(entry.allowedTargetModes?.includes('HOMEROOM_TEACHER') ? {targetPolicy:{mode:'HOMEROOM_TEACHER'}} : {}), subjectRoles: policy.subjectRoles, respondentRoles: policy.respondentRoles, relationshipKinds: policy.relationshipKinds,
      perspectives: policy.perspectives, analysisMode: policy.analysisMode, visibilityPolicyKey: policy.visibilityPolicyKey, minimumRespondents: policy.minimumRespondents },
  })
  const detail = await ok(page, `/organizations/${org}/runs/${r.id}`)
  preview = await ok(page, `/organizations/${org}/runs/${r.id}/preview`, { expectedVersion: detail.run.version })
  await ok(page, `/organizations/${org}/runs/${r.id}/publish`, { expectedVersion: detail.run.version })
  }
  const published = await ok(page, `/organizations/${org}/runs/${r.id}`)
  assert.ok(published.run.executionCount > 0)
  return { org, id: r.id, track: t.id, name: r.name, key, preview }
}
async function complete(name, r) {
  const page = await pageFor(name, name === 'client0')
  await page.goto(`${base}/organization-tasks`)
  const inbox = await ok(page, '/organizations/assigned-tasks')
  const task = inbox.list.find(task => task.runId === r.id)
  assert.ok(task, `${name} assigned task for ${r.name}`)
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: r.name, exact: true }) })
  await card.waitFor()
  if (task.consentRequired) await card.getByRole('checkbox').check()
  const started = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/executions/${task.executionId}/start`), { timeout: 45_000 })
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const startResponse = await started
  const start = await startResponse.json()
  assert.equal(startResponse.ok(), true, `START HTTP ${startResponse.status()}: ${JSON.stringify(start)}`)
  assert.equal(start.code, 0, JSON.stringify(start))
  const attemptId = start.data.runtimeBindingRef
  assert.ok(attemptId)
  await page.waitForURL(new RegExp(`/relational/attempts/${attemptId}`))
  const { snapshots, canonical } = await finishRuntime(page, attemptId)
  if (!checkedProjectionRecovery) {
    // Inject only projection loss after authoritative FINAL; GET must repair it.
    await prisma.$executeRaw`UPDATE assessment_run_executions SET status='STARTED', completed_at=NULL WHERE id=${task.executionId}`
    const rereadBody = page.waitForResponse(
      response => response.request().method() === 'GET' && response.url().endsWith(`/composite-assessments/attempts/${attemptId}`),
    )
    await page.goto(`${base}/relational/attempts/${attemptId}`)
    const response = await rereadBody
    const state = assertApiSuccess(response.status(), await response.json(), 'authorized projection recovery GET')
    assert.equal(state.status, 'COMPLETED')
    const repaired = await prisma.$queryRaw`SELECT status FROM assessment_run_executions WHERE id=${task.executionId}`
    assert.equal(repaired[0].status, 'COMPLETED')
    assert.equal(await prisma.assessmentUnitSnapshot.count({ where: { compositeAttemptId: attemptId } }), 1)
    checkedProjectionRecovery = true
    record('FINAL projection failure: authorized GET repairs the same execution without another canonical result')
  }
  const rows = await prisma.$queryRaw`SELECT id, status FROM assessment_run_executions WHERE id=${task.executionId}`
  evidence.attempts.push({ executionId: task.executionId, attemptId, snapshotId: snapshots[0].id, resultHash: canonical.resultHash, user: name, runId: r.id })
  const after = await ok(page, '/organizations/assigned-tasks')
  assert.equal(after.list.find(t => t.executionId === task.executionId).status, 'COMPLETED')
  assert.equal(rows[0].status, 'COMPLETED', 'canonical completion must reconcile Run reporting readiness')
  const feedback=await ok(page,`/my-assessments/results/${task.executionId}`)
  assert.equal(feedback.mode,'COMPLETION_ONLY');assert.equal(feedback.state,'COMPLETED');assert.equal(feedback.metrics,undefined)
  console.log(`Runtime FINAL verified: ${name} / ${r.key}`)
  return { task, attemptId, snapshot: snapshots[0], canonical, page, executionStatus: rows[0].status }
}
async function finishRuntime(page, attemptId) {
  await page.getByRole('button', { name: '开始/继续文字情境测评', exact: true }).click()
  for (const scene of [1, 2]) {
    await page.getByText(`情境 ${scene} / 2`, { exact: true }).waitFor()
    await page.locator('input[type="radio"]').first().click()
    await page.waitForFunction(() => document.querySelector('input[type="radio"]')?.checked === true)
    if (scene === 1) await page.getByRole('button', { name: '情境 2，未完成', exact: true }).click()
  }
  const final = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes(`/attempts/${attemptId}/items/`) && response.url().endsWith('/submit'))
  await page.getByRole('button', { name: '提交测评', exact: true }).click()
  assert.equal((await (await final).json()).code, 0)
  await page.waitForURL(/\/(my-assessments|relational\/tasks)$/)
  const persisted = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
  assert.equal(persisted.status, 'COMPLETED')
  const snapshots = await prisma.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attemptId, attemptEpoch: persisted.attemptEpoch } })
  assert.equal(snapshots.length, 1)
  const canonical = parseStoredCanonicalUnitResult(snapshots[0].canonicalResultEncrypted)
  assert.equal(canonical.core.quality.status, 'interpretable')
  const metric = canonical.core.metrics.find(m => m.key === 'bfi2.assertiveness.behavior')
  assert.equal(typeof metric.value, 'number')
  return { snapshots, canonical }
}
const baseMetric = { metricId: 'behavior', sourceMetricKey: 'bfi2.assertiveness.behavior', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
  aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }
async function spec(platform, kind, key = 'teacher-self') {
  const definition: any = { schemaVersion: 1, analysisKind: kind, engineKey: `ORG_${kind}_V1`, engineVersion: '1.0.0', privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
    minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT', metricRules: [baseMetric] }
  if (kind !== 'GROUP') definition.metricRules = [{ ...baseMetric, sourceFamily: 'BUNDLE', sourceResourceKey: entryFor(key).applicability.resourceKey, valueType: 'NUMBER', longitudinalMetricKey: 'behavior' }]
  if (kind === 'PROTECTED_FEEDBACK') { delete definition.minimumCohortN; definition.minimumRespondentN = 3; definition.privacyUnit = 'RESPONDENT'; definition.metricRules[0].observationUnit = 'RESPONDENT' }
  else if (kind !== 'GROUP') definition.comparabilityRules = []
  const s = await ok(platform, '/organizations/reporting-specs', { specKey: `pr5-${kind}-${randomUUID()}`, version: 1, definition })
  const selfReview = await denied(platform, `/organizations/reporting-specs/${s.id}/review`, {})
  assert.equal(selfReview.status, 403, 'spec creator cannot self-review')
  await ok(await pageFor('platformReviewer'), `/organizations/reporting-specs/${s.id}/review`, {})
  await ok(platform, `/organizations/reporting-specs/${s.id}/publish`, {})
  return s.id
}
async function group(owner, r, specId) {
  const a = await ok(owner, `/organizations/${r.org}/reporting/analyses`, { runId: r.id, trackId: r.track, specId })
  assert.equal(a.projection.state, 'present', JSON.stringify(a))
  evidence.artifacts.push({ organizationId: r.org, artifactId: a.artifactId, kind: 'GROUP' })
  return a
}
async function showArtifact(page, org, artifactId) {
  await page.goto(`${base}/organizations/${org}/reporting`)
  await page.getByText('高级设置：受保护反馈与历史报告读取', { exact: true }).click()
  await page.getByPlaceholder('artifact UUID').fill(artifactId)
  await page.getByRole('button', { name: '读取历史报告', exact: true }).click()
  await page.getByRole('heading', { name: '报告结果', exact: true }).waitFor()
  await page.getByText('报告记录编号', { exact: true }).click()
  await page.getByText(`Artifact ${artifactId}`, { exact: false }).first().waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Reporting workspace must fit the viewport')
}
async function main() {
  assert.equal(process.env.NODE_ENV, 'test')
  mkdirSync(output, { recursive: true })
  browser = await chromium.launch({ headless: true, ...(process.env.PR5_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PR5_CHROMIUM_EXECUTABLE } : {}) })
  const platform = await pageFor('platform'), owner = await pageFor('owner')
  const school = await ok(platform, '/organizations', { name: `PR5 School ${fixture.suffix}`, firstAdminUserId: fixture.users.owner.id })
  const org = school.organization.id
  const members = {}
  for (const name of ['teacher0', 'teacher1', 'teacher2', 'student0', 'student1', 'student2']) members[name] = await member(owner, org, name, [name.startsWith('teacher') ? 'TEACHER' : 'STUDENT'])
  await ok(owner, `/organizations/${org}/memberships/${members.teacher0}/personas`, { persona: 'COUNSELOR' })
  await ok(owner, `/organizations/${org}/memberships/${school.membership.id}/capabilities`, { capability: 'REPORT_EXPORT' })
  const classify = body => ok(owner, `/organizations/${org}/classification`, body)
  const single = await classify({ operation: 'CREATE_DIMENSION', key: 'department', name: '部门', cardinality: 'SINGLE' })
  const multi = await classify({ operation: 'CREATE_DIMENSION', key: 'projects', name: '项目', cardinality: 'MULTI' })
  const label = await classify({ operation: 'CREATE_LABEL', dimensionId: single.id, name: '试点' })
  const projectLabels = []
  for (const name of ['A', 'B']) projectLabels.push(await classify({ operation: 'CREATE_LABEL', dimensionId: multi.id, name }))
  const assignments = []
  for (const name of ['teacher0', 'teacher1', 'teacher2']) {
    assignments.push(await classify({ operation: 'ASSIGN_LABEL', membershipId: members[name], labelId: label.id }))
    for (const l of projectLabels) await classify({ operation: 'ASSIGN_LABEL', membershipId: members[name], labelId: l.id })
  }
  const all = await run(owner, org, 'teacher-self')
  for (const name of ['teacher0', 'teacher1', 'teacher2']) await complete(name, all)
  const groupSpec = await spec(platform, 'GROUP')
  const artifact = await group(owner, all, groupSpec)
  await owner.goto(`${base}/organizations/${org}/delivery`)
  assert.equal(await owner.getByRole('combobox', { name: '报告类型', exact: true }).inputValue(), 'AGGREGATE')
  await owner.getByLabel('报告版本编号', { exact: true }).fill(artifact.artifactId)
  const ticketResponse = owner.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/reporting/exports'))
  await owner.getByRole('button', { name: '准备 CSV 导出', exact: true }).click()
  const ticketBody = await (await ticketResponse).json(); assert.equal(ticketBody.code, 0)
  const ticket = ticketBody.data
  const download = owner.waitForEvent('download')
  await owner.getByRole('button', { name: '下载 CSV', exact: true }).click()
  const downloaded = await download
  await downloaded.saveAs(`${output}/school-aggregate.csv`)
  assert.match(readFileSync(`${output}/school-aggregate.csv`, 'utf8'), /mean/)
  const csv = await api(owner, `/organizations/${org}/reporting/exports/${ticket.exportId}`)
  assert.equal(csv.status, 200); assert.match(csv.body, /mean/)
  await ok(owner, `/organizations/${org}/memberships/${school.membership.id}/capabilities/revoke`, { capability: 'REPORT_EXPORT' })
  await denied(owner, `/organizations/${org}/reporting/exports/${ticket.exportId}`)
  await ok(owner, `/organizations/${org}/memberships/${school.membership.id}/capabilities`, { capability: 'REPORT_EXPORT' })
  const labeled = await run(owner, org, 'teacher-self', { kind: 'LABELS', labelIds: [label.id], match: 'ALL' })
  for (const name of ['teacher0', 'teacher1', 'teacher2']) await complete(name, labeled)
  const labelArtifact = await group(owner, labeled, groupSpec)
  const frozen = await prisma.$queryRaw`SELECT snapshot_hash FROM reporting_cohort_snapshots WHERE source_run_id=${all.id}`
  await classify({ operation: 'END_LABEL', assignmentId: assignments[0].id })
  await ok(owner, `/organizations/${org}/memberships/${members.teacher0}/end`, {})
  const oldMembership = members.teacher0
  members.teacher0 = await member(owner, org, 'teacher0', ['TEACHER', 'COUNSELOR'])
  const reread = await ok(owner, `/organizations/${org}/reporting/artifacts/${artifact.artifactId}`)
  assert.deepEqual(reread.projection, artifact.projection)
  assert.deepEqual((await ok(owner, `/organizations/${org}/reporting/artifacts/${labelArtifact.artifactId}`)).projection, labelArtifact.projection)
  assert.deepEqual(await prisma.$queryRaw`SELECT snapshot_hash FROM reporting_cohort_snapshots WHERE source_run_id=${all.id}`, frozen)
  const next = await run(owner, org, 'teacher-self')
  const nextReport = await ok(owner, `/organizations/${org}/reporting/analyses`, { runId: next.id, trackId: next.track, specId: groupSpec })
  assert.equal(nextReport.projection.state, 'suppressed')
  const newCohort = await prisma.$queryRaw`SELECT cohort_identity_hash FROM reporting_cohort_snapshots WHERE source_run_id=${next.id}`
  const oldCohort = await prisma.$queryRaw`SELECT cohort_identity_hash FROM reporting_cohort_snapshots WHERE source_run_id=${all.id}`
  assert.notEqual(newCohort[0].cohort_identity_hash, oldCohort[0].cohort_identity_hash)
  const actors = await prisma.$queryRaw`SELECT membership_id FROM assessment_run_actor_snapshots WHERE run_id=${next.id} AND user_id=${fixture.users.teacher0.id}`
  assert.equal(actors[0].membership_id, members.teacher0); assert.notEqual(actors[0].membership_id, oldMembership)
  await showArtifact(owner, org, artifact.artifactId)
  await owner.screenshot({ path: `${output}/school-report.png`, fullPage: true })
  record('school: platform-create, SINGLE/MULTI labels, SELF runtime/canonical, all/label group, CSV revocation, frozen history and rejoin')
  // Scenario two and three are appended below.
  await schoolMentalHealth({ platform, owner, org, members, groupSpec, school })
  await consultation({ platform, owner, groupSpec })
  await legacyCourse()
}
async function schoolMentalHealth({ platform, owner, org, members, groupSpec, school }) {
  const grade = await ok(owner, `/organizations/${org}/units`, { unitKind: 'GRADE', name: '一年级' })
  const classroom = await ok(owner, `/organizations/${org}/units`, { unitKind: 'CLASS', name: '一班', parentUnitId: grade.id })
  await ok(owner, `/organizations/${org}/staff-class-assignments`, { membershipId: members.teacher0, classUnitId: classroom.id, staffRole: 'HOMEROOM' })
  for (const name of ['student0', 'student1', 'student2']) await ok(owner, `/organizations/${org}/student-class-assignments`, { membershipId: members[name], classUnitId: classroom.id, isPrimary: true })
  const parentRelation = await prisma.parentStudentRelationship.findFirst({ where: { parentUserId: fixture.users.parent.id, studentUserId: fixture.users.student0.id, status: 'ACTIVE' } }) ?? await prisma.parentStudentRelationship.create({ data: { parentUserId: fixture.users.parent.id, studentUserId: fixture.users.student0.id, status: 'ACTIVE', approvedByUserId: fixture.users.owner.id, approvedAt: new Date() } })
  const self = await run(owner, org, 'student-self')
  const completed = []
  for (const name of ['student0', 'student1', 'student2']) completed.push(await complete(name, self))
  await group(owner, self, groupSpec)
  const teacherObserver = await run(owner, org, 'teacher-student', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.student0] })
  await complete('teacher0', teacherObserver)
  const parentObserver = await run(owner, org, 'parent-student', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.student0] }, { kind: 'RELATED_PARENT' })
  const parentCompleted = await complete('parent', parentObserver)
  const protectedRun = await run(owner, org, 'student-teacher', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.teacher0] })
  for (const name of ['student0', 'student1', 'student2']) await complete(name, protectedRun)
  const protectedSpec = await spec(platform, 'PROTECTED_FEEDBACK', 'student-teacher')
  const input = { analysisKind: 'PROTECTED_FEEDBACK', runId: protectedRun.id, trackId: protectedRun.track, subjectUserId: fixture.users.teacher0.id,
    relationshipKind: 'CLASS_TEACHER_STUDENT', perspective: 'RELATIONAL_EXPERIENCE', specId: protectedSpec }
  const a = await ok(owner, `/organizations/${org}/reporting/analyses`, input)
  assert.equal(a.projection.state, 'present', JSON.stringify(a))
  evidence.artifacts.push({ organizationId: org, artifactId: a.artifactId, kind: 'PROTECTED_FEEDBACK' })
  const teacherPage = await pageFor('teacher0')
  await denied(teacherPage, `/organizations/${org}/reporting/analyses`, input)
  await denied(teacherPage, `/organizations/${org}/reporting/artifacts/${a.artifactId}`)
  const protectedAttempt = evidence.attempts.find(a => a.runId === protectedRun.id).attemptId
  await denied(await pageFor('student0'), `/composite-assessments/attempts/${protectedAttempt}/report`)
  await denied(await pageFor('student0'), `/composite-assessments/attempts/${protectedAttempt}/analysis-export`)
  // Publish first; then end current relationship and membership. History must not confer tenant navigation.
  const pendingParent = await run(owner, org, 'parent-student', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.student0] }, { kind: 'RELATED_PARENT' })
  const pendingConsent = await run(owner, org, 'teacher-student', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.student1] })
  const consentTask = (await ok(teacherPage, '/organizations/assigned-tasks')).list.find(t => t.runId === pendingConsent.id)
  await ok(teacherPage, `/organizations/${org}/runs/${pendingConsent.id}/executions/${consentTask.executionId}/consent/accept`, {})
  const [consentRow] = await prisma.$queryRaw`SELECT a.consent_id FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${consentTask.executionId}`
  await prisma.assessmentAttemptConsent.updateMany({ where: { OR: [{ id: consentRow.consent_id }, { priorConsentId: consentRow.consent_id }] }, data: { revokedAt: new Date() } })
  await denied(teacherPage, `/organizations/${org}/runs/${pendingConsent.id}/executions/${consentTask.executionId}/start`, {})
  const parentPage = await pageFor('parent')
  const pending = (await ok(parentPage, '/organizations/assigned-tasks')).list.find(t => t.runId === pendingParent.id)
  assert.ok(pending)
  await prisma.parentStudentRelationship.update({ where: { id: parentRelation.id }, data: { status: 'REVOKED', revokedAt: new Date() } })
  await ok(owner, `/organizations/${org}/memberships/${members.student0}/end`, {})
  assert.equal((await ok(parentPage, '/organizations/assigned-tasks')).list.some(t=>t.runId===pendingParent.id || t.runId===parentObserver.id),false,'revoked parent must not discover old subjects')
  await denied(parentPage, `/organizations/${org}/runs/${pendingParent.id}/executions/${pending.executionId}/start`, {})
  await denied(parentPage, `/organizations/${org}`)
  await denied(parentPage, `/composite-assessments/attempts/${parentCompleted.attemptId}/report`)
  await denied(parentPage, `/my-assessments/results/${parentCompleted.task.executionId}`)
  await parentPage.goto(`${base}/organization-tasks`)
  await parentPage.getByRole('heading', { name: '我的测评', exact: true }).waitFor()
  assert.equal(await parentPage.getByRole('heading',{name:parentObserver.name,exact:true}).count(),0)
  await parentPage.screenshot({ path: `${output}/parent-revoked-inbox.png`, fullPage: true })
  await denied(parentPage, `/composite-assessments/attempts/${parentCompleted.attemptId}/analysis-export`)
  await denied(parentPage, `/organizations/${org}/reporting/exports`, { kind: 'AGGREGATE', artifactId: a.artifactId })
  // Inject only a test Safety trigger tied to the real canonical result, never a production trigger rule.
  const source = completed[1]
  const caseRow = await prisma.safetyCase.create({ data: { policyKey: 'pr5-test-trigger', policyVersion: '1.0.0', subjectUserId: fixture.users.student1.id,
    primaryOwnerUserId: fixture.users.teacher0.id, backupOwnerUserIds: [], triggerSourceKind: 'CANONICAL_UNIT_RESULT', triggerSourceRecordId: source.snapshot.id,
    triggerSourceHash: source.canonical.resultHash, triggerNotesJson: ['PR5-sensitive-fixture-note'], idempotencyKey: randomUUID(),
    ackDueAt: new Date(Date.now() + 60000), disposeDueAt: new Date(Date.now() + 120000) } })
  const safetyPath = `/organizations/${org}/safety/cases/${caseRow.id}`
  const summary = await ok(owner, safetyPath)
  assert.equal(summary.projection, 'SUMMARY'); assert.doesNotMatch(JSON.stringify(summary), /PR5-sensitive|subjectUserId|triggerNotes|events/)
  assert.equal((await ok(teacherPage, safetyPath)).projection, 'ACTION')
  await ok(owner, `/organizations/${org}/memberships/${members.teacher0}/capabilities`, { capability: 'PSYCHOLOGY_STAFF' })
  assert.equal((await ok(teacherPage, safetyPath)).projection, 'FULL')
  await ok(platform, `/organizations/${org}/suspend`, {})
  assert.equal((await ok(teacherPage, safetyPath)).projection, 'FULL')
  await denied(owner, `/organizations/${org}/reporting/artifacts/${a.artifactId}`)
  await ok(platform, `/organizations/${org}/resume`, {})
  record('school mental health: four directions, protected subject/generic report denial, consent and relationship revocation, revoked Parent discovery, legacy historical policy, Safety SUMMARY/ACTION/FULL')
}
async function consultation({ platform, owner, groupSpec }) {
  const created = await ok(platform, '/organizations', { name: `PR5 Clinic ${fixture.suffix}`, firstAdminUserId: fixture.users.owner.id })
  const org = created.organization.id, members = {}, relations = []
  for (const name of ['counselor0', 'counselor1', 'counselor2', 'client0', 'client1', 'client2']) members[name] = await member(owner, org, name, [name.startsWith('counselor') ? 'COUNSELOR' : 'CLIENT'])
  for (const name of ['client0', 'client1', 'client2']) relations.push(await ok(owner, `/organizations/${org}/classification`, {
    operation: 'CREATE_RELATIONSHIP', counselorMembershipId: members.counselor0, clientMembershipId: members[name] }))
  const clientSelf = await run(owner, org, 'client-self')
  for (const name of ['client0', 'client1', 'client2']) await complete(name, clientSelf)
  await group(owner, clientSelf, groupSpec)
  const observer = await run(owner, org, 'counselor-client', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.client0] })
  await complete('counselor0', observer) // legacy ADMIN must enter only its exact owned runtime.
  const protectedRun = await run(owner, org, 'client-counselor', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.counselor0] })
  for (const name of ['client0', 'client1', 'client2']) await complete(name, protectedRun)
  const protectedSpec = await spec(platform, 'PROTECTED_FEEDBACK', 'client-counselor')
  const a = await ok(owner, `/organizations/${org}/reporting/analyses`, { analysisKind: 'PROTECTED_FEEDBACK', runId: protectedRun.id, trackId: protectedRun.track,
    subjectUserId: fixture.users.counselor0.id, relationshipKind: 'COUNSELOR_CLIENT', perspective: 'RELATIONAL_EXPERIENCE', specId: protectedSpec })
  assert.equal(a.projection.state, 'present', JSON.stringify(a))
  const counselor = await pageFor('counselor0')
  const clientSpec = await spec(platform, 'PROTECTED_FEEDBACK', 'counselor-client')
  const clientInput = { analysisKind: 'PROTECTED_FEEDBACK', runId: observer.id, trackId: observer.track,
    subjectUserId: fixture.users.client0.id, relationshipKind: 'COUNSELOR_CLIENT', perspective: 'OBSERVER_REPORT', specId: clientSpec }
  const clientReport = await ok(counselor, `/organizations/${org}/reporting/analyses`, clientInput)
  assert.equal(clientReport.projection.state, 'suppressed')
  await denied(await pageFor('counselor1'), `/organizations/${org}/reporting/artifacts/${clientReport.artifactId}`)
  await denied(counselor, `/organizations/${org}/reporting/artifacts/${a.artifactId}`)
  const first = await run(owner, org, 'counselor-self')
  for (const name of ['counselor0', 'counselor1', 'counselor2']) await complete(name, first)
  const series = await ok(owner, `/organizations/${org}/reporting/series`, { seriesKey: `clinic-${randomUUID()}`, scope: { resourceFamily: 'BUNDLE', resourceKey: entryFor('counselor-self').applicability.resourceKey } })
  await ok(owner, `/organizations/${org}/reporting/series/${series.seriesId}/waves`, { waveKey: 'before', ordinal: 1, runId: first.id, trackId: first.track })
  const pending = await run(owner, org, 'counselor-client', { kind: 'MEMBERSHIP_IDS', membershipIds: [members.client0] })
  const task = (await ok(counselor, '/organizations/assigned-tasks')).list.find(t => t.runId === pending.id)
  assert.ok(task)
  await ok(owner, `/organizations/${org}/classification`, { operation: 'END_RELATIONSHIP', relationshipId: relations[0].id })
  await denied(counselor, `/organizations/${org}/reporting/artifacts/${clientReport.artifactId}`)
  assert.equal((await ok(counselor, '/organizations/assigned-tasks')).list.some(t=>t.runId===pending.id),false)
  await denied(counselor, `/organizations/${org}/runs/${pending.id}/executions/${task.executionId}/start`, {})
  const oldMembership = members.counselor0
  await ok(owner, `/organizations/${org}/memberships/${oldMembership}/end`, {})
  members.counselor0 = await member(owner, org, 'counselor0', ['COUNSELOR'])
  const second = await run(owner, org, 'counselor-self')
  for (const name of ['counselor0', 'counselor1', 'counselor2']) await complete(name, second)
  await ok(owner, `/organizations/${org}/reporting/series/${series.seriesId}/waves`, { waveKey: 'after', ordinal: 2, runId: second.id, trackId: second.track })
  for (const kind of ['REPEATED_COHORT', 'MATCHED_LONGITUDINAL']) {
    const specId = await spec(platform, kind, 'counselor-self')
    const a = await ok(owner, `/organizations/${org}/reporting/analyses`, { analysisKind: kind, seriesId: series.seriesId, waveKeys: ['before', 'after'], specId,
      ...(kind === 'MATCHED_LONGITUDINAL' ? { options: { mode: 'PAIRWISE' } } : {}) })
    assert.equal(a.projection.state, 'present', JSON.stringify(a))
    if (kind === 'MATCHED_LONGITUDINAL') { assert.equal(a.projection.matchedEligibleN, 3); assert.equal(a.projection.metrics.behavior.countKind, 'PAIRED_VALID'); assert.equal(a.projection.metrics.behavior.validCaseN, 3); assert.equal(a.projection.metrics.behavior.comparisons[0].comparability.level, 'NOT_COMPARABLE'); assert.equal(a.projection.metrics.behavior.comparisons[0].delta, undefined) }
    evidence.artifacts.push({ organizationId: org, artifactId: a.artifactId, kind })
    await showArtifact(owner, org, a.artifactId)
  }
  const episodes = await prisma.$queryRaw`SELECT membership_id FROM assessment_run_actor_snapshots WHERE user_id=${fixture.users.counselor0.id} AND run_id IN (${first.id}, ${second.id})`
  assert.deepEqual(new Set(episodes.map(e => e.membership_id)), new Set([oldMembership, members.counselor0]))
  await owner.screenshot({ path: `${output}/clinic-longitudinal.png`, fullPage: true })
  const mobile = await pageFor('client0'); await mobile.goto(`${base}/organization-tasks`); await mobile.getByRole('heading', { name: '我的测评' }).waitFor()
  await mobile.keyboard.press('Tab')
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true)
  record('consultation: Client SELF, both professional directions, exact ADMIN respondent, ended relation START denial, Counselor M1/M2 matched and repeated, mobile keyboard')
}
async function legacyCourse() {
  const ref = entryFor('legacy-experience').applicability
  const product = { resourceKind: ref.resourceKind, resourceKey: ref.resourceKey, resourceVersion: ref.resourceVersion }
  for (const name of ['student0', 'student1', 'student2']) {
    const page = await pageFor(name)
    const task = await ok(page, '/relational-assessments/assignments/student-experience', { courseId: fixture.courseId, ...product })
    const started = await ok(page, `/relational-assessments/assignments/${task.assignmentId}/start`, {})
    await page.goto(`${base}/relational/attempts/${started.attempt.id}`)
    await finishRuntime(page, started.attempt.id)
  }
  const teacher = await pageFor('legacyTeacher')
  const query = new URLSearchParams({ courseId: fixture.courseId, ...product })
  const report = await ok(teacher, `/relational-assessments/reports/cohort?${query}`)
  assert.equal(report.state, 'READY', JSON.stringify(report))
  assert.equal(report.respondentCount, 3)
  const protectedAttempt = evidence.attempts.find(a => a.user === 'student0' && a.runId !== null)
  const binding = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: protectedAttempt.attemptId } })
  await denied(await pageFor('student0'), `/relational-assessments/assignments/${binding.assignmentRef}/report-target`)
  record('legacy Course: three real canonical results aggregate normally; Organization assignment cannot enter legacy report target')
}
main().then(() => { evidence.status = 'PASSED' }).catch(error => { evidence.status = 'FAILED'; evidence.error = String(error); console.error(error); process.exitCode = 1 })
  .finally(async () => { writeFileSync(`${output}/manifest.json`, JSON.stringify(evidence, null, 2)); await browser?.close(); await prisma.$disconnect() })
