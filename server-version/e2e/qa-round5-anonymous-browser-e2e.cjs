/* Production frontend with deterministic API fixtures. Real PostgreSQL identity,
 * quota, FINAL and wave isolation are checked by anonymousStudy integration. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const browsers = require(process.env.PLAYWRIGHT_CORE_PATH || '../backend/node_modules/playwright-core')
const base = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.VISUAL_QA_EVIDENCE_DIR || '/tmp/eduk12-r5-anonymous'
const sid = '11111111-1111-4111-8111-111111111111'
const identity = 'i'.repeat(43)

async function scenario(browser, engine, width) {
  const contexts = [], attempts = new Map(), credentials = new Map(), errors = []
  let admitted = 0
  const state = attempt => {
    const done = attempt.answers.length === 2, index = attempt.answers.length
    return {
      id: attempt.id, assessmentId: 'synthetic-composite', name: '匿名两区段验收',
      status: done ? 'COMPLETED' : 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1, contextSnapshotHash: null, anonymousCode: attempt.code,
      progress: index * 50, completedItems: index, totalItems: 2, currentIndex: index,
      startedAt: '2026-10-07T00:00:00Z', completedAt: done ? '2026-10-07T00:01:00Z' : null,
      items: [0, 1].map(n => ({ id: 'section-' + n, type: 'FORM_SECTION', position: n, index: n, completed: n < index, label: '区段 ' + (n + 1) })),
      currentItem: done ? null : {
        id: 'section-' + index, formSectionId: 'section-' + index,
        type: 'FORM_SECTION', position: index, required: true,
        definitionHash: 'frozen-section-' + index, title: '区段 ' + (index + 1),
        contextSection: false,
        formAnswers: [{ formItemId: 'field-' + index, type: 'text_input', label: '合成回答 ' + (index + 1), required: true, value: null }],
      },
    }
  }
  async function newPage() {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    contexts.push(context)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname
      let data = { list: [] }, status = 200, message = 'ok'
      if (endpoint === '/api/capabilities') data = { cognitive: true, parentPortal: false }
      else if (endpoint === '/api/public/composite-assessments/closed') {
        status = 403; message = '综合测评未开放公开参与'
      } else if (endpoint === '/api/public/composite-assessments/open') {
        data = { id: 'synthetic-composite', name: '匿名两区段验收', instruction: '仅合成验收数据', items: [], studyEntryPath: '/public/studies/waves/wave/open' }
      } else if (endpoint === '/api/public/composite-assessments/open/start') {
        const resume = request.postDataJSON()?.recoveryToken
        let attempt = resume ? credentials.get(resume) : null
        if (resume && !attempt) { status = 403; message = '凭证不属于此链接' }
        else {
          if (!attempt) {
            const number = ++admitted
            attempt = { id: 'synthetic-attempt-' + number, code: 'ANON-SYNTH-' + number, credential: String(number).repeat(43), answers: [] }
            attempts.set(attempt.id, attempt); credentials.set(attempt.credential, attempt)
          }
          data = { attempt: state(attempt), recoveryToken: resume ? null : attempt.credential }
        }
      } else if (endpoint.startsWith('/api/public/composite-assessments/attempts/')) {
        const [, id, rest = ''] = endpoint.match(/attempts\/([^/]+)(.*)$/)
        const attempt = attempts.get(id)
        if (!attempt || request.headers()['x-recovery-token'] !== attempt.credential) { status = 403; message = '凭证不属于此记录' }
        else if (rest.endsWith('/submit')) {
          const payload = request.postDataJSON(), index = attempt.answers.length
          assert.equal(request.method(), 'POST')
          assert.equal(rest, `/form-sections/section-${index}/submit`)
          assert.equal(payload.definitionHash, 'frozen-section-' + index)
          assert.equal(payload.attemptEpoch, 1)
          assert.ok(payload.submissionId)
          assert.equal(payload.answers[0].formItemId, 'field-' + index)
          assert.ok(payload.answers[0].value)
          attempt.answers.push(payload.answers[0].value)
          data = { receiptId: 'synthetic-receipt-' + index }
        } else if (rest === '/report') {
          assert.equal(attempt.answers.length, 2)
          data = { id, assessmentId: 'synthetic-composite', name: '匿名两区段验收', productKind: 'QUESTIONNAIRE', reportMode: 'COLLECTION_ONLY', anonymousCode: attempt.code, completedAt: '2026-10-07T00:01:00Z', totalTime: 24, unitReports: [], backgroundValues: attempt.answers.map((value, n) => ({ itemId: 'field-' + n, label: '合成回答 ' + (n + 1), value, displayValue: value })) }
        } else data = state(attempt)
      } else if (endpoint.endsWith('/waves/wave/info')) {
        assert.equal(request.postDataJSON().token, 'open')
        data = { studyId: sid, studyTitle: '合成匿名研究', title: '第一波', accepting: true }
      } else if (endpoint.endsWith('/waves/wave/join')) {
        assert.equal(request.postDataJSON().consent, true)
        data = { studyId: sid, credential: identity, displayCode: 'P-SYNTH' }
      } else if (endpoint === `/api/public/anonymous-studies/${sid}`) {
        if (request.headers().authorization !== `Bearer ${identity}`) { status = 404; message = '身份码无效' }
        else data = { studyId: sid, title: '合成匿名研究', displayCode: 'P-SYNTH', limitations: ['历史报告不等于可比较的长期变化'], waves: [1, 2].map(n => ({ id: 'wave-' + n, title: '合成第 ' + n + ' 波', ordinal: n, attemptId: null, state: null, completedAt: null, accepting: true })) }
      } else if (request.method() !== 'GET') throw new Error('Unexpected mutation: ' + endpoint)
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : -1, message, data: status === 200 ? data : null }) })
    })
    return page
  }
  try {
    const first = await newPage()
    await first.goto(base + '/public/composite/closed')
    await first.getByRole('alert').waitFor()
    assert.equal(await first.getByRole('button', { name: '开始匿名测评' }).isEnabled(), false)
    assert.equal(admitted, 0)
    await first.goto(base + '/public/composite/open')
    const choice = first.getByRole('link', { name: '选择单次访客或保存研究内身份码' })
    await choice.waitFor(); assert.equal(admitted, 0)
    await first.getByRole('button', { name: '开始匿名测评' }).click()
    for (const n of [1, 2]) {
      await first.getByRole('textbox', { name: new RegExp('合成回答 ' + n) }).fill('合成答卷 A' + n)
      await first.getByRole('button', { name: '提交整个区段' }).click()
    }
    await first.getByText('ANON-SYNTH-1', { exact: true }).waitFor()
    assert.equal(attempts.get('synthetic-attempt-1').answers.length, 2)
    const saved = await first.evaluate(() => sessionStorage.getItem('composite:recovery:token:open'))
    assert.ok(saved)
    await first.reload()
    await first.getByText('ANON-SYNTH-1', { exact: true }).waitFor()

    const second = await newPage()
    await second.goto(base + '/public/composite/open')
    assert.equal(await second.evaluate(() => sessionStorage.getItem('composite:recovery:token:open')), null)
    await second.getByRole('button', { name: '开始匿名测评' }).click()
    await second.getByRole('textbox', { name: /合成回答 1/ }).waitFor()
    assert.equal(admitted, 2)
    assert.notEqual(await second.evaluate(() => sessionStorage.getItem('composite:recovery:token:open')), saved)

    const recovered = await newPage()
    await recovered.goto(base + '/public/composite/open')
    await recovered.getByPlaceholder('粘贴保存时获得的恢复凭证（可选）').fill(saved)
    await recovered.getByRole('button', { name: '继续作答' }).click()
    await recovered.getByText('ANON-SYNTH-1', { exact: true }).waitFor()
    assert.equal(admitted, 2, 'credential recovery does not create another attempt')
    await recovered.screenshot({ path: path.join(output, `${engine}-${width}-anonymous-recovery.png`), fullPage: true })

    const research = await newPage()
    await research.goto(base + '/public/composite/open')
    await research.getByRole('link', { name: '选择单次访客或保存研究内身份码' }).click()
    await research.getByRole('link', { name: '以单次访客开始' }).waitFor()
    const join = research.getByRole('button', { name: '创建研究内身份码' })
    assert.equal(await join.isEnabled(), false)
    await research.getByRole('checkbox').check(); await join.click()
    await research.getByText(identity, { exact: true }).waitFor()
    await research.getByRole('button', { name: '进入我的研究测评' }).click()
    await research.getByText('第 2 波：合成第 2 波', { exact: true }).waitFor()

    const otherDevice = await newPage()
    await otherDevice.goto(`${base}/public/studies/${sid}`)
    await otherDevice.getByLabel('已有身份码，恢复研究任务').fill(identity)
    await otherDevice.getByRole('button', { name: '用身份码进入' }).click()
    await otherDevice.getByText('第 2 波：合成第 2 波', { exact: true }).waitFor()
    assert.equal(await otherDevice.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    await otherDevice.screenshot({ path: path.join(output, `${engine}-${width}-study-identity.png`), fullPage: true })
    assert.deepEqual(errors, [])
    return { engine, width, closedEntry: true, visitorsIsolated: true, twoFinals: true, recoveryWithoutNewAttempt: true, studyChoice: true, identityOnFreshDevice: true }
  } catch (error) {
    const page = contexts[contexts.length - 1]?.pages()[0]
    if (page) {
      await page.screenshot({ path: path.join(output, `${engine}-${width}-anonymous-failure.png`), fullPage: true })
      console.error(JSON.stringify({ errors, page: await page.locator('body').innerText() }))
    }
    throw error
  } finally { for (const context of contexts) await context.close() }
}
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const engine = process.env.VISUAL_QA_BROWSER_ENGINE || 'chromium'
  const browser = await browsers[engine].launch({ headless: true })
  const results = []
  try { for (const width of [375, 768, 1280, 1920]) results.push(await scenario(browser, engine, width)) }
  finally { await browser.close() }
  fs.writeFileSync(path.join(output, `${engine}-anonymous.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ status: 'passed', engine, viewports: results.length, fixtures: 'public API; backend PostgreSQL checked separately' }))
})().catch(error => { console.error(error); process.exitCode = 1 })
