/* Missing measurement-version UI acceptance only. Real compiled UI and API.
 * Fixture setup is explicit; no fulfilled/mock API DTOs, seeded FINALs, or
 * signed-session/MFA shortcuts. One lost response is injected AFTER the real
 * upstream write succeeds to exercise the browser's exact-request recovery. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const { createResponseLoss } = require('./helpers/measurement-response-loss.cjs')

// Playwright's getByLabel(..., {exact:true}) reads a wrapping label's
// descendant option text too. Target the explicitly named wrapping label and
// its select; retain strict single-element resolution (never .first()).
function labeledControl(scope, text, tag) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return scope.locator('label').filter({ hasText: new RegExp('^' + escaped) }).locator(tag)
}
const labeledSelect = (scope, text) => labeledControl(scope, text, 'select')
const labeledTextarea = (scope, text) => labeledControl(scope, text, 'textarea')
async function responseData(response) {
  assert.equal(response.status(), 200, 'UI request HTTP success: ' + new URL(response.url()).pathname)
  const envelope = await response.json()
  assert.equal(envelope.code, 0, envelope.message)
  assert.ok(envelope.data !== undefined, 'Nonempty real API result')
  return envelope.data
}
async function clickWrite(page, target, endpoint, method = 'POST') {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === method)
  await target.click()
  return responseData(await response)
}
async function firstRealOption(select) {
  const option = select.locator('option').filter({ hasNotText: /^请选择$|^选择/ })
  await option.first().waitFor({ state: 'attached' })
  const value = await select.locator('option').evaluateAll(rows => rows.find(row => row.value)?.value)
  assert.ok(value, 'Required real fixture option must be available')
  await select.selectOption(value)
  return value
}
async function layout(page, output, name, check) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await page.evaluate(() => document.fonts.ready)
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      // No text, values, IDs, attributes, HTML, URLs or session data.
      overflowing: [...document.querySelectorAll('body *')].map(element => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
        return { tag: element.tagName, left: Math.round(rect.left), right: Math.round(rect.right),
          width: Math.round(rect.width), minWidth: style.minWidth, overflowWrap: style.overflowWrap,
          whiteSpace: style.whiteSpace }
      }).filter(rect => rect.right > innerWidth + 1 || rect.left < -1).slice(0, 40),
    }))
    // Capture the actual failing page before its isolated context is closed.
    await page.screenshot({ path: path.join(output, name + '-' + width + '.png'), fullPage: true })
    fs.writeFileSync(path.join(output, name + '-' + width + '-geometry.json'), JSON.stringify(geometry, null, 2))
    check(geometry.documentWidth <= geometry.viewport + 1, name + ': no overflow at ' + width)
  }
}
async function authorReport(page, studio, base, { title, audience, check }) {
  await studio.getByLabel('报告系列标识', { exact: true }).fill('browser-representative')
  await studio.getByLabel('报告版本', { exact: true }).fill('1')
  const draft = await clickWrite(page, studio.getByRole('button', { name: '创建报告草稿', exact: true }), base)
  await studio.getByLabel('报告标题', { exact: true }).fill(title)
  await labeledSelect(studio, '受众').selectOption(audience)
  await studio.getByRole('button', { name: '添加指标', exact: true }).click()
  await studio.getByLabel('局限说明（每行一条）', { exact: true }).fill('Synthetic browser acceptance only; not population norms.')
  await clickWrite(page, studio.getByRole('button', { name: '保存报告草稿', exact: true }), base + '/' + draft.id, 'PATCH')
  await studio.getByText('报告草稿已保存。', { exact: true }).waitFor()
  await labeledSelect(studio, '预览情境').selectOption('NO_REFERENCE')
  const preview = await clickWrite(page, studio.getByRole('button', { name: '预览合成报告', exact: true }), base + '/' + draft.id + '/preview')
  check(preview.synthetic === true && preview.scenario === 'NO_REFERENCE', 'UI synthetic report preview explicitly identifies no-reference scenario')
  await studio.getByText('仅使用合成指标与参考情境，未读取真实答卷。', { exact: true }).waitFor()
  await studio.getByLabel('发布说明', { exact: true }).fill('Synthetic browser authoring publication')
  const release = await clickWrite(page, studio.getByRole('button', { name: '发布报告版本', exact: true }), base + '/' + draft.id + '/publish')
  await studio.getByText('报告版本已发布。已有报告与原始分数未被改写。', { exact: true }).waitFor()
  check(await studio.getByLabel('报告标题', { exact: true }).isDisabled(), 'Published report editor is immutable')
  assert.ok(release.releaseId, 'Published report release identity')
  return release
}
async function formalReferenceJourney({ page, browser, fixture: f, output, check }) {
  assert.ok(f.formalGovernanceGrantId && f.otherTeacher?.username && f.referenceConsent?.body,
    'Independent formal reviewer grant and original accepted consent are required')
  const submission = page.getByRole('region', { name: '提交正式参考候选', exact: true })
  await submission.waitFor()
  for (const label of ['正式提交说明', '目标人群说明', '正式适用性依据', '正式样本充分性判断', '正式不确定性说明', '已记录同意允许本用途的依据']) {
    await submission.getByLabel(label, { exact: true }).fill('Isolated synthetic aggregate browser acceptance only; five synthetic learners, not a population norm. The original accepted notice permits this software exercise only.')
  }
  await labeledSelect(submission, '目标人群选择').selectOption('GENERAL_POPULATION')
  await submission.getByLabel('目标范围与代表性依据', { exact: true }).fill('Explicit fixture-only software matching exercise, not scientific evidence of general-population representativeness.')
  const formal = await clickWrite(page, submission.getByRole('button', { name: '提交给独立正式审核', exact: true }), '/api/training/reference-governance/submissions')
  await submission.getByText('正式候选已提交；请将下列候选 ID 与摘要交给有明确审核能力的独立人员。', { exact: true }).waitFor()
  check(formal.sampleCount === 5 && formal.analyzerId === f.teacher.id, 'UI formal submission preserves exact source candidate and analyzer identity')
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }), reviewer = await context.newPage(), errors = []
  reviewer.on('pageerror', error => errors.push(error.name))
  reviewer.on('dialog', dialog => dialog.accept().catch(() => errors.push('DialogHandlingFailure')))
  reviewer.setDefaultTimeout(20000)
  try {
    await reviewer.goto(f.trainingUrl + '/teacher/account-login')
    await reviewer.locator('#auth-username').fill(f.otherTeacher.username)
    await reviewer.locator('#auth-password').fill(f.otherTeacher.password || f.password)
    await clickWrite(reviewer, reviewer.getByRole('button', { name: '登录', exact: true }), '/api/auth/training-login')
    await reviewer.waitForURL(/\/dashboard(?:\?|$)/)
    const governance = reviewer.getByRole('region', { name: '正式参考独立审核与发布', exact: true })
    await governance.getByLabel('正式候选 UUID', { exact: true }).fill(formal.candidateId)
    await labeledSelect(governance, '读取能力授权').selectOption(f.formalGovernanceGrantId)
    const read = await clickWrite(reviewer, governance.getByRole('button', { name: '读取正式聚合证据', exact: true }), '/api/training/reference-governance/read')
    await governance.getByRole('article', { name: '正式候选聚合证据', exact: true }).waitFor()
    await governance.getByText('已接受同意正文：' + f.referenceConsent.body, { exact: true }).waitFor()
    check(read.candidateId === formal.candidateId && f.otherTeacher.id !== read.analyzerId,
      'Independent reviewer UI reads exact formal candidate and original accepted consent body')
    await governance.getByLabel('正式审核依据', { exact: true }).fill('Independent synthetic reviewer checked original accepted notice, exact source and fixture-only scope; no real scientific approval asserted.')
    await governance.getByRole('checkbox', { name: '已核对实际同意范围、适用人群和统计依据，未将提交说明当作新增同意', exact: true }).check()
    const review = await clickWrite(reviewer, governance.getByRole('button', { name: '保存正式审核决定', exact: true }), '/api/training/reference-governance/reviews')
    await governance.getByText('审核已保存：' + review.reviewId + ' · APPROVED', { exact: true }).waitFor()
    await labeledSelect(governance, '正式发布授权').selectOption(f.formalGovernanceGrantId)
    await governance.getByLabel('正式发布 key', { exact: true }).fill('browser-formal')
    await governance.getByLabel('正式发布版本', { exact: true }).fill('1')
    const release = await clickWrite(reviewer, governance.getByRole('button', { name: '发布精确正式参考', exact: true }), '/api/training/reference-governance/publish')
    await governance.getByText('正式发布已确认：' + release.releaseId + ' · 版本 1 · ' + release.status, { exact: true }).waitFor()
    check(release.status === 'PUBLISHED', 'Independent reviewer UI publishes the exact formally reviewed synthetic candidate')
    await layout(reviewer, output, 'training-formal-reference', check)
    check(errors.length === 0, 'Formal independent reviewer has no uncaught browser errors')
    check(true, requiredChecks[5])
  } finally { await context.close() }
}
async function trainingJourney({ browser, fixture: f, output, check, prepareFinals, issueGrant }) {
  const base = f.trainingUrl
  assert.equal(new URL(base).hostname, 'training.eduk12.top', 'Compiled Training UI requires its real canonical host, mapped to loopback')
  for (const key of ['product', 'teacher', 'courseId', 'itemId', 'reportGrantId', 'referenceGrantId', 'selectionProduct', 'selectionItemId']) assert.ok(f[key], 'Required fixture: ' + key)
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 } })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.name + ': ' + error.message))
  page.on('dialog', dialog => dialog.accept().catch(() => errors.push('DialogHandlingFailure')))
  page.setDefaultTimeout(20000)
  try {
    await page.goto(base + '/teacher/account-login')
    await page.locator('#auth-username').fill(f.teacher.username)
    await page.locator('#auth-password').fill(f.teacher.password || f.password)
    await clickWrite(page, page.getByRole('button', { name: '登录', exact: true }), '/api/auth/training-login')
    await page.waitForURL(/\/dashboard(?:\?|$)/)
    await page.goto(base + '/questionnaire-products/' + f.product.id)
    const workspace = page.getByRole('region', { name: 'Training 私有报告工作台', exact: true })
    await workspace.getByLabel('报告内容授权 ID', { exact: true }).fill(f.reportGrantId)
    await workspace.getByRole('button', { name: '打开课程报告', exact: true }).click()
    const studio = workspace.getByRole('region', { name: '项目私有报告', exact: true })
    await labeledSelect(studio, '测量发布版本').waitFor()
    const reportBase = '/api/questionnaire-products/' + f.product.id + '/content-reports/courses/' + f.courseId
    f.report = await authorReport(page, studio, reportBase, { title: 'Synthetic browser frozen report', audience: 'teacher', check })
    await layout(page, output, 'training-report-editor', check)
    check(errors.length === 0, 'Training report editor has no uncaught browser errors')

    const selection = page.getByRole('region', { name: '投放报告与参考选择', exact: true })
    await selection.getByRole('button', { name: '读取可选报告与参考', exact: true }).click()
    await selection.getByLabel('报告 ' + f.itemId, { exact: true }).selectOption(f.report.releaseId)
    const endpoint = '/api/questionnaire-products/' + f.product.id + '/content-report-selection'
    const loss = createResponseLoss()
    const loseCommittedResponse = loss.handler
    await page.route('**' + endpoint, loseCommittedResponse)
    await selection.getByRole('button', { name: '保存报告选择', exact: true }).click()
    await selection.getByRole('button', { name: '核对原选择请求', exact: true }).waitFor()
    // Pending is rendered before transmission; wait for the observed transport
    // failure before inspecting the upstream commit or removing this route.
    await selection.getByRole('alert').waitFor()
    await page.unroute('**' + endpoint, loseCommittedResponse)
    await loss.settled
    assert.equal(loss.state.failure, null, 'Real upstream commit must be confirmed before recovery: ' + loss.state.failure)
    const committed = loss.state.committed
    assert.ok(committed, 'Real server write completed before browser transport loss')
    await page.reload()
    await page.getByRole('button', { name: '核对原选择请求', exact: true }).click()
    await page.getByText('已核对：服务器当前已保存相同选择。', { exact: true }).waitFor()
    check(loss.state.requests === 1 && committed.trainingReportSelectionDraft.units[0].reportReleaseId === f.report.releaseId,
      'Report selection survives lost committed response and reload; UI reconciles original selection without resubmit')
    await page.getByRole('button', { name: '发布前自检', exact: true }).click()
    await page.getByRole('heading', { name: '当前草稿自检通过', exact: true }).waitFor()
    f.product = await clickWrite(page, page.getByRole('button', { name: '发布组合测评', exact: true }), '/api/questionnaire-products/' + f.product.id + '/publish')
    await page.getByRole('region', { name: '发布状态', exact: true }).waitFor()
    check(f.product.status === 'PUBLISHED', 'UI publishes selected report with the questionnaire')
    check(true, requiredChecks[0])

    // Only prerequisite creation: original native submit and original outbox.
    // Backend replay/transaction/race assertions already have their own evidence.
    const prepared = await prepareFinals()
    Object.assign(f, prepared)
    assert.equal(f.finals.length, 5, 'Exactly five synthetic accepted facts for descriptive reference floor')
    assert.ok(f.finals.every(row => row.attemptId), 'No missing FINAL fixture')
    await page.goto(base + '/courses/' + f.courseId + '/detail')
    await page.getByRole('button', { name: '数据分析', exact: true }).click()
    const reference = page.getByRole('region', { name: '课程描述性参考工作台', exact: true })
    await firstRealOption(labeledSelect(reference, '参考来源投放'))
    await firstRealOption(labeledSelect(reference, '参考数值指标'))
    await reference.getByLabel('analyze 授权 ID', { exact: true }).fill(f.referenceGrantId)
    await reference.getByLabel('参考候选版本', { exact: true }).fill('browser-1')
    for (const label of ['方法依据', '纳入规则', '缺失处理', '重复作答', '组织聚类', '施测差异', '不确定性', '适用范围', '样本充分性']) {
      await reference.getByLabel(label, { exact: true }).fill('Synthetic browser fixture: five distinct learners; descriptive only.')
    }
    const candidatePath = '/api/questionnaire-products/' + f.product.id + '/reference-candidates/courses/' + f.courseId
    const candidate = await clickWrite(page, reference.getByRole('button', { name: '创建课程描述性候选', exact: true }), candidatePath + '/')
    check(candidate.sampleSize === 5, 'UI reference candidate reads the five native FINAL prerequisites')
    await reference.getByLabel('review 授权 ID', { exact: true }).fill(f.referenceGrantId)
    await reference.getByRole('button', { name: '读取课程候选核验', exact: true }).click()
    await reference.getByText('已核对当前候选内容和数据权限。', { exact: true }).waitFor()
    await reference.getByLabel('审核说明', { exact: true }).fill('Reviewed synthetic exact source; not a population norm.')
    await clickWrite(page, reference.getByRole('button', { name: '提交课程参考审核', exact: true }), candidatePath + '/' + candidate.candidateId + '/review')
    await reference.getByLabel('publish 授权 ID', { exact: true }).fill(f.referenceGrantId)
    await reference.getByLabel('参考发布 key', { exact: true }).fill('browser-private')
    await reference.getByLabel('参考发布版本', { exact: true }).fill('1')
    const published = await clickWrite(page, reference.getByRole('button', { name: '发布课程私有参考', exact: true }), candidatePath + '/' + candidate.candidateId + '/publish')
    await reference.getByText('私有描述性参考已发布：' + published.releaseId + '。既有投放和历史结果不会自动切换。', { exact: true }).waitFor()
    await layout(page, output, 'training-reference', check)
    check(true, 'UI creates, independently reads, reviews and publishes a private descriptive reference')
    await formalReferenceJourney({ page, browser, fixture: f, output, check })

    await page.goto(base + '/questionnaire-products/' + f.selectionProduct.id)
    const next = page.getByRole('region', { name: '投放报告与参考选择', exact: true })
    await next.getByRole('button', { name: '读取可选报告与参考', exact: true }).click()
    const referenceChoice = next.getByRole('checkbox', { name: /descriptive_sample/ })
    await referenceChoice.check()
    const selected = await clickWrite(page, next.getByRole('button', { name: '保存参考选择', exact: true }), '/api/questionnaire-products/' + f.selectionProduct.id + '/content-reference-selection')
    check(selected.trainingReferenceSelectionDraft.units.some(unit => unit.choices.some(choice => choice.releaseId === published.releaseId)),
      'UI explicitly selects the private reference in a new draft; existing publication is unchanged')
    check(true, requiredChecks[1])

    const original = f.finals[0]
    f.dataGrantId = f.dataGrantId || await issueGrant({ product: 'TRAINING', purpose: 'data', subjectId: f.teacher.id, scopeId: f.courseId,
      resourceIds: [original.attemptId], capabilities: ['data.reinterpret'] })
    assert.ok(f.expiredDataGrantId, 'An expired synthetic capability fixture is required, never silently skipped')
    for (const [target, grantId, label] of [[f.finals[1], f.dataGrantId, 'exact-attempt scope'], [original, f.expiredDataGrantId, 'expired capability']]) {
      await page.goto(base + '/composite-assessments/' + f.product.id + '/attempts/' + target.attemptId + '/report')
      const denied = page.getByRole('region', { name: 'Training 独立解释', exact: true })
      await denied.getByLabel('投放课程 UUID', { exact: true }).fill(f.courseId)
      await denied.getByLabel('重新解释授权 UUID', { exact: true }).fill(grantId)
      await denied.getByLabel('新解释原因', { exact: true }).fill('Synthetic browser denial boundary')
      await denied.getByLabel('报告 release UUID（可选）', { exact: true }).fill(f.report.releaseId)
      const refusedResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/questionnaire-products/' + f.product.id + '/courses/' + f.courseId + '/attempts/' + target.attemptId + '/interpretations' && r.request().method() === 'POST')
      await denied.getByRole('button', { name: '确认创建独立解释', exact: true }).click()
      assert.equal((await refusedResponse).status(), 403, label + ' must be rejected by the real API')
      await denied.getByRole('alert').filter({ hasText: '本次明确未执行' }).waitFor()
      check(await denied.getByRole('article', { name: '独立解释结果', exact: true }).count() === 0, 'UI denies ' + label + ' and shows no interpretation artifact')
    }
    check(true, requiredChecks[4])
    await page.goto(base + '/composite-assessments/' + f.product.id + '/attempts/' + original.attemptId + '/report')
    await page.getByRole('heading', { name: 'Synthetic browser frozen report · 单元 ' + f.itemId, exact: true }).waitFor()
    const interpretation = page.getByRole('region', { name: 'Training 独立解释', exact: true })
    await interpretation.getByLabel('投放课程 UUID', { exact: true }).fill(f.courseId)
    await interpretation.getByLabel('重新解释授权 UUID', { exact: true }).fill(f.dataGrantId)
    await interpretation.getByLabel('新解释原因', { exact: true }).fill('Synthetic browser explicitly requested interpretation')
    await interpretation.getByLabel('报告 release UUID（可选）', { exact: true }).fill(f.report.releaseId)
    const interpretationBase = '/api/questionnaire-products/' + f.product.id + '/courses/' + f.courseId + '/attempts/' + original.attemptId + '/interpretations'
    const artifact = await clickWrite(page, interpretation.getByRole('button', { name: '确认创建独立解释', exact: true }), interpretationBase)
    await interpretation.getByRole('article', { name: '独立解释结果', exact: true }).waitFor()
    await interpretation.getByRole('button', { name: '读取精确解释工件', exact: true }).click()
    await interpretation.getByRole('article', { name: '独立解释结果', exact: true }).waitFor()
    const downloadPromise = page.waitForEvent('download')
    await interpretation.getByRole('button', { name: '独立导出解释 JSON', exact: true }).click()
    const download = await downloadPromise
    assert.equal(await download.failure(), null)
    const document = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
    check(document.document.schema === 'TRAINING_INTERPRETATION_EXPORT_V1' && document.document.artifactId === artifact.artifactId
      && document.document.artifact.attemptId === original.attemptId && /^[a-f0-9]{64}$/.test(document.exportHash),
      'Real browser download contains exact independent interpretation artifact, not an API-only assertion')
    await download.delete()
    await layout(page, output, 'training-final-interpretation', check)
    check(errors.length === 0, 'Training representative workflow has no uncaught browser errors')
    check(true, requiredChecks[2])
    return { report: f.report, artifactId: artifact.artifactId, referenceReleaseId: published.releaseId }
  } finally { await context.close() }
}
function totp(secretBase64) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const mac = createHmac('sha1', Buffer.from(secretBase64, 'base64')).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
async function surveyJourney({ browser, fixture: f, output, check }) {
  assert.ok(f.survey && f.survey.researcher && f.survey.project, 'Required Survey fixture; no silently skipped surface')
  const s = f.survey, base = f.surveyUrl
  assert.equal(new URL(base).hostname, 'survey.eduk12.top')
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.name + ': ' + error.message))
  page.on('dialog', dialog => dialog.accept().catch(() => errors.push('DialogHandlingFailure')))
  page.setDefaultTimeout(20000)
  try {
    await page.goto(base + '/login')
    await page.getByLabel('研究者登录名', { exact: true }).fill(s.researcher.username)
    await page.getByLabel('密码', { exact: true }).fill(s.researcher.password)
    await page.getByRole('button', { name: '进入双因素验证', exact: true }).click()
    await page.getByRole('heading', { name: '双因素验证', exact: true }).waitFor()
    assert.ok(s.researcher.totpSecretBase64, 'Synthetic enrolled TOTP seed required, never a forged MFA session')
    await page.getByLabel('动态验证码／恢复码', { exact: true }).fill(totp(s.researcher.totpSecretBase64))
    await page.getByRole('button', { name: '验证并登录', exact: true }).click()
    await page.getByRole('heading', { name: '我的研究', exact: true }).waitFor()
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: s.project.title, exact: true }) })
      .getByRole('button', { name: '查看/编辑', exact: true }).click()
    const settings = page.getByRole('tab', { name: '研究设置', exact: true })
    await settings.focus()
    await page.keyboard.press('ArrowRight')
    check(await page.getByRole('tab', { name: '研究工具', exact: true }).evaluate(element => element === document.activeElement && element.getAttribute('aria-selected') === 'true'),
      'Survey workspace arrow navigation moves actual keyboard focus and selected panel')
    await page.keyboard.press('ArrowRight')
    const studio = page.getByRole('region', { name: '项目私有报告', exact: true })
    await studio.getByRole('button', { name: '发布所选测量版本', exact: true }).waitFor()
    await studio.getByRole('button', { name: '发布所选测量版本', exact: true }).click()
    await studio.getByText('测量版本已发布，可用于编制报告；未开启被试采集。', { exact: true }).waitFor()
    await authorReport(page, studio, '/api/survey/projects/' + s.project.id + '/report-drafts', { title: 'Synthetic Survey report', audience: 'researcher', check })
    await layout(page, output, 'survey-report-editor', check)
    check(errors.length === 0, 'Survey real TOTP and report editor have no uncaught browser errors')
    check(true, requiredChecks[3])
  } finally { await context.close() }
}
const requiredChecks = ['measurement.training.report-and-recovery', 'measurement.training.reference-selection', 'measurement.training.final-interpretation-download', 'measurement.survey.report-editor-totp-focus', 'measurement.training.denied-scope-and-expiry', 'measurement.training.formal-independent-review-publish']
module.exports = { labeledSelect, labeledTextarea, requiredChecks, runJourneys: async options => {
  const reportCheck = options.check
  options = { ...options, check: (condition, name) => reportCheck(name, condition, true) }
  assert.equal(typeof options.prepareFinals, 'function', 'Real FINAL prerequisite callback is required')
  assert.equal(typeof options.issueGrant, 'function', 'Explicit synthetic capability fixture callback is required')
  await trainingJourney(options)
  await surveyJourney(options)
} }
