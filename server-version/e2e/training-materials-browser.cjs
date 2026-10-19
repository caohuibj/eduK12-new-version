/* Focused C20 acceptance against the exact tested dist and real HTTPS API.
 * This is not the four-tool C25 integration or C26 capacity qualification. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { chromium } = require('../backend/node_modules/playwright-core')
const { readSessionUser, sessionJsonFetch } = require('./helpers/session-auth.cjs')
const { fixture, runtimeDb, observe, ledger, drainReport, sha, inputDigests, sourceIdentity } = require('./training-materials-fixture.cjs')
const base = 'https://training.eduk12.top:5443'
const out = process.env.TRAINING_MATERIALS_EVIDENCE
assert.ok(out)
const f = fixture(), db = runtimeDb()
const receipt = { status: 'RUNNING', sourceIdentity: sourceIdentity(), source: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT, checks: [], screenshots: [], qualification: { C25: false, C26: false },
  scriptSha256: sha(fs.readFileSync(__filename)), inputDigests: inputDigests(),
  fixtureSha256: sha(fs.readFileSync(path.join(__dirname, 'training-materials-fixture.cjs'))) }
let stage = 'bootstrap', browser
const check = name => { stage = name; receipt.checks.push(name); console.log('PASS:', name) }
const ok = response => { assert.equal(response.status, 200); assert.equal(response.body.code, 0); return response.body.data }
const api = async (page, endpoint, method = 'GET', body, credential) => sessionJsonFetch(page, endpoint, {
  method, headers: { 'Content-Type': 'application/json', ...(credential ? { 'X-Recovery-Token': credential } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
async function login(page, user) {
  await page.goto(base + (user.role === 'TEACHER' ? '/teacher/account-login' : '/student/login'))
  await page.getByPlaceholder('请输入用户名').fill(user.username)
  await page.getByPlaceholder('请输入密码').fill(user.password)
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/training-login' && r.request().method() === 'POST')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  assert.equal((await response).status(), 200)
  const session = ok(await readSessionUser(page))
  assert.equal(session.id, user.id); assert.equal(session.role, user.role)
  await page.waitForURL(url => !url.pathname.endsWith('/login') && !url.pathname.endsWith('/account-login'))
}
async function createPublication(teacher, experimentKey, title) {
  let product = ok(await api(teacher, '/questionnaire-products', 'POST', { requestId: randomUUID(), name: title,
    questionnaireType: 'COURSE', courseIds: [f.courseId], publicEnabled: true, expiresAt: new Date(Date.now() + 3600000).toISOString() }))
  product = ok(await api(teacher, '/questionnaire-products/' + product.id + '/items', 'POST', { revision: product.revision,
    item: { type: 'FORM', formType: 'text_input', formLabel: 'C20 reflection', required: true } }))
  await teacher.goto(base + '/questionnaire-products/' + product.id)
  const region = teacher.getByRole('region', { name: '跨工具条件流程' })
  await region.getByLabel('启用跨工具条件流程', { exact: true }).check()
  await region.getByRole('button', { name: '启用两组材料实验', exact: true }).click()
  await region.getByRole('button', { name: '添加配额示例', exact: true }).click()
  const editor = region.getByLabel('流程 JSON（高级编辑）', { exact: true })
  const config = JSON.parse(await editor.inputValue())
  assert.equal(config.schemaVersion, 2)
  config.experiment = { experimentKey, linkedPolicy: 'KEEP_LINKED', groups: [
    { groupKey: 'a', weight: 1, materialTitle: 'C20 material A', materialBody: 'Only synthetic material A is assigned.' },
    { groupKey: 'b', weight: 1, materialTitle: 'C20 material B', materialBody: 'Only synthetic material B is assigned.' },
  ] }
  config.quotaPolicy = { schemaVersion: 1, groupLimits: { a: 1, b: 1 } }
  await editor.fill(JSON.stringify(config, null, 2))
  await region.getByLabel('最多作答次数（材料实验）', { exact: true }).fill('2')
  const saved = teacher.waitForResponse(r => new URL(r.url()).pathname === `/api/questionnaire-products/${product.id}/training-flow` && r.request().method() === 'POST')
  await region.getByRole('button', { name: '保存流程设置', exact: true }).click()
  assert.equal((await saved).status(), 200)
  await teacher.getByRole('button', { name: '发布前自检', exact: true }).click()
  await teacher.getByText('当前草稿自检通过', { exact: true }).waitFor()
  const published = teacher.waitForResponse(r => new URL(r.url()).pathname === `/api/questionnaire-products/${product.id}/publish` && r.request().method() === 'POST')
  await teacher.getByRole('button', { name: '发布组合测评', exact: true }).click()
  assert.equal((await published).status(), 200)
  product = ok(await api(teacher, '/questionnaire-products/' + product.id))
  assert.equal(product.status, 'PUBLISHED'); assert.equal(product.maxAttempts, 2)
  assert.deepEqual(product.trainingFlowFrozen.experiment, config.experiment)
  assert.deepEqual(product.trainingFlowFrozen.quotaPolicy, config.quotaPolicy)
  assert.match(product.trainingFlowDigest, /^[a-f0-9]{64}$/)
  await teacher.waitForFunction(() => document.getElementById('questionnaire-training-flow-json')?.readOnly === true)
  return product
}
async function showMaterial(page, expectedGroup, name) {
  const material = page.getByRole('region', { name: '课程流程材料' })
  await material.getByRole('heading', { name: 'C20 material ' + expectedGroup.toUpperCase(), exact: true }).waitFor()
  assert.equal(await material.getByText('Only synthetic material ' + (expectedGroup === 'a' ? 'B' : 'A') + ' is assigned.', { exact: true }).count(), 0)
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    const file = `${name}-${width}.png`
    // Material-only screenshots never include entry tokens or recovery credentials.
    await material.screenshot({ path: path.join(out, file) })
    receipt.screenshots.push({ file, width })
  }
}
async function causeLocalDraftConflict(page, attemptId) {
  // Explicit client-only negative case. No production DB facts or HTTP replies
  // are changed and this is not presented as an ordinary restart affordance.
  await page.evaluate(async id => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('eduk12-final-drafts-v1')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      await new Promise((resolve, reject) => {
        const tx = database.transaction('draftMeta', 'readwrite'), store = tx.objectStore('draftMeta')
        const request = store.getAll()
        request.onsuccess = () => {
          const matches = request.result.filter(row => row.attemptId === id)
          if (matches.length !== 1 || matches[0].status !== 'DRAFT' || matches[0].sealedSubmission) { tx.abort(); return }
          store.put({ ...matches[0], definitionHash: '0'.repeat(64) })
        }
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(new Error('Expected exactly one unsubmitted local draft'))
      })
    } finally { database.close() }
  }, attemptId)
  await page.reload()
}
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: ['--host-resolver-rules=MAP training.eduk12.top 127.0.0.1', '--no-proxy-server'] })
  let blocked = 0, errors = 0
  async function page() {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base) return route.continue()
      blocked++; return route.abort('blockedbyclient')
    })
    const result = await context.newPage(); result.setDefaultTimeout(20000)
    result.on('pageerror', () => { errors++ })
    return result
  }
  const teacher = await page(), first = await page(), second = await page(), filler = await page(), anonymous = await page()
  stage = 'real Training authentication'
  for (const [tab, name] of [[teacher, 'teacher'], [first, 'first'], [second, 'second'], [filler, 'filler']]) await login(tab, f.users[name])
  check('Real Training login and exact actor/session roles')
  stage = 'UI authoring and publication'
  const key = 'c20-ci-' + f.suffix
  const p1 = await createPublication(teacher, key, 'C20 first publication')
  const p2 = await createPublication(teacher, key, 'C20 linked publication')
  const pa = await createPublication(teacher, key + '-anonymous', 'C20 anonymous publication')
  check('Real revisioned authoring, V2 editor, quota/maxAttempts, preflight, publish and frozen read-only UI')
  stage = 'linked allocations'
  const initial = []
  for (const tab of [first, second]) {
    const response = ok(await api(tab, `/composite-assessments/${p1.id}/attempts`, 'POST', {}))
    initial.push(await observe(db, response.attempt.id))
  }
  assert.notEqual(initial[0].assignment.groupKey, initial[1].assignment.groupKey)
  const filled = ok(await api(filler, `/composite-assessments/${p2.id}/attempts`, 'POST', {}))
  const fill = await observe(db, filled.attempt.id)
  const blockedIndex = initial.findIndex(row => row.assignment.groupKey === fill.assignment.groupKey)
  const allowedIndex = 1 - blockedIndex, tabs = [first, second]
  const beforeDenial = await ledger(db, [p1.id, p2.id])
  assert.equal((await api(tabs[blockedIndex], `/composite-assessments/${p2.id}/attempts`, 'POST', {})).status, 409)
  assert.deepEqual(await ledger(db, [p1.id, p2.id]), beforeDenial)
  const linked = ok(await api(tabs[allowedIndex], `/composite-assessments/${p2.id}/attempts`, 'POST', {}))
  const inherited = await observe(db, linked.attempt.id)
  assert.equal(inherited.assignment.groupKey, initial[allowedIndex].assignment.groupKey)
  assert.equal(inherited.assignment.experimentId, initial[allowedIndex].assignment.experimentId)
  assert.equal(inherited.assignment.algorithm, 'LINKED_INHERIT_V1')
  assert.notEqual(inherited.assignment.claimId, initial[allowedIndex].assignment.claimId)
  assert.equal(inherited.claim.inheritedFromClaimId, initial[allowedIndex].claim.id)
  assert.equal(await db.trainingMaterialSubjectBinding.count({ where: { experimentId: inherited.assignment.experimentId,
    participantKey: inherited.assignment.participantKey } }), 1)
  check('KEEP_LINKED keeps one binding and original group across publications; a full inherited group fails without consuming free capacity')
  stage = 'anonymous admission and material display'
  const token = ok(await api(teacher, `/composite-assessments/${pa.id}/public-tokens`, 'POST', {
    expiresAt: new Date(Date.now() + 1800000).toISOString(), maxUses: 1 }))
  await anonymous.goto(base + '/public/composite/' + token.token)
  const startResponse = anonymous.waitForResponse(r => new URL(r.url()).pathname.endsWith('/start') && r.request().method() === 'POST')
  await anonymous.getByRole('button', { name: '开始匿名测评', exact: true }).click()
  const started = ok({ status: (await startResponse).status(), body: await (await startResponse).json() })
  const original = await observe(db, started.attempt.id), oldCredential = started.recoveryToken
  await showMaterial(anonymous, original.assignment.groupKey, 'assigned-material')
  const beforeContinue = await ledger(db, [pa.id])
  await anonymous.getByRole('region', { name: '课程流程材料' }).getByRole('button', { name: '继续', exact: true }).click()
  await anonymous.locator('.form-player textarea').waitFor()
  assert.deepEqual(await ledger(db, [pa.id]), beforeContinue)
  assert.equal((await observe(db, original.row.id)).facts.length, 0)
  check('Assigned material precedes the actual Form at 390/768/1440; Continue creates no FINAL or quota write')
  stage = 'explicit IndexedDB conflict and real restart'
  await causeLocalDraftConflict(anonymous, original.row.id)
  await anonymous.getByRole('region', { name: '课程流程材料' }).getByRole('button', { name: '继续', exact: true }).click()
  await anonymous.evaluate(() => sessionStorage.setItem('composite:recovery:token:unrelated-ci-case', 'unrelated-ci-credential'))
  const beforeRestart = await ledger(db, [pa.id])
  const restartResponse = anonymous.waitForResponse(r => new URL(r.url()).pathname.endsWith('/restart') && r.request().method() === 'POST')
  await anonymous.getByRole('button', { name: '重启并继续', exact: true }).click()
  const restarted = ok({ status: (await restartResponse).status(), body: await (await restartResponse).json() })
  await anonymous.waitForURL(url => url.pathname === '/public/composite/attempts/' + restarted.attempt.id)
  const replacement = await observe(db, restarted.attempt.id), newCredential = restarted.recoveryToken
  assert.notEqual(newCredential, oldCredential)
  assert.equal(replacement.row.participantKey, original.row.participantKey)
  assert.equal(replacement.row.attemptNo, original.row.attemptNo + 1)
  assert.equal(replacement.row.attemptEpoch, original.row.attemptEpoch + 1)
  assert.equal((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: original.row.id } })).recoveryTokenHash, null)
  for (const key of ['claimId', 'groupKey', 'participantKey', 'materialDigest', 'algorithm']) assert.equal(replacement.assignment[key], original.assignment[key])
  assert.notEqual(replacement.assignment.assignmentHash, original.assignment.assignmentHash)
  const afterRestart = await ledger(db, [pa.id])
  assert.deepEqual(afterRestart.claims, beforeRestart.claims); assert.deepEqual(afterRestart.buckets, beforeRestart.buckets)
  assert.deepEqual(afterRestart.tokens, beforeRestart.tokens); assert.equal(afterRestart.tokens[0].usedCount, 1)
  const caches = await anonymous.evaluate(() => ({ ...sessionStorage }))
  assert.equal(caches['composite:recovery:attempt:' + original.row.id], undefined)
  assert.equal(caches['composite:recovery:attempt:' + replacement.row.id], newCredential)
  assert.equal(caches['composite:recovery:token:' + token.token], newCredential)
  assert.equal(caches['composite:recovery:token:unrelated-ci-case'], 'unrelated-ci-credential')
  assert.equal(caches['composite:recovery:token:'], undefined)
  const staleBody = { submissionId: randomUUID(), attemptEpoch: started.attempt.attemptEpoch,
    definitionHash: started.attempt.currentItem.definitionHash, contextSnapshotHash: started.attempt.contextSnapshotHash,
    answers: started.attempt.currentItem.answers.map(answer => ({ formItemId: answer.formItemId, value: 'stale unauthorized answer' })) }
  for (const id of [original.row.id, replacement.row.id]) {
    const response = await api(anonymous, `/public/composite-assessments/attempts/${id}`, 'GET', undefined, oldCredential)
    assert.ok([403, 404].includes(response.status))
  }
  const retired = await api(anonymous, `/public/composite-assessments/attempts/${original.row.id}/form-sections/${started.attempt.currentItem.id}/submit`, 'POST', staleBody, oldCredential)
  assert.ok([403, 404, 409].includes(retired.status))
  assert.equal((await api(anonymous, `/public/composite-assessments/attempts/${replacement.row.id}/restart`, 'POST', {}, newCredential)).status, 409)
  assert.deepEqual(await ledger(db, [pa.id]), afterRestart)
  assert.equal(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: { in: [original.row.id, replacement.row.id] } } }), 0)
  await anonymous.reload()
  await anonymous.getByRole('region', { name: '课程流程材料' }).getByRole('button', { name: '继续', exact: true }).click()
  await anonymous.locator('.form-player textarea').waitFor()
  check('Client-only draft conflict exercises real restart: rotated cache survives reload; retired authority rejected; same quota/claim and ABANDONED attempt budget retained')
  stage = 'real Form FINAL and replay'
  await anonymous.locator('.form-player textarea').fill('C20 real browser FINAL')
  const finalResponse = anonymous.waitForResponse(r => /\/form-sections\/[^/]+\/submit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await anonymous.getByRole('button', { name: '提交整个区段', exact: true }).click()
  const accepted = await finalResponse
  assert.equal(accepted.status(), 200)
  const finalBody = accepted.request().postDataJSON()
  const finalRoute = new URL(accepted.url()).pathname.slice('/api'.length)
  const acceptedState = await observe(db, replacement.row.id)
  assert.equal(acceptedState.facts.length, 1); assert.equal(acceptedState.jobs.length, 1)
  assert.equal(ok(await api(anonymous, finalRoute, 'POST', finalBody, newCredential)).replayed, true)
  assert.deepEqual((await observe(db, replacement.row.id)).facts, acceptedState.facts)
  await drainReport(db, replacement.row.id)
  const completed = ok(await api(anonymous, `/public/composite-assessments/attempts/${replacement.row.id}`, 'GET', undefined, newCredential))
  assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.trainingFlow.termination, 'COMPLETE')
  const completedState = await observe(db, replacement.row.id)
  assert.equal(completedState.row.taskSatisfaction, 'SATISFIED')
  assert.equal(completedState.jobs.length, 1); assert.equal(completedState.jobs[0].status, 'READY')
  assert.deepEqual(completedState.facts, acceptedState.facts)
  const completedLedger = await ledger(db, [pa.id])
  assert.equal((await api(anonymous, `/public/composite-assessments/attempts/${replacement.row.id}/restart`, 'POST', {}, newCredential)).status, 409)
  assert.deepEqual(await ledger(db, [pa.id]), completedLedger)
  const report = ok(await api(anonymous, `/public/composite-assessments/attempts/${replacement.row.id}/report`, 'GET', undefined, newCredential))
  assert.ok(report)
  check('Actual Form FINAL/replay preserves one fact; original restricted-role report worker produces READY and COMPLETED; accepted FINAL cannot restart')
  assert.equal(blocked, 0, 'No unexpected outbound browser request')
  assert.equal(errors, 0, 'No browser page error')
  receipt.status = 'PASSED'
}
main().catch(() => { receipt.status = 'FAILED'; receipt.failedStage = stage;
  console.error('C20 browser acceptance failed at ' + stage + '; credentials and payloads withheld'); process.exitCode = 1
}).finally(async () => {
  await browser?.close(); await db.$disconnect()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(receipt, null, 2))
})
