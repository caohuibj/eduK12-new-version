/** Real candidate UI + API + PG acceptance. No fulfilled network mocks, injected answers,
 * fake sessions, virtual clocks or certificate bypass. CI owns HTTPS trust/services/cleanup.
 * Private fixture: SCALE_AUTHORING_FIXTURE_FILE. Safe artifacts: SCALE_AUTHORING_EVIDENCE_DIR.
 * Requires SCALE_AUTHORING_ISOLATED=1, GITHUB_ACTIONS=true, NODE_ENV=test and exact GITHUB_SHA.
 * Do not run locally when browser/socket execution is denied.
 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
let chromium // Loaded only by the guarded real-browser entry; pure contracts need no browser dependency.
const REQUIRED = ['training-editor-native', 'training-stable-item-operations', 'training-quality-roundtrip', 'training-published', 'training-final-report-image', 'survey-editor-native', 'survey-quality-roundtrip', 'survey-published', 'survey-final-report-image', 'survey-raw-quality-export', 'training-report-image-denies-other-user', 'survey-report-image-denies-missing-proof', 'desktop-mobile-layout']
const evidence = { schemaVersion: 1, status: 'RUNNING', checks: [], screenshots: [], browserErrors: [], failedRequests: [], imageAuthorization: [], accessibility: [], computedStyles: [], layoutChecks: [], blockedExternalRequests: 0, scope: 'Real Chromium, synthetic accounts, candidate built UI and real API/PostgreSQL; no physical-device timing claim' }
let fixture, output, browser, activePage
const diagnosticSecrets = new Set()
const phase = name => { evidence.phase = name; if (output) save() }
const check = (name, condition) => { assert.ok(condition, name); evidence.checks.push(name) }
const save = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2))
const button = (page, name) => page.getByRole('button', { name, exact: true })
// Generated test image, no external download or personal media.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOwyZtGEmIY1ZA3Gko2wzVpAADFt0AQijuzMgAAAABJRU5ErkJggg==', 'base64')
const imageFile = { name: 'synthetic-feedback.png', mimeType: 'image/png', buffer: png }
async function responseData(response) {
  assert(response.ok(), 'Real API returned HTTP ' + response.status() + ' for ' + new URL(response.url()).pathname)
  const body = await response.json(); assert.equal(body.code, 0, 'API envelope rejected ' + new URL(response.url()).pathname)
  return body.data
}
async function action(page, endpoint, trigger, method = 'POST') {
  activePage = page
  const [response] = await Promise.all([page.waitForResponse(r => r.request().method() === method && (endpoint instanceof RegExp ? endpoint.test(new URL(r.url()).pathname) : new URL(r.url()).pathname === endpoint)), trigger()])
  return { data: await responseData(response), request: response.request() }
}
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'UTC', acceptDownloads: true, serviceWorkers: 'block' })
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (!['http:', 'https:'].includes(url.protocol) || [fixture.trainingUrl, fixture.surveyUrl].includes(url.origin)) return route.continue(); evidence.blockedExternalRequests++; return route.abort('blockedbyclient') })
  const page = await context.newPage(); activePage = page
  page.setDefaultTimeout(25000); page.setDefaultNavigationTimeout(30000)
  page.on('pageerror', e => evidence.browserErrors.push(redactDiagnostics({ name: e.name, message: e.message })))
  page.on('requestfailed', request => {
    if (evidence.failedRequests.length < 20) evidence.failedRequests.push(redactDiagnostics({ phase: evidence.phase, method: request.method(), pathname: new URL(request.url()).pathname, reason: request.failure()?.errorText }))
  })
  page.on('dialog', d => { evidence.browserErrors.push('UnexpectedDialog'); return d.dismiss() })
  return page
}
async function capture(page, name, width, failure = false) {
  const file = name + '-' + width + '.png'
  await page.screenshot({ path: path.join(output, file), fullPage: true,
    mask: [page.locator('code,input,textarea,svg,[href*="/r/"]')] })
  const item = { name, width, file }
  if (failure) evidence.failureScreenshot = item
  else evidence.screenshots.push(item)
  save()
}
// Preserve diagnostic structure and measured colors, not authentication values or URLs.
function redactDiagnostics(value) {
  if (Array.isArray(value)) return value.map(redactDiagnostics)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(password|token|accessCredential|researchCode|authorization|cookie|secret|totpSecretBase64)$/i.test(key) ? '[redacted-secret]' : redactDiagnostics(item)]))
  if (typeof value !== 'string') return value
  let text = value.replace(/\b(value|src|href|action|data-[\w-]+)=("[^"]*"|'[^']*')/gi, '$1="[redacted]"')
    .replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted-secret]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/((?:password|accessCredential|researchCode|authorization|cookie|secret|token)\s*[:=]\s*)[^\s,;}]+/gi, '$1[redacted-secret]')
  for (const secret of [...diagnosticSecrets, fixture?.teacher?.password, fixture?.student?.password, fixture?.researcher?.password, fixture?.researcher?.totpSecretBase64].filter(Boolean)) text = text.split(secret).join('[redacted-secret]')
  return text
}
async function layout(page, name, scope) {
  activePage = page
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(150) // CSS/layout settlement only, never accelerate task timing.
    await capture(page, name, width)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    evidence.layoutChecks.push({ name, width, overflow }); save()
    const surface = page.locator(scope); assert(await surface.count() > 0, name + ' missing native surface')
    if (width === 1440) {
      assert(await page.locator('script[type=module][src*="/assets/"]').count() > 0, 'Candidate must use built module assets')
      assert.equal(await page.locator('script[src*="/@vite/client"]').count(), 0)
      evidence.computedStyles.push({ name, ...(await surface.first().evaluate(node => { const style = getComputedStyle(node); return { fontFamily: style.fontFamily, color: style.color, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius } })) })
      await accessibility(page, name)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
async function accessibility(page, name) {
  const moduleRoot = path.resolve(__dirname, '../../.github/release-tools')
  const version = require(path.join(moduleRoot, 'node_modules/axe-core/package.json')).version
  assert.equal(version, require(path.join(moduleRoot, 'package.json')).dependencies['axe-core'])
  const source = fs.readFileSync(path.join(moduleRoot, 'node_modules/axe-core/axe.min.js'), 'utf8')
  // Test-tool-only route, never an application page, API, asset or report replacement.
  const toolUrl = new URL('/scale-authoring-ci-axe.js', page.url()).href
  const serveTool = route => route.fulfill({ contentType: 'application/javascript', body: source })
  await page.route(toolUrl, serveTool)
  try { await page.addScriptTag({ url: toolUrl }) } finally { await page.unroute(toolUrl, serveTool) }
  const result = await page.evaluate(async () => {
    const result = await window.axe.run({ include: ['main'] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
    return { version: window.axe.version, passes: result.passes.length, incomplete: result.incomplete.length,
      violations: result.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl, nodeCount: v.nodes.length, nodes: v.nodes })) }
  })
  evidence.accessibility.push({ name, ...redactDiagnostics(result), diagnosticRedaction: 'URL, input-value and secret attributes removed; targets, HTML structure, failureSummary and all check/related-node data retained' }); save()
  // Record visual failures now; fail the run after all reachable real journeys.
  // Tool/runtime failures and all functional assertions still stop immediately.
  assert.equal(result.version, version); assert(result.passes > 0)
}
function totpAt(secretBase64, now = Date.now()) {
  const step = Math.floor(now / 30000)
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', Buffer.from(secretBase64, 'base64')).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  return { step, code: String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0') }
}
function failureDetail(error, currentPhase = evidence.phase || 'prerequisites') {
  return redactDiagnostics({ phase: currentPhase, name: error?.name || 'Error', message: String(error?.message || error),
    stack: typeof error?.stack === 'string' ? error.stack.slice(0, 6000) : undefined, completedChecks: evidence.checks.length })
}
function assertDeniedImage(result, expectedStatus) {
  assert.equal(result.status, expectedStatus, 'Expected explicit report-image authorization rejection')
  assert(!/^image\//i.test(result.contentType || ''), 'Denied response must not be image content')
  assert.equal(result.pngSignature, false, 'Denied response must not contain PNG bytes')
  assert.equal(result.jpegSignature, false, 'Denied response must not contain JPEG bytes')
  assert.equal(result.webpSignature, false, 'Denied response must not contain WebP bytes')
}
async function imageRequest(page, endpoint, method = 'GET', body) {
  assert.equal(new URL(endpoint).origin, new URL(page.url()).origin)
  return page.evaluate(async ({ endpoint, method, body }) => {
    const response = await fetch(endpoint, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-EduK12-Account-View': 'BUSINESS', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { status: response.status, contentType: response.headers.get('content-type'), length: bytes.length,
      pngSignature: bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
      jpegSignature: bytes[0] === 0xff && bytes[1] === 0xd8,
      webpSignature: String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' }
  }, { endpoint, method, body })
}
function assertExportParts(parts, ticket) {
  assert.deepEqual(parts.map(p => p.part), ['csv', 'codebook', 'manifest'])
  const artifact = parts[0].artifact
  assert.equal(artifact.id, ticket.id); assert.equal(artifact.format, ticket.format)
  for (const part of parts) assert.deepEqual(part.artifact, artifact, 'All three downloads must use the exact same frozen ticket')
  assert.equal(parts[0].text.replace(/^\uFEFF/, ''), artifact.csv)
  assert.deepEqual(JSON.parse(parts[1].text), artifact.codebook)
  assert.deepEqual(JSON.parse(parts[2].text), artifact.manifest)
  const names = parts.map(p => p.filename)
  assert.equal(new Set(names).size, 3)
  assert(names[0].endsWith('.csv') && names[1].endsWith('_codebook.json') && names[2].endsWith('_manifest.json'))
  assert.equal(names[0].slice(0, -4), names[1].slice(0, -14))
  assert.equal(names[0].slice(0, -4), names[2].slice(0, -14))
  assert.equal(artifact.manifest.rowCount, 3, 'One FINAL with three original answers')
  assert(artifact.csv.includes('item_purpose') && artifact.csv.includes('ATTENTION_CHECK') && artifact.csv.includes('SOCIAL_DESIRABILITY'))
  assert(Array.isArray(artifact.codebook))
  assert.equal(artifact.codebook.filter(x => x.purpose === 'ATTENTION_CHECK').length, 1)
  assert.equal(artifact.codebook.filter(x => x.purpose === 'SOCIAL_DESIRABILITY').length, 1)
  return artifact
}
async function trainingLogin(page, actor, student = false) {
  await page.goto(fixture.trainingUrl + (student ? '/student/login' : '/teacher/account-login'))
  await page.locator('#auth-username').fill(actor.username); await page.locator('#auth-password').fill(actor.password)
  await action(page, '/api/auth/training-login', () => button(page, '登录').click())
  await page.waitForURL(student ? /\/student(?:\?|$)/ : /\/dashboard(?:\?|$)/)
}
async function trainingJourney() {
  phase('training-author-login')
  const author = await newPage(); await trainingLogin(author, fixture.teacher)
  phase('training-author-create'); await author.goto(fixture.trainingUrl + '/scales/new')
  await author.getByLabel('量表编码', { exact: true }).fill('SCALE-CI-' + fixture.runId)
  await author.getByLabel('量表名称', { exact: true }).fill('Synthetic Training scale')
  await author.getByRole('combobox', { name: '可见性', exact: true }).selectOption('PUBLIC')
  assert.equal(await author.getByLabel('自有内容 / 授权声明', { exact: true }).count(), 0, 'New metadata step must not accept unsavable definition changes')
  const created = await action(author, '/api/scales', () => button(author, '保存基本信息').click())
  const scaleId = created.data.id; assert(scaleId)
  await author.waitForURL('**/scales/' + scaleId)
  await button(author, '题目').click(); await button(author, '增加题目').click()
  await author.getByPlaceholder('题目内容', { exact: true }).first().fill('Synthetic scored content')
  await button(author, '插入注意力题').click(); await button(author, '插入社会赞许性题（测谎题）').click()
  const codes = await author.locator('input[title="itemCode 是稳定标识，不能在编辑器中修改"]').evaluateAll(nodes => nodes.map(n => n.value))
  assert.equal(codes.length, 3); assert.equal(new Set(codes).size, 3)
  await button(author, '复制 ' + codes[0]).click()
  const itemIds = author.locator('input[title="itemCode 是稳定标识，不能在编辑器中修改"]')
  const copied = await itemIds.evaluateAll(nodes => nodes.map(n => n.value))
  assert.equal(new Set(copied).size, 4); assert.equal(copied[0], codes[0]); assert(!codes.includes(copied[1]))
  await itemIds.nth(1).locator('..').getByRole('button', { name: '删除', exact: true }).click()
  await button(author, '上移 ' + codes[2]).click()
  assert.deepEqual(await itemIds.evaluateAll(nodes => nodes.map(n => n.value)), [codes[0], codes[2], codes[1]])
  await button(author, '下移 ' + codes[2]).click()
  check('training-stable-item-operations', JSON.stringify(await itemIds.evaluateAll(nodes => nodes.map(n => n.value))) === JSON.stringify(codes))
  await author.getByRole('combobox', { name: '目标选项 ' + codes[1], exact: true }).selectOption({ label: '选项 2' })
  await author.getByPlaceholder('题目内容', { exact: true }).nth(1).fill('请选择「选项 2」。')
  await button(author, '计分').click(); await button(author, '+ 总分').click(); await button(author, codes[0]).click()
  assert.equal(await button(author, codes[1]).count(), 0); assert.equal(await button(author, codes[2]).count(), 0)
  await button(author, '报告文案').click()
  await author.getByLabel('自有内容 / 授权声明', { exact: true }).fill('Self-authored synthetic CI content only')
  await button(author, '增加原始分反馈区间').click()
  await author.getByLabel('total_1 区间 1 上限', { exact: true }).fill('10')
  await author.getByLabel('total_1 区间 1 反馈文字', { exact: true }).fill('TRAINING RAW INTERVAL FEEDBACK')
  const upload = await action(author, '/api/uploads/image', () => author.getByLabel('上传反馈图片', { exact: true }).setInputFiles(imageFile))
  assert(upload.data.assetId && upload.data.contentHash)
  await author.getByLabel('图片说明', { exact: true }).fill('Training synthetic feedback picture')
  check('training-editor-native', await author.locator('.hui-training .scale-edit-page .scale-raw-feedback').count() === 1)
  await layout(author, 'training-editor', '.scale-edit-page')
  phase('training-author-save'); const saved = await action(author, '/api/scales/' + scaleId + '/definition', () => button(author, '保存报告定义').click(), 'PUT')
  const written = saved.request.postDataJSON().definition
  assert.equal(written.license.note, 'Self-authored synthetic CI content only')
  check('training-quality-roundtrip', written.items.filter(x => x.purpose && x.purpose !== 'CONTENT').length === 2 && written.scoring.scores[0].source.items.length === 1 && written.report.rawScoreFeedback.rules[0].ranges[0].images[0].asset.assetId === upload.data.assetId)
  await author.getByText(/已保存，并重新读取确认计分题目。/).waitFor()
  assert.equal(await author.getByLabel('自有内容 / 授权声明', { exact: true }).inputValue(), written.license.note)
  await action(author, '/api/scales/' + scaleId + '/publish', () => button(author, '发布描述性量表').click())
  check('training-published', true)
  phase('training-participant'); const learner = await newPage(); await trainingLogin(learner, fixture.student, true)
  const started = learner.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/scales/' + scaleId + '/assessments')
  await learner.goto(fixture.trainingUrl + '/student/scales/' + scaleId)
  const admission = await responseData(await started)
  assert(!JSON.stringify(admission).includes('attentionTarget'), 'Participant response exposes author target key')
  // Training auto-advances native single-choice items after the real persistence promise.
  for (const [index, prompt] of ['Synthetic scored content', '请选择「选项 2」。', '我从不撒谎'].entries()) {
    await learner.getByRole('heading', { name: prompt, exact: true }).waitFor()
    await learner.getByRole('radio', { name: index === 1 ? '选项 2' : '选项 1', exact: true }).check()
  }
  const trainingImage = learner.waitForResponse(r => r.request().method() === 'GET' && /\/api\/scales\/assessments\/[^/]+\/report-assets\/[^/]+$/.test(new URL(r.url()).pathname))
  const [trainingImageResponse] = await Promise.all([trainingImage, action(learner, /\/api\/scales\/assessments\/[^/]+\/submit$/, () => button(learner, '完成测评').click())])
  await learner.getByText('TRAINING RAW INTERVAL FEEDBACK', { exact: true }).waitFor()
  await learner.getByAltText('Training synthetic feedback picture', { exact: true }).waitFor()
  await learner.waitForFunction(() => [...document.images].some(i => i.alt === 'Training synthetic feedback picture' && i.complete && i.naturalWidth > 0))
  assert.equal(trainingImageResponse.status(), 200); assert.match(trainingImageResponse.headers()['content-type'], /^image\/png/); assert((await trainingImageResponse.body()).length > 0)
  check('training-final-report-image', true)
  phase('training-image-authorization')
  const denied = await imageRequest(author, trainingImageResponse.url())
  assertDeniedImage(denied, 404)
  evidence.imageAuthorization.push({ name: 'training-other-user', positiveStatus: trainingImageResponse.status(), deniedStatus: denied.status, deniedImage: denied.pngSignature || denied.jpegSignature || denied.webpSignature || /^image\//i.test(denied.contentType || ''), deniedLength: denied.length })
  check('training-report-image-denies-other-user', true)
  await layout(learner, 'training-report', '.hui-report')
  await author.context().close(); await learner.context().close()
}
async function surveyJourney() {
  phase('survey-author-login')
  const author = await newPage(); await author.goto(fixture.surveyUrl + '/login')
  await author.getByLabel('研究者登录名', { exact: true }).fill(fixture.researcher.username)
  await author.getByLabel('密码', { exact: true }).fill(fixture.researcher.password)
  await button(author, '进入双因素验证').click()
  const loginCode = totpAt(fixture.researcher.totpSecretBase64)
  diagnosticSecrets.add(loginCode.code)
  const loginStep = loginCode.step
  await author.getByLabel('动态验证码／恢复码', { exact: true }).fill(loginCode.code)
  await button(author, '验证并登录').click()
  await author.getByRole('heading', { name: '我的研究', exact: true }).waitFor()
  assert(await author.evaluate(() => isSecureContext && typeof crypto.randomUUID === 'function'))
  await author.locator('article').filter({ has: author.getByRole('heading', { name: fixture.project.title, exact: true }) }).getByRole('button', { name: '查看/编辑', exact: true }).click()
  await author.getByRole('tab', { name: /研究工具/ }).click()
  phase('survey-author-create'); const builder = author.getByRole('region', { name: 'Survey Research Builder', exact: true })
  await builder.getByRole('combobox', { name: '工具类型', exact: true }).selectOption('SCALE')
  await builder.getByLabel('名称', { exact: true }).fill('Synthetic Survey scale')
  const base = '/api/survey/projects/' + fixture.project.id
  const created = await action(author, base + '/instruments', () => button(builder, '创建草稿').click())
  const editor = author.locator('#survey-authoring-definition')
  await button(editor, '新增维度').click()
  await editor.getByLabel('维度 1', { exact: true }).fill('Synthetic dimension')
  for (let i = 1; i <= 3; i++) {
    await button(editor, '增加 Likert 题目').click()
    await editor.getByLabel('题干 ' + i, { exact: true }).fill(['Survey scored content', '请选择不同意', '我从不撒谎'][i - 1])
  }
  await editor.getByLabel('题目用途 2', { exact: true }).selectOption('ATTENTION_CHECK')
  await editor.getByLabel('目标选项 2', { exact: true }).selectOption('o2')
  await editor.getByLabel('题目用途 3', { exact: true }).selectOption('SOCIAL_DESIRABILITY')
  await button(editor, '新增指标反馈').click()
  await editor.getByLabel('反馈 1 区间 1 上限', { exact: true }).fill('10')
  await editor.getByLabel('反馈 1 区间 1 文字', { exact: true }).fill('SURVEY RAW INTERVAL FEEDBACK')
  await action(author, /\/api\/survey\/projects\/[^/]+\/assets$/, () => editor.getByLabel('选择图片上传', { exact: true }).setInputFiles(imageFile))
  await editor.getByLabel('替代文字（屏幕阅读器可读，必填）', { exact: true }).fill('Survey synthetic feedback picture')
  check('survey-editor-native', await editor.locator('.bg-white').count() > 0 && await author.locator('.scale-raw-feedback,.hui-training').count() === 0)
  await layout(author, 'survey-editor', '#survey-authoring-definition')
  phase('survey-author-save'); const saved = await action(author, base + '/instruments/' + created.data.id, () => button(builder, '保存草稿').first().click(), 'PATCH')
  const definition = saved.request.postDataJSON().definition
  assert.deepEqual(saved.data.definition.items, definition.items, 'Survey saved quality item roundtrip')
  assert.deepEqual(saved.data.definition.rawScoreFeedback, definition.rawScoreFeedback, 'Survey saved feedback roundtrip')
  check('survey-quality-roundtrip', definition.items.filter(x => x.purpose && x.purpose !== 'CONTENT').every(x => x.dimensionKeys.length === 0 && !x.reverse) && definition.items.length === 3 && definition.rawScoreFeedback.rules[0].ranges[0].images[0].asset.assetId)
  phase('survey-publication'); await author.getByRole('tab', { name: /发布与采集/ }).click()
  const waves = author.getByRole('region', { name: '研究波次', exact: true })
  await waves.getByLabel('波次标题', { exact: true }).fill('Synthetic scale wave')
  await waves.getByLabel('参与说明与知情同意', { exact: true }).fill('Synthetic software acceptance only. Participation is voluntary; withdrawal is available. No personal data. Only descriptive raw-score feedback, not diagnosis.')
  await waves.getByLabel('通用完成反馈（不显示个人分数）', { exact: true }).fill('SYNTHETIC THANK YOU')
  await waves.getByRole('checkbox', { name: 'SCALE · Synthetic Survey scale', exact: true }).check()
  const wave = (await action(author, base + '/waves', () => button(waves, '创建波次').click())).data
  const feedback = waves.getByRole('region', { name: '受控原始指标反馈', exact: true })
  await feedback.getByRole('checkbox', { name: '启用 Synthetic Survey scale 的原始指标反馈', exact: true }).check()
  await feedback.getByRole('checkbox', { name: /^Synthetic Survey scale：Synthetic dimension/ }).check()
  const waveBase = base + '/waves/' + wave.id
  assert((await action(author, waveBase + '/preflight', () => button(waves, '检查知情同意与所有工具').click())).data.ok)
  await action(author, waveBase + '/prepare', () => button(waves, '冻结研究定义').click())
  const opened = (await action(author, waveBase + '/open', () => button(waves, '正式开放本轮').click())).data
  const url = new URL(opened.researchUrl); assert.equal(url.hostname, 'survey.eduk12.top'); assert(url.hash)
  check('survey-published', true)
  phase('survey-participant'); const participant = await newPage()
  await participant.goto(fixture.surveyUrl + url.pathname + url.search + url.hash)
  await button(participant, '选择本轮').click()
  await participant.getByRole('checkbox', { name: /我已阅读并同意本轮研究说明/ }).check()
  const task = await action(participant, /\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/task$/, () => button(participant, '开始或恢复本轮作答').click())
  assert(!JSON.stringify(task.data).includes('attentionTarget'), 'Public Survey task exposes target')
  for (let i = 0; i < 3; i++) {
    await participant.getByRole('radio', { name: i === 1 ? '不同意' : '非常不同意', exact: true }).check()
    if (i < 2) await button(participant, '下一题').click()
  }
  const surveyImage = participant.waitForResponse(r => r.request().method() === 'POST' && /\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/report-images\/[^/]+$/.test(new URL(r.url()).pathname))
  const [surveyImageResponse, final] = await Promise.all([surveyImage, action(participant, /\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/final$/, () => button(participant, '提交本轮正式回答').click())])
  assert.equal(final.data.status, 'COMPLETED')
  await participant.getByText('SURVEY RAW INTERVAL FEEDBACK', { exact: true }).waitFor()
  await participant.waitForFunction(() => [...document.images].some(i => i.alt === 'Survey synthetic feedback picture' && i.complete && i.naturalWidth > 0))
  assert.equal(surveyImageResponse.status(), 200); assert.match(surveyImageResponse.headers()['content-type'], /^image\/png/); assert((await surveyImageResponse.body()).length > 0)
  check('survey-final-report-image', true)
  phase('survey-image-authorization')
  const denied = await imageRequest(author, surveyImageResponse.url(), 'POST', {})
  assertDeniedImage(denied, 404); assert.equal(denied.length, 0)
  evidence.imageAuthorization.push({ name: 'survey-missing-proof', positiveStatus: surveyImageResponse.status(), deniedStatus: denied.status, deniedImage: denied.pngSignature || denied.jpegSignature || denied.webpSignature || /^image\//i.test(denied.contentType || ''), deniedLength: denied.length })
  check('survey-report-image-denies-missing-proof', true)
  await layout(participant, 'survey-report', '[aria-label="原始分描述性反馈"]')
  phase('survey-export'); await author.getByRole('tab', { name: /研究数据/ }).click()
  const analytics = author.getByRole('region', { name: '研究数据', exact: true })
  const overview = await action(author, base + '/analytics/overview', () => button(analytics, '刷新完成进度').click(), 'GET')
  assert.equal(overview.data.waves.find(x => x.id === wave.id).finalCompleted, 1)
  // Respect real TOTP replay protection: wait for a new wall-clock step, never fake clocks.
  while (Math.floor(Date.now() / 30000) <= loginStep) await author.waitForTimeout(Math.max(1, (loginStep + 1) * 30000 - Date.now() + 500))
  const stepUpCode = totpAt(fixture.researcher.totpSecretBase64)
  diagnosticSecrets.add(stepUpCode.code)
  assert(stepUpCode.step > loginStep, 'MFA step-up must use a later real counter')
  await analytics.getByLabel('最新 TOTP 动态验证码', { exact: true }).fill(stepUpCode.code)
  await action(author, '/api/survey/auth/mfa/step-up', () => button(analytics, '完成五分钟内二次认证').click())
  const section = analytics.locator('div.border.rounded-xl').filter({ has: author.getByRole('heading', { name: '匿名科研数据导出', exact: true }) })
  await section.getByRole('combobox', { name: '数据格式', exact: true }).selectOption('RAW_WAVE')
  await section.getByRole('combobox', { name: '波次', exact: true }).selectOption(wave.id)
  const ticket = (await action(author, base + '/exports', () => button(section, '创建受控导出').click())).data
  assert.equal(ticket.status, 'READY'); assert(ticket.nextCursor == null)
  const parts = []
  for (const [part, label] of [['csv', 'CSV'], ['codebook', 'Codebook'], ['manifest', 'Manifest']]) {
    phase('survey-export-' + part)
    const [download, response] = await Promise.all([
      author.waitForEvent('download'),
      action(author, base + '/exports/' + ticket.id + '/download', () => button(analytics, '下载 ' + label).click(), 'GET'),
    ])
    assert.equal(await download.failure(), null)
    const downloadedPath = await download.path(); assert(downloadedPath)
    parts.push({ part, artifact: response.data, filename: download.suggestedFilename(), text: fs.readFileSync(downloadedPath, 'utf8') })
  }
  const artifact = assertExportParts(parts, ticket)
  check('survey-raw-quality-export', true)
  evidence.export = { format: artifact.format, rowCount: artifact.manifest.rowCount, downloadedFiles: parts.length }
  await author.context().close(); await participant.context().close()
}
async function main() {
  phase('prerequisites')
  assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.NODE_ENV, 'test'); assert.equal(process.env.SCALE_AUTHORING_ISOLATED, '1')
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
  assert(process.env.RUNNER_TEMP && process.env.GITHUB_WORKSPACE)
  const privateRoot = path.resolve(process.env.RUNNER_TEMP, 'scale-authoring-private')
  const input = path.resolve(process.env.SCALE_AUTHORING_FIXTURE_FILE || '')
  assert.equal(input, path.join(privateRoot, 'fixture.json')); assert.equal(fs.realpathSync(input), input)
  assert.equal(fs.statSync(input).mode & 0o077, 0)
  fixture = JSON.parse(fs.readFileSync(input, 'utf8'))
  assert.equal(fixture.isolated, true); assert.equal(fixture.sourceCommit, process.env.GITHUB_SHA)
  assert(Date.now() - Date.parse(fixture.createdAt) < 3600000)
  output = path.resolve(process.env.SCALE_AUTHORING_EVIDENCE_DIR || '')
  assert.equal(output, path.resolve(process.env.GITHUB_WORKSPACE, 'scale-authoring-evidence/browser'))
  fs.mkdirSync(output, { recursive: true }); evidence.sourceCommit = process.env.GITHUB_SHA
  for (const [key, host] of [['trainingUrl', 'training.eduk12.top'], ['surveyUrl', 'survey.eduk12.top']]) {
    assert.equal(fixture[key], 'https://' + host + ':3189')
  }
  try {
    assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED, 'true')
    const profileHome = path.resolve(process.env.MEASUREMENT_BROWSER_PROFILE_HOME || '')
    assert(profileHome.startsWith(privateRoot + path.sep)); assert.equal(fs.realpathSync(profileHome), profileHome)
    assert(fs.lstatSync(profileHome).isDirectory() && !fs.lstatSync(profileHome).isSymbolicLink())
    phase('browser-launch')
    ;({ chromium } = require(process.env.SCALE_AUTHORING_PLAYWRIGHT_MODULE || '../backend/node_modules/playwright-core'))
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: profileHome }, executablePath: process.env.SCALE_AUTHORING_CHROMIUM_EXECUTABLE || chromium.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP training.eduk12.top 127.0.0.1, MAP survey.eduk12.top 127.0.0.1'] })
    evidence.browserVersion = browser.version()
    await trainingJourney(); await surveyJourney()
    check('desktop-mobile-layout', evidence.screenshots.length === 12)
    assert.equal(evidence.layoutChecks.length, 12)
    assert(evidence.layoutChecks.every(item => !item.overflow), 'Document overflow recorded in layoutChecks')
    assert(evidence.accessibility.every(item => item.violations.length === 0), 'WCAG violations recorded in accessibility')
    assert.equal(evidence.browserErrors.length, 0); assert.equal(evidence.blockedExternalRequests, 0); assert.equal(evidence.accessibility.length, 4)
    for (const name of REQUIRED) assert(evidence.checks.includes(name), 'Missing acceptance checkpoint ' + name)
    evidence.status = 'PASS'
  } catch (error) {
    evidence.status = 'FAIL'; evidence.failure = failureDetail(error); process.exitCode = 1
    save()
    if (activePage && !activePage.isClosed()) {
      try { await capture(activePage, 'failure-' + (evidence.phase || 'unknown'), activePage.viewportSize()?.width || 1440, true) }
      catch (captureError) { evidence.failureScreenshotError = { name: captureError.name }; save() }
    }
  }
  finally { if (browser) await browser.close(); save() }
}
if (require.main === module) main().catch(error => {
  evidence.status = 'FAIL'; evidence.failure = failureDetail(error)
  console.error('Scale browser failed:', JSON.stringify(evidence.failure))
  if (output) { try { save() } catch (writeError) { console.error('Evidence write failed:', JSON.stringify(failureDetail(writeError, 'evidence-write'))) } }
  process.exitCode = 1
})
module.exports = { totpAt, redactDiagnostics, failureDetail, assertDeniedImage, assertExportParts, REQUIRED }
